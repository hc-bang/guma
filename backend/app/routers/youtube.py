import os
import tempfile
import datetime
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any
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

class ChannelItem(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    url: Optional[str] = None
    channel_id: Optional[str] = None

class FeedRequest(BaseModel):
    channels: List[ChannelItem] = []
    limit: int = 12
    offset: int = 0

# 채널 ID 및 통합 피드 런타임 캐시 (동적 학습 및 인메모리 보관)
CHANNEL_ID_CACHE: Dict[str, str] = {}
FEED_CACHE: Dict[Any, Dict[str, Any]] = {}

def resolve_channel_id(ch_url: str = "", ch_id: Optional[str] = None) -> Optional[str]:
    """
    채널 URL 또는 기존 ID로부터 고유 채널 ID(UC...)를 동적으로 추출하고 런타임 캐시합니다.
    특정 채널을 하드코딩하지 않고 완전 동적으로 동작합니다.
    """
    if ch_id and str(ch_id).startswith("UC"):
        return ch_id
    if not ch_url:
        return None

    clean_url = ch_url.split("?")[0].rstrip("/")
    if clean_url in CHANNEL_ID_CACHE:
        return CHANNEL_ID_CACHE[clean_url]

    # @핸들이나 단순 텍스트인 경우 유튜브 채널 URL로 보정
    target_url = clean_url
    if target_url.startswith("@"):
        target_url = f"https://www.youtube.com/{target_url}"
    elif not target_url.startswith("http"):
        target_url = f"https://www.youtube.com/@{target_url.lstrip('/')}"

    # 1. URL 자체에 /channel/UC... 가 포함되어 있는 경우 즉시 추출
    if "/channel/" in target_url:
        parts = target_url.split("/channel/")
        candidate = parts[1].split("/")[0]
        if candidate.startswith("UC"):
            CHANNEL_ID_CACHE[clean_url] = candidate
            return candidate

    # 2. 핸들(@) 또는 커스텀 URL인 경우 yt-dlp로 채널 메타데이터 1회 동적 해석
    try:
        ydl_opts = {
            'extract_flat': True,
            'playlistend': 1,
            'quiet': True,
            'no_warnings': True,
            'no_check_certificates': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            extracted_id = info.get('channel_id') or (info.get('id') if str(info.get('id', '')).startswith('UC') else None)
            if extracted_id:
                CHANNEL_ID_CACHE[clean_url] = extracted_id
                return extracted_id
    except Exception:
        pass

    return None

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
    클라우드/데이터센터 IP의 봇 차단(Sign in to confirm you're not a bot) 우회를 위해 모바일 클라이언트 및 oEmbed 폴백을 적용합니다.
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="유효한 유튜브 URL을 입력하세요.")

    clean_url = req.url.strip()

    # 1차 시도: yt-dlp 다중 클라이언트 (android, ios, mweb)로 봇 탐지 우회
    ydl_opts = {
        'dump_single_json': True,
        'no_warnings': True,
        'quiet': True,
        'no_check_certificates': True,
        'http_headers': {
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'mweb', 'web'],
                'lang': ['ko']
            }
        }
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
            
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
                "url": clean_url
            }
    except Exception as e:
        err_msg = str(e)
        if any(k in err_msg for k in ["회원 전용", "가입하여", "subscriber_only", "members-only", "Join this channel"]):
            raise HTTPException(status_code=403, detail="이 영상은 채널 유료 회원(멤버십) 전용 콘텐츠로, 일반 다운로드가 지원되지 않습니다.")

        # 2차 시도: 봇 차단(Sign in to confirm you're not a bot) 발생 시 유튜브 공식 oEmbed API로 무차단 폴백
        try:
            oe_url = f"https://www.youtube.com/oembed?url={clean_url}&format=json"
            oe_req = urllib.request.Request(oe_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(oe_req, timeout=5) as resp:
                oe_data = json.loads(resp.read().decode('utf-8'))
                
                vid_id = ""
                if "v=" in clean_url:
                    vid_id = clean_url.split("v=")[1].split("&")[0]
                elif "youtu.be/" in clean_url:
                    vid_id = clean_url.split("youtu.be/")[1].split("?")[0]
                
                thumb = oe_data.get("thumbnail_url") or (f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg" if vid_id else "")
                
                return {
                    "success": True,
                    "title": oe_data.get("title", "유튜브 동영상"),
                    "thumbnail": thumb,
                    "duration": 0,
                    "uploader": oe_data.get("author_name", "알 수 없는 채널"),
                    "view_count": 0,
                    "upload_date": "",
                    "quality": "HD",
                    "url": clean_url
                }
        except Exception:
            pass

        raise HTTPException(status_code=500, detail=f"유튜브 영상 분석 실패: {err_msg}")

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

    # 채널 ID가 캐시되어 있거나 식별 가능한 경우 RSS 우선 조회 (초고속 및 언어 보존)
    matched_ch_id = CHANNEL_ID_CACHE.get(raw_url.split("?")[0].rstrip("/"))
    if matched_ch_id and offset == 0 and limit <= 15:
        rss_vids = fetch_single_channel_feed(ChannelItem(channel_id=matched_ch_id, url=raw_url))
        if rss_vids:
            return {
                "success": True,
                "channel_title": rss_vids[0].get("channel_name", "유튜브 채널"),
                "videos": rss_vids[:limit],
                "has_more": len(rss_vids) > limit,
                "offset": offset,
                "limit": limit
            }

    ydl_opts = {
        'extract_flat': True,
        'playlistend': max(target_count * 4, 30),  # 멤버십 전용 스킵을 고려해 충분한 개수 탐색
        'ignoreerrors': True,
        'quiet': True,
        'no_warnings': True,
        'no_check_certificates': True,
        'http_headers': {
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cookie': 'PREF=hl=ko&gl=KR;'
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

def fetch_single_channel_feed(ch: ChannelItem) -> List[Dict[str, Any]]:
    ch_id = ch.channel_id
    ch_url = ch.url or ""
    ch_name = ch.name or ""
    
    # 1. 채널 ID 동적 해석 및 런타임 캐시 활용 (하드코딩 없음)
    ch_id = resolve_channel_id(ch_url, ch_id)

    # 핸들(@) 또는 커스텀 URL 보정
    target_ch_url = ch_url
    if target_ch_url:
        if target_ch_url.startswith("@"):
            target_ch_url = f"https://www.youtube.com/{target_ch_url}"
        elif not target_ch_url.startswith("http"):
            target_ch_url = f"https://www.youtube.com/@{target_ch_url.lstrip('/')}"

    # 3. 채널 ID로 YouTube Atom RSS 피드 조회 (언어 왜곡 없이 한국어 원본 보장)
    if ch_id:
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={ch_id}"
        req = urllib.request.Request(url)
        try:
            xml_data = urllib.request.urlopen(req, timeout=6).read()
            root = ET.fromstring(xml_data)
            ns = {
                'atom': 'http://www.w3.org/2005/Atom',
                'yt': 'http://www.youtube.com/xml/schemas/2015',
                'media': 'http://search.yahoo.com/mrss/'
            }
            channel_title = ch.name or (root.find('atom:title', ns).text if root.find('atom:title', ns) is not None else "유튜브 채널")
            videos = []
            for e in root.findall('atom:entry', ns):
                vid_el = e.find('yt:videoId', ns)
                vid = vid_el.text if vid_el is not None else ""
                title_el = e.find('atom:title', ns)
                title = title_el.text if title_el is not None else "제목 없음"
                
                if any(kw in title.lower() for kw in ["멤버십", "회원전용", "멤버 전용"]):
                    continue
                
                pub_el = e.find('atom:published', ns)
                pub = pub_el.text if pub_el is not None else ""
                
                thumb_elem = e.find('.//media:thumbnail', ns)
                thumb = thumb_elem.attrib['url'] if thumb_elem is not None and 'url' in thumb_elem.attrib else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                
                views_elem = e.find('.//media:statistics', ns)
                views = int(views_elem.attrib.get('views', 0)) if views_elem is not None else 0

                videos.append({
                    "id": vid,
                    "title": title,
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "published": pub,
                    "channel_name": ch.name or channel_title,
                    "channel_url": target_ch_url or (f"https://www.youtube.com/channel/{ch_id}" if ch_id else ""),
                    "thumbnail": thumb,
                    "view_count": views,
                    "duration": 0
                })
            if videos:
                return videos
        except Exception:
            pass

    # 4. RSS 실패 시 yt-dlp flat extraction 폴백 (한국어 강제 헤더 및 쿠키 설정)
    if target_ch_url:
        try:
            ydl_opts = {
                'extract_flat': True,
                'playlistend': 15,
                'quiet': True,
                'no_warnings': True,
                'no_check_certificates': True,
                'http_headers': {
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cookie': 'PREF=hl=ko&gl=KR;'
                },
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'ios', 'mweb', 'web'],
                        'lang': ['ko']
                    }
                }
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(target_ch_url, download=False)
                ch_title = ch.name or info.get("title") or "유튜브 채널"
                entries = info.get("entries") or []
                fallback_videos = []
                for entry in entries:
                    if not entry:
                        continue
                    
                    # 멤버십/회원 전용 영상 필터링 (다운로드 불가 영상 제외)
                    availability = entry.get("availability")
                    if availability in ("subscriber_only", "needs_auth", "unlisted_subscriber_only"):
                        continue

                    vid = entry.get("id") or ""
                    v_title = entry.get("title") or ""
                    if any(kw in v_title.lower() for kw in ["멤버십", "회원전용", "멤버 전용", "rs 멤버"]):
                        continue
                    thumb = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                    if entry.get("thumbnails") and len(entry["thumbnails"]) > 0:
                        thumb = entry["thumbnails"][-1].get("url", thumb)
                    fallback_videos.append({
                        "id": vid,
                        "title": v_title,
                        "url": entry.get("url") if entry.get("url") and "http" in entry.get("url") else f"https://www.youtube.com/watch?v={vid}",
                        "published": "",
                        "channel_name": ch_title,
                        "channel_url": target_ch_url or (f"https://www.youtube.com/channel/{ch_id}" if ch_id else ""),
                        "thumbnail": thumb,
                        "view_count": entry.get("view_count") or 0,
                        "duration": entry.get("duration") or 0
                    })
                return fallback_videos
        except Exception:
            pass

    return []

@router.post("/feed")
def get_subscription_feed(req: FeedRequest):
    """
    등록된 여러 유튜브 채널의 최신 영상을 채널 구분 없이 최신 발행일시 순으로 통합하여 페이징 반환합니다.
    """
    if not req.channels:
        return {
            "success": True,
            "videos": [],
            "total_count": 0,
            "has_more": False,
            "offset": 0,
            "limit": req.limit
        }

    cache_key = tuple(sorted((c.channel_id or c.url or "") for c in req.channels))
    cached = FEED_CACHE.get(cache_key)

    # 5분(300초) 이내 캐시 유효
    if cached and (time.time() - cached.get("timestamp", 0) < 300):
        all_videos = cached.get("videos", [])
    else:
        with ThreadPoolExecutor(max_workers=min(10, len(req.channels))) as executor:
            channel_results = list(executor.map(fetch_single_channel_feed, req.channels))
        
        all_videos = [v for sub in channel_results for v in sub]
        # published ISO 날짜 기준 내림차순(최신순) 정렬
        all_videos.sort(key=lambda x: x.get("published", ""), reverse=True)
        FEED_CACHE[cache_key] = {
            "timestamp": time.time(),
            "videos": all_videos
        }

    offset = req.offset or 0
    limit = req.limit or 12
    sliced = all_videos[offset : offset + limit]
    has_more = len(all_videos) > (offset + limit)

    return {
        "success": True,
        "videos": sliced,
        "total_count": len(all_videos),
        "has_more": has_more,
        "offset": offset,
        "limit": limit
    }

@router.get("/download")
def download_video(url: str, format_type: str = "mp4", background_tasks: BackgroundTasks = None):
    """
    선택한 유튜브 포맷(mp4 비디오 또는 mp3 오디오)으로 변환/다운로드하여 스트리밍 파일을 반환합니다.
    """
    if not url:
        raise HTTPException(status_code=400, detail="유효한 유튜브 URL이 필요합니다.")

    temp_dir = tempfile.gettempdir()
    out_tmpl = os.path.join(temp_dir, 'guma_yt_%(id)s_%(ext)s')

    base_ydl_opts = {
        'outtmpl': out_tmpl,
        'quiet': True,
        'no_warnings': True,
        'no_check_certificates': True,
        'http_headers': {
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'mweb', 'web'],
                'lang': ['ko']
            }
        }
    }

    if format_type.lower() == "mp3":
        ydl_opts = {
            **base_ydl_opts,
            'format': 'bestaudio/best',
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
            **base_ydl_opts,
            'format': format_spec,
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
