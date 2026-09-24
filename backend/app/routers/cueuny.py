"""
GUMA™ 큐스코 큐니(CUEUNY) 리플레이 API 라우터 (100% 파일 시스템 & 사이드카 JSON 기반)
- /api/cueuny/status: 시스템 상태, 세션 유효성, 크론 스케줄 정보, 스토리지 파일 통계
- /api/cueuny/list: 저장된 리플레이 목록 10건 페이징 조회
- /api/cueuny/sync: m.cueuny.com 즉시 스크래핑 및 다운로드 큐 동기화
- /api/cueuny/download/{seq}: 특정 영상 다운로드 트리거
- /api/cueuny/download-all: 대기 중인 모든 영상 순차 다운로드 트리거
- /api/cueuny/video/{seq}: HTML5 비디오 스트리밍
- /api/cueuny/file/{seq}: 비디오 파일 브라우저 다운로드
"""

import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse

try:
    from app.services.cueuny_service import (
        fetch_and_sync_replays,
        download_single_replay,
        trigger_background_download,
        get_cueuny_status,
        get_verified_completed_replays,
        get_cueuny_storage_dir,
        get_replay_metadata
    )
    from app.services.cueuny_scheduler import get_next_run_time
except ImportError:
    from backend.app.services.cueuny_service import (
        fetch_and_sync_replays,
        download_single_replay,
        trigger_background_download,
        get_cueuny_status,
        get_verified_completed_replays,
        get_cueuny_storage_dir,
        get_replay_metadata
    )
    from backend.app.services.cueuny_scheduler import get_next_run_time

logger = logging.getLogger("guma.cueuny.router")
router = APIRouter(prefix="/api/cueuny", tags=["cueuny"])


@router.get("/status")
def api_cueuny_status():
    """큐니 서비스 상태, 세션 유효성, 다음 스케줄 시각, 다운로드 진행도 조회"""
    status = get_cueuny_status()
    status["next_run_at"] = get_next_run_time()
    return status


@router.get("/list")
def api_cueuny_list(
    limit: int = 10,
    offset: int = 0,
    refresh: bool = False,
    q: Optional[str] = None,
    year: Optional[str] = None,
    month: Optional[str] = None,
    club: Optional[str] = None,
    opponent: Optional[str] = None,
    result: Optional[str] = None,
    min_avg: Optional[float] = None,
    max_avg: Optional[float] = None,
    min_hr: Optional[int] = None,
    min_duration: Optional[int] = None,
    max_duration: Optional[int] = None,
    min_innings: Optional[int] = None,
    max_innings: Optional[int] = None,
):
    """
    서버 스토리지에 실제로 온전히 다운로드 완료된 물리 파일 영상을 다차원 조건으로 검색/필터링하여 최신순 반환
    (마스터 인덱스 기반 1ms 초고속 응답, refresh=True 시 디스크 스캔 및 캐시 강제 재동기화)
    """
    res = get_verified_completed_replays(
        limit=limit,
        offset=offset,
        force_refresh=refresh,
        q=q,
        year=year,
        month=month,
        club=club,
        opponent=opponent,
        result=result,
        min_avg=min_avg,
        max_avg=max_avg,
        min_hr=min_hr,
        min_duration=min_duration,
        max_duration=max_duration,
        min_innings=min_innings,
        max_innings=max_innings,
    )
    res["success"] = True
    res["count"] = len(res.get("items", []))
    return res



@router.post("/sync")
def api_cueuny_sync():
    """m.cueuny.com에서 최신 리플레이 목록 즉시 수집 및 신규 영상 자동 다운로드 큐 시작"""
    result = fetch_and_sync_replays()
    return result


@router.post("/download/{replay_seq}")
def api_cueuny_download(replay_seq: str, background_tasks: BackgroundTasks):
    """특정 리플레이 영상 다운로드 요청 (백그라운드 처리)"""
    background_tasks.add_task(download_single_replay, replay_seq)
    return {
        "success": True,
        "message": f"리플레이({replay_seq}) 다운로드가 시작되었습니다."
    }


@router.post("/download-all")
def api_cueuny_download_all():
    """아직 로컬에 저장되지 않은 모든 리플레이 순차 다운로드 큐 시작"""
    trigger_background_download()
    return {
        "success": True,
        "message": "전체 대기 영상의 순차 다운로드가 시작되었습니다."
    }


