"""
GUMA™ Torrent Downloader API Router
.torrent 파일 업로드, 실시간 상태 조회, 다운로드 취소 및 완료 파일 브라우저 스트리밍
"""

import os
import shutil
import zipfile
import tempfile
import urllib.parse
from typing import Dict, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from pydantic import BaseModel

try:
    from app.services import aria2_service
except ImportError:
    from backend.app.services import aria2_service

router = APIRouter(prefix="/api/torrent", tags=["Torrent Downloader"])




def cleanup_after_download(file_or_dir_path: str, gid: str):
    """브라우저로 다운로드 전송이 완료된 후 서버 내부의 임시 파일을 안전하게 영구 삭제합니다."""
    try:
        if os.path.isfile(file_or_dir_path):
            os.remove(file_or_dir_path)
            print(f"[Torrent Cleanup] 임시 파일 전송 완료 및 삭제: {file_or_dir_path}")
        elif os.path.isdir(file_or_dir_path):
            shutil.rmtree(file_or_dir_path, ignore_errors=True)
            print(f"[Torrent Cleanup] 임시 폴더 전송 완료 및 삭제: {file_or_dir_path}")

        # aria2c 결과 큐 및 디스크 잔여물 최종 청소
        aria2_service.cleanup_task_disk_files(gid)
        aria2_service.cancel_task(gid)
    except Exception as e:
        print(f"[Torrent Cleanup] 다운로드 완료 후 정리 오류 ({gid}): {e}")


from starlette.concurrency import run_in_threadpool

@router.post("/upload")
async def upload_torrent(file: UploadFile = File(...)):
    """
    .torrent 파일을 업로드받아 aria2c 다운로드 큐에 등록합니다.
    클라이언트가 업로드한 원본 .torrent 파일 바이트는 엔진에 전달된 즉시 메모리에서 소멸됩니다.
    """
    if not file.filename.lower().endswith(".torrent"):
        raise HTTPException(status_code=400, detail="유효한 .torrent 파일만 업로드할 수 있습니다.")

    try:
        content = await file.read()
        if not content or len(content) < 10:
            raise HTTPException(status_code=400, detail="토렌트 파일 내용이 비어 있거나 손상되었습니다.")

        # 메인 이벤트 루프 블로킹 방지를 위해 백그라운드 워커 스레드풀에서 안전하게 격리 실행
        res = await run_in_threadpool(aria2_service.add_torrent_bytes, content, original_filename=file.filename)
        gid = res.get("gid", "")
        is_dup = res.get("is_duplicate", False)
        status = res.get("task") or (await run_in_threadpool(aria2_service.get_task_status, gid) if gid else None)

        return {
            "success": True,
            "is_duplicate": is_dup,
            "gid": gid,
            "filename": file.filename,
            "task": status,
            "message": "이미 다운로드 목록에 등록되어 있는 토렌트입니다." if is_dup else "토렌트 다운로드가 시작되었습니다."
        }
    except Exception as e:
        err_msg = str(e)
        print(f"[Torrent Upload Error]: {err_msg}")
        raise HTTPException(status_code=500, detail=f"토렌트 등록 실패: {err_msg}")


@router.get("/status")
def get_all_torrent_status():
    """전체 작업 목록과 글로벌 다운로드/업로드 속도 현황을 반환합니다."""
    return aria2_service.get_all_tasks()


@router.get("/status/{gid}")
def get_single_torrent_status(gid: str):
    """특정 토렌트 작업의 실시간 진행률, 속도, 피어 수를 반환합니다."""
    task = aria2_service.get_task_status(gid)
    if not task:
        raise HTTPException(status_code=404, detail="해당 작업을 찾을 수 없습니다.")
    return task


@router.post("/cancel/{gid}")
def cancel_torrent_task(gid: str):
    """토렌트 다운로드 작업을 취소 또는 삭제 요청하고 백그라운드 워커에서 비동기 정리합니다."""
    res = aria2_service.request_cancel_or_delete_task(gid)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "작업 취소/삭제에 실패했습니다."))
    return res


@router.get("/download/{gid}")
def download_completed_torrent(gid: str, background_tasks: BackgroundTasks):
    """
    다운로드가 완료된 콘텐츠를 브라우저로 스트리밍 전송합니다.
    다중 파일인 경우 ZIP으로 묶어서 전송하며, 전송 완료 후 서버 임시 파일은 영구 삭제됩니다.
    """
    task = aria2_service.get_task_status(gid)
    if not task:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    if task.get("status") != "complete":
        raise HTTPException(status_code=400, detail=f"아직 다운로드가 완료되지 않았습니다. (현재 상태: {task.get('status')})")

    file_path = task.get("file_path", "")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="서버에 다운로드된 실제 결과물 파일을 찾을 수 없습니다.")

    is_dir = task.get("is_directory", False) or os.path.isdir(file_path)

    # 1. 다중 파일 또는 디렉터리인 경우: 전체 콘텐츠를 ZIP으로 압축하여 전송
    if is_dir:
        parent_dir = file_path if os.path.isdir(file_path) else os.path.dirname(file_path)
        folder_name = task.get("name") or os.path.basename(parent_dir)
        zip_filename = f"{folder_name}.zip"
        temp_zip_path = os.path.join(tempfile.gettempdir(), f"guma_torrent_{gid}.zip")

        try:
            with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, _, files in os.walk(parent_dir):
                    for f in files:
                        full_f = os.path.join(root, f)
                        arcname = os.path.relpath(full_f, os.path.dirname(parent_dir))
                        zipf.write(full_f, arcname)

            quoted_zipname = urllib.parse.quote(zip_filename)
            background_tasks.add_task(cleanup_after_download, temp_zip_path, gid)

            return FileResponse(
                path=temp_zip_path,
                filename=zip_filename,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename=\"{quoted_zipname}\"; filename*=UTF-8''{quoted_zipname}"
                }
            )
        except Exception as e:
            if os.path.exists(temp_zip_path):
                os.remove(temp_zip_path)
            raise HTTPException(status_code=500, detail=f"결과물 압축 중 오류 발생: {e}")

    # 2. 단일 파일인 경우: 원본 파일 그대로 스트리밍 전송
    if os.path.isfile(file_path):
        filename = os.path.basename(file_path)
        quoted_filename = urllib.parse.quote(filename)
        background_tasks.add_task(cleanup_after_download, file_path, gid)

        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename=\"{quoted_filename}\"; filename*=UTF-8''{quoted_filename}"
            }
        )

    raise HTTPException(status_code=404, detail="전송 가능한 파일을 찾을 수 없습니다.")


@router.post("/engine/start")
def start_engine():
    """aria2c 엔진을 수동으로 구동합니다."""
    started = aria2_service.start_daemon()
    return {
        "success": started,
        "is_ready": aria2_service.is_rpc_alive(),
        "port": aria2_service.ARIA2_RPC_PORT
    }
