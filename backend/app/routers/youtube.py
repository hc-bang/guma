import os
import tempfile
import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
import yt_dlp

# ffmpeg 바이너리 자동 로딩 (imageio-ffmpeg 지원)
FFMPEG_PATH = None
try:
    import imageio_ffmpeg
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    pass

router = APIRouter(
    prefix="/api/youtube",
    tags=["YouTube Downloader"]
)

class VideoInfoRequest(BaseModel):
    url: str

class ChannelRequest(BaseModel):
    channel_url: str = "https://www.youtube.com/@RSBilliards/videos"
    limit: int = 10
    offset: int = 0

def cleanup_file(path: str):
    """다운로드 완료 후 임시 파일을 삭제합니다."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"임시 파일 삭제 실패 ({path}): {e}")

@router.post("/info")
def get_video_info(req: VideoInfoRequest):
    """
    유튜브 URL의 영상 메타데이터(제목, 썸네일, 재생시간, 채널명, 조회수, 등록일, 화질)를 추출합니다.
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="유효한 유튜브 URL을 입력하세요.")

    ydl_opts = {
        'dump_single_json': True,
        'no_warnings': True,
        'quiet': True,
        'no_check_certificates': True,
        'http_headers': {
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        'extractor_args': {
            'youtube': {
                'lang': ['ko']
            }
        }
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            
            # 업로드 날짜 포맷팅 (YYYYMMDD -> YYYY-MM-DD)
            raw_date = info.get("upload_date", "")
            upload_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}" if len(raw_date) == 8 else ""

            # 화질 정보 계산
            height = info.get("height") or 0
            if height >= 2160:
                quality = "4K Ultra HD"
            elif height >= 1440:
                quality = "2K QHD"
            elif height >= 1080:
                quality = "1080p FHD"
            elif height >= 720:
                quality = "720p HD"
            elif height > 0:
                quality = f"{height}p"
            else:
                quality = "HD"

            return {
                "success": True,
                "title": info.get("title", "제목 없음"),
                "thumbnail": info.get("thumbnail", ""),
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", "알 수 없는 채널"),
                "view_count": info.get("view_count", 0),
                "upload_date": upload_date,
                "quality": quality,
                "url": req.url
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"유튜브 영상 분석 실패: {str(e)}")

@router.post("/channel")
def get_channel_videos(req: ChannelRequest):
    """
    유튜브 채널 URL의 최근 동영상 리스트를 페이징(offset, limit)하여 추출합니다.
    """
    if not req.channel_url or not req.channel_url.strip():
        return {
            "success": True,
            "channel_title": "",
            "videos": [],
            "has_more": False,
            "offset": 0,
            "limit": 0
        }

    raw_url = req.channel_url.strip()
    if raw_url.startswith("@"):
        raw_url = f"https://www.youtube.com/{raw_url}"
    elif not raw_url.startswith("http"):
        raw_url = f"https://www.youtube.com/{raw_url}"

    base_url = raw_url.split("?")[0].rstrip("/")
    if not base_url.endswith("/videos"):
        base_url += "/videos"

    query_part = raw_url.split("?")[1] if "?" in raw_url else ""
    if "hl=" not in query_part:
        query_part = (query_part + "&hl=ko&gl=KR").lstrip("&")

    url = f"{base_url}?{query_part}"

    limit = req.limit or 10
    offset = req.offset or 0
    target_count = offset + limit + 1  # has_more 탐색을 위해 1개 더 수집

    ydl_opts = {
        'extract_flat': True,
        'playlistend': max(target_count * 4, 30),  # 멤버십 전용 스킵을 고려해 충분한 개수 탐색
        'ignoreerrors': True,
        'quiet': True,
        'no_warnings': True,
        'no_check_certificates': True,
        'http_headers': {
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        'extractor_args': {
            'youtube': {
                'lang': ['ko']
            }
        }
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as ex:
                if "/videos" in url:
                    fallback_url = url.replace("/videos", "")
                    info = ydl.extract_info(fallback_url, download=False)
                else:
                    raise ex

            entries = info.get("entries", []) or []
            
            all_videos = []
            for e in entries:
                if not e:
                    continue
                
                vid = e.get("id") or ""
                v_title = e.get("title", "제목 없음")
                
                # 멤버십/회원 전용 영상 필터링 (다운로드 불가능한 영상 제외)
                availability = e.get("availability")
                is_subscriber_only = availability in ("subscriber_only", "needs_auth", "unlisted_subscriber_only")
                title_has_member_kw = any(kw in v_title.lower() for kw in ["멤버십", "회원전용", "멤버 전용", "rs 멤버"])

                if is_subscriber_only or title_has_member_kw:
                    continue
                
                v_url = e.get("url") if e.get("url") and "http" in e.get("url") else f"https://www.youtube.com/watch?v={vid}"
                
                thumb = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                if e.get("thumbnails") and len(e["thumbnails"]) > 0:
                    thumb = e["thumbnails"][-1].get("url", thumb)

                timestamp = e.get("timestamp")
                upload_date = ""
                if timestamp:
                    upload_date = datetime.datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d")

                all_videos.append({
                    "id": vid,
                    "title": v_title,
                    "url": v_url,
                    "thumbnail": thumb,
                    "duration": e.get("duration", 0),
                    "view_count": e.get("view_count", 0),
                    "upload_date": upload_date
                })

                if len(all_videos) >= target_count:
                    break

            sliced_videos = all_videos[offset : offset + limit]
            has_more = len(all_videos) > (offset + limit)

            return {
                "success": True,
                "channel_title": info.get("title") or "유튜브 채널",
                "videos": sliced_videos,
                "has_more": has_more,
                "offset": offset,
                "limit": limit
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"채널 영상 추출 실패: 채널 핸들/URL을 확인하세요. ({str(e)})")

@router.get("/download")
def download_video(url: str, format_type: str = "mp4", background_tasks: BackgroundTasks = None):
    """
    선택한 유튜브 포맷(mp4 비디오 또는 mp3 오디오)으로 변환/다운로드하여 스트리밍 파일을 반환합니다.
    """
    if not url:
        raise HTTPException(status_code=400, detail="유효한 유튜브 URL이 필요합니다.")

    temp_dir = tempfile.gettempdir()
    out_tmpl = os.path.join(temp_dir, 'guma_yt_%(id)s_%(ext)s')

    if format_type.lower() == "mp3":
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_tmpl,
            'quiet': True,
            'no_warnings': True,
            'no_check_certificates': True,
        }
        if FFMPEG_PATH:
            ydl_opts['ffmpeg_location'] = FFMPEG_PATH
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        media_type = "audio/mpeg"
        default_ext = "mp3"
    else:
        # mp4 format
        if FFMPEG_PATH:
            format_spec = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        else:
            format_spec = 'best[ext=mp4]/best'

        ydl_opts = {
            'format': format_spec,
            'outtmpl': out_tmpl,
            'quiet': True,
            'no_warnings': True,
            'no_check_certificates': True,
        }
        if FFMPEG_PATH:
            ydl_opts['ffmpeg_location'] = FFMPEG_PATH
            ydl_opts['merge_output_format'] = 'mp4'

        media_type = "video/mp4"
        default_ext = "mp4"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video").replace("/", "_").replace("\\", "_")
            
            # 실제 생성된 파일 경로 찾기
            downloaded_file = ydl.prepare_filename(info)
            
            # mp3 변환 후 확장자 보정
            if format_type.lower() == "mp3" and FFMPEG_PATH:
                base, _ = os.path.splitext(downloaded_file)
                downloaded_file = base + ".mp3"

            if not os.path.exists(downloaded_file):
                # 백업: temp_dir 내에서 패턴에 맞는 파일 탐색
                video_id = info.get("id", "")
                files = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.startswith(f"guma_yt_{video_id}")]
                if files:
                    downloaded_file = files[0]
                else:
                    raise HTTPException(status_code=500, detail="다운로드된 파일을 찾을 수 없습니다.")

            clean_filename = f"{title}.{default_ext}"

            # 백그라운드 태스크로 파일 다운로드 후 임시 파일 자동 삭제
            if background_tasks:
                background_tasks.add_task(cleanup_file, downloaded_file)

            return FileResponse(
                path=downloaded_file,
                filename=clean_filename,
                media_type=media_type
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"유튜브 다운로드 실패: {str(e)}")