@router.get("/video/{replay_seq}")
def api_cueuny_video(replay_seq: str):
    """
    HTML5 비디오 플레이어를 위한 영상 스트리밍 엔드포인트
    1. 로컬 storage/cueuny/에 파일이 존재하면 로컬 파일(206 Partial Content Range 지원) 반환
    2. 로컬 파일이 아직 없으면 메타데이터의 원본 HTTP 영상 URL로 즉시 307 Temporary Redirect
    """
    storage_dir = get_cueuny_storage_dir()
    for candidate_name in [f"{replay_seq}.mp4", replay_seq]:
        cand_path = os.path.join(storage_dir, candidate_name)
        if os.path.isfile(cand_path) and os.path.getsize(cand_path) > 1024 * 1024:
            return FileResponse(
                path=cand_path,
                media_type="video/mp4",
                filename=os.path.basename(cand_path)
            )

    meta = get_replay_metadata(replay_seq)
    if meta:
        local_path = meta.get("local_path")
        if local_path and os.path.isfile(local_path):
            return FileResponse(
                path=local_path,
                media_type="video/mp4",
                filename=os.path.basename(local_path)
            )

        mp4_url = meta.get("mp4_url")
        if mp4_url:
            return RedirectResponse(url=mp4_url, status_code=307)

    raise HTTPException(status_code=404, detail="재생 가능한 영상 파일 또는 주소가 없습니다.")


import re


def generate_friendly_filename(meta: Optional[dict], fallback_seq: str) -> str:
    """
    클라이언트가 다운로드할 때 한눈에 알아볼 수 있는 직관적인 파일명을 생성합니다.
    형식: [YYYYMMDD_HHMM] 당구장명 - 선수A(점수) vs 선수B(점수).mp4
    예시: [20260923_2236] 올라당구클럽 - 물주☆(16) vs 송아지(15).mp4
    """
    if not meta:
        return f"cueuny_{fallback_seq}.mp4"

    date_str = ""
    raw_date = meta.get("match_date", "")
    if raw_date:
        digits = re.sub(r"[^\d]", "", str(raw_date))
        if len(digits) >= 12:
            date_str = f"{digits[:8]}_{digits[8:12]}"
        elif len(digits) >= 8:
            date_str = digits[:8]
        else:
            date_str = digits

    club = (meta.get("club_name") or "당구장").strip()

    def clean_player_label(p: dict, fallback_name: str) -> str:
        name = (p.get("name") or fallback_name).strip()
        target = str(p.get("target_score") or "").strip()
        score = str(p.get("score") or "").strip()
        if target and name.endswith(f"({target})"):
            name = name[:-len(f"({target})")].strip()
        if score:
            return f"{name}({score})"
        return name

    pa = meta.get("player_a") or {}
    pb = meta.get("player_b") or {}
    label_a = clean_player_label(pa, "물주")
    label_b = clean_player_label(pb, "상대선수")

    parts = []
    if date_str:
        parts.append(f"[{date_str}]")
    if club:
        parts.append(club)
    parts.append(f"- {label_a} vs {label_b}")

    title = " ".join(parts).strip()
    if not title:
        title = f"cueuny_{fallback_seq}"

    # 파일 시스템 금지 특수문자 제거 (\ / : * ? " < > |)
    safe_title = re.sub(r'[\\/*?:"<>|]', '_', title)
    return f"{safe_title}.mp4"


@router.get("/file/{replay_seq}")
def api_cueuny_file(replay_seq: str):
    """
    브라우저 직접 파일 다운로드 엔드포인트
    한눈에 알아보기 쉬운 파일명([YYYYMMDD_HHMM] 클럽명 - 선수A(점수) vs 선수B(점수).mp4)으로 서빙
    """
    meta = get_replay_metadata(replay_seq)
    filename = generate_friendly_filename(meta, replay_seq)

    # 1. 메타데이터에 로컬 경로가 있고 파일이 존재하면 즉시 반환
    if meta:
        local_path = meta.get("local_path")
        if local_path and os.path.isfile(local_path):
            return FileResponse(
                path=local_path,
                media_type="application/octet-stream",
                filename=filename
            )

    # 2. 스토리지 디렉터리에서 후보 탐색
    storage_dir = get_cueuny_storage_dir()
    for dirpath, _, filenames in os.walk(storage_dir):
        for candidate in [f"{replay_seq}.mp4", replay_seq]:
            if candidate in filenames:
                cand_path = os.path.join(dirpath, candidate)
                if os.path.isfile(cand_path) and os.path.getsize(cand_path) > 1024 * 1024:
                    return FileResponse(
                        path=cand_path,
                        media_type="application/octet-stream",
                        filename=filename
                    )

    # 3. 로컬 파일이 없으면 원본 URL 리다이렉트
    if meta:
        mp4_url = meta.get("mp4_url")
        if mp4_url:
            return RedirectResponse(url=mp4_url, status_code=307)

    raise HTTPException(status_code=404, detail="다운로드 가능한 영상 파일이 없습니다.")

