"""
GUMA™ 큐스코 큐니(CUEUNY) 마이 리플레이 수집 및 다운로드 서비스
- 100% 파일 시스템 & 사이드카 JSON 기반 (DB 의존성 전무)
- 마스터 인덱스(index.json) 및 초고속 인메모리 캐시 (1ms 이내 페이징 응답)
- 연도/월별 폴더 자동 분할 (storage/cueuny/YYYY/MM/...)
- 영상 1건씩 순차 안전 스트리밍 다운로드 (서버 부하 방지)
"""

import os
import re
import json
import shutil
import logging
import threading
from typing import Optional, Dict, Any, List
from urllib.parse import parse_qs
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()
_service_dir = os.path.dirname(os.path.abspath(__file__))
_app_dir = os.path.dirname(_service_dir)
_backend_dir = os.path.dirname(_app_dir)
_root_dir = os.path.dirname(_backend_dir)

for _p in [os.path.join(_root_dir, ".env"), os.path.join(_backend_dir, ".env")]:
    if os.path.isfile(_p):
        load_dotenv(_p, override=False)

logger = logging.getLogger("guma.cueuny")

# 1건씩 순차 다운로드를 위한 락 및 상태 관리
_download_lock = threading.Lock()
_pending_download_queue: List[Dict[str, Any]] = []

_current_download_info: Dict[str, Any] = {
    "is_downloading": False,
    "current_seq": None,
    "progress_percent": 0.0,
    "downloaded_bytes": 0,
    "total_bytes": 0
}

_last_sync_status: Dict[str, Any] = {
    "last_sync_at": None,
    "session_valid": None,  # None: 미확인, True: 정상, False: 만료/오류
    "last_error": None,
    "item_count": 0
}

# ── 초고속 인메모리 캐시 & 마스터 인덱스 관리 ────────────────────────────
_cache_lock = threading.Lock()
_replays_cache: List[Dict[str, Any]] = []
_replays_cache_by_seq: Dict[str, Dict[str, Any]] = {}
_cache_initialized = False


def get_cueuny_storage_dir() -> str:
    """영구 보관용 스토리지 루트 디렉터리 절대경로 반환 및 자동 생성"""
    configured_dir = os.getenv("CUEUNY_STORAGE_DIR", "storage/cueuny").strip()
    if not os.path.isabs(configured_dir):
        storage_path = os.path.normpath(os.path.join(_root_dir, configured_dir))
    else:
        storage_path = os.path.normpath(configured_dir)

    os.makedirs(storage_path, exist_ok=True)
    return storage_path


def get_target_storage_dir(match_date: Optional[str] = None) -> str:
    """
    경기 일시(예: '2026-09-23 20:15:12')를 분석하여
    storage/cueuny/YYYY/MM/ 경로를 생성 및 반환합니다.
    """
    root_storage = get_cueuny_storage_dir()
    year_str = datetime.now().strftime("%Y")
    month_str = datetime.now().strftime("%m")

    if match_date:
        m = re.search(r"(\d{4})[-/.]?(\d{2})", str(match_date))
        if m:
            year_str, month_str = m.group(1), m.group(2)

    target_dir = os.path.join(root_storage, year_str, month_str)
    os.makedirs(target_dir, exist_ok=True)
    return target_dir


def get_request_headers() -> Dict[str, str]:
    """큐니 요청 헤더 생성"""
    session = os.getenv("CUEUNY_SESSION", "").strip()
    login_id = os.getenv("CUEUNY_LOGIN_ID", "").strip()

    cookie_parts = []
    if login_id:
        cookie_parts.append(f"loginid={login_id}")
    if session:
        cookie_parts.append(f"session={session}")
    cookie_parts.append("bottomBanner=Y")

    return {
        "Cookie": "; ".join(cookie_parts),
        "X-Requested-With": "com.cuesco.cueny",
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 16; SM-S921N Build/DP4A.251205.086; wv) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 "
            "Chrome/153.0.8010.36 Mobile Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Cache-Control": "max-age=0"
    }


def _normalize_item_players(item_data: Dict[str, Any]) -> Dict[str, Any]:
    """사용자('물주')가 player_b에 있으면 player_a로 스왑하여 항상 좌측 배치 보장"""
    pa = item_data.get("player_a") or {}
    pb = item_data.get("player_b") or {}
    if "물주" in pb.get("name", "") and "물주" not in pa.get("name", ""):
        item_data["player_a"] = pb
        item_data["player_b"] = pa
    return item_data


def load_or_rebuild_index(force_rebuild: bool = False) -> List[Dict[str, Any]]:
    """
    마스터 인덱스(storage/cueuny/index.json)를 로드하거나 재구축하여
    인메모리 캐시를 최신 상태로 유지합니다. (수만 건이어도 메모리 접근 1ms)
    """
    global _replays_cache, _replays_cache_by_seq, _cache_initialized

    storage_root = get_cueuny_storage_dir()
    index_file = os.path.join(storage_root, "index.json")

    with _cache_lock:
        if not force_rebuild and _cache_initialized and os.path.isfile(index_file):
            return _replays_cache

        # 1. 인덱스 파일이 존재하고 재구축 강제가 아닐 때 빠른 로드
        if not force_rebuild and os.path.isfile(index_file):
            try:
                with open(index_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        _replays_cache = data
                        _replays_cache_by_seq = {}
                        for item in _replays_cache:
                            seq = item.get("replay_seq")
                            folder = item.get("record_folder")
                            if seq:
                                _replays_cache_by_seq[seq] = item
                            if folder:
                                _replays_cache_by_seq[folder] = item
                        _cache_initialized = True
                        return _replays_cache
            except Exception as e:
                logger.warning(f"[CUEUNY] index.json 로드 실패, 전체 디스크 스캔으로 재구축합니다: {e}")

        # 2. 전체 디스크 재귀 스캔 및 연/월별 마이그레이션
        verified_items = []
        seq_map = {}

        # 스토리지 내 모든 .mp4 및 .json 파일 탐색
        for dirpath, _, filenames in os.walk(storage_root):
            for fname in filenames:
                if not fname.lower().endswith(".mp4") or fname.endswith(".tmp"):
                    continue

                mp4_path = os.path.join(dirpath, fname)
                try:
                    size = os.path.getsize(mp4_path)
                except OSError:
                    continue

                if size <= 1024 * 1024:
                    continue

                stem = os.path.splitext(fname)[0]
                json_path = os.path.join(dirpath, f"{stem}.json")
                item_data = None

                if os.path.isfile(json_path):
                    try:
                        with open(json_path, "r", encoding="utf-8") as jf:
                            item_data = json.load(jf)
                    except Exception:
                        pass

                if not item_data:
                    mtime = os.path.getmtime(mp4_path)
                    mdate_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                    item_data = {
                        "replay_seq": stem,
                        "record_folder": stem,
                        "club_name": "당구클럽",
                        "match_date": mdate_str,
                        "player_a": {"name": "물주☆(25)", "score": "-", "target_score": "25"},
                        "player_b": {"name": "상대선수", "score": "-", "target_score": "-"}
                    }

                # 연도/월별 폴더로 자동 마이그레이션 (루트에 있는 파일 정리)
                target_folder = get_target_storage_dir(item_data.get("match_date"))
                if os.path.normpath(dirpath) != os.path.normpath(target_folder):
                    try:
                        new_mp4_path = os.path.join(target_folder, fname)
                        new_json_path = os.path.join(target_folder, f"{stem}.json")
                        if not os.path.exists(new_mp4_path):
                            shutil.move(mp4_path, new_mp4_path)
                            mp4_path = new_mp4_path
                        if os.path.isfile(json_path) and not os.path.exists(new_json_path):
                            shutil.move(json_path, new_json_path)
                            json_path = new_json_path
                    except Exception as me:
                        logger.warning(f"[CUEUNY] 파일 연/월 폴더 이동 실패 ({fname}): {me}")

                item_data["local_path"] = mp4_path
                item_data["file_size"] = size
                item_data["download_status"] = "completed"
                item_data = _normalize_item_players(item_data)

                # 사이드카 JSON 갱신 저장
                try:
                    with open(json_path, "w", encoding="utf-8") as jf:
                        json.dump(item_data, jf, ensure_ascii=False, indent=2, default=str)
                except Exception:
                    pass

                seq = item_data.get("replay_seq") or stem
                if seq not in seq_map:
                    seq_map[seq] = item_data
                    verified_items.append(item_data)

        # 경기 날짜 역순 정렬
        verified_items.sort(key=lambda x: str(x.get("match_date", "")), reverse=True)

        _replays_cache = verified_items
        _replays_cache_by_seq = {}
        for item in _replays_cache:
            seq = item.get("replay_seq")
            folder = item.get("record_folder")
            if seq:
                _replays_cache_by_seq[seq] = item
            if folder:
                _replays_cache_by_seq[folder] = item

        _cache_initialized = True

        # index.json 원자적 저장
        try:
            temp_index = f"{index_file}.tmp"
            with open(temp_index, "w", encoding="utf-8") as f:
                json.dump(_replays_cache, f, ensure_ascii=False, indent=2, default=str)
            if os.path.exists(index_file):
                os.remove(index_file)
            os.rename(temp_index, index_file)
        except Exception as e:
            logger.error(f"[CUEUNY] index.json 저장 실패: {e}")

        return _replays_cache


def get_replay_metadata(identifier: str) -> Optional[Dict[str, Any]]:
    """인메모리 캐시에서 1ms 만에 메타데이터 조회 (폴백으로 디스크 탐색)"""
    if not _cache_initialized:
        load_or_rebuild_index()

    item = _replays_cache_by_seq.get(identifier)
    if item:
        return item

    # 캐시에 없을 때 재귀 탐색 폴백
    storage_root = get_cueuny_storage_dir()
    for dirpath, _, filenames in os.walk(storage_root):
        target_name = f"{identifier}.json"
        if target_name in filenames:
            try:
                with open(os.path.join(dirpath, target_name), "r", encoding="utf-8") as jf:
                    return json.load(jf)
            except Exception:
                pass
    return None


def fetch_game_innings(replay_seq: str) -> List[Dict[str, Any]]:
    """
    m.cueuny.com/api/game_inninglist 엔드포인트에서
    해당 경기의 이닝별 득점 및 타임스탬프 상세 목록을 가져옵니다.
    """
    if not replay_seq:
        return []

    base_url = os.getenv("CUEUNY_BASE_URL", "http://m.cueuny.com").rstrip("/")
    url = f"{base_url}/api/game_inninglist"
    headers = get_request_headers()
    headers["X-Requested-With"] = "XMLHttpRequest"

    try:
        resp = requests.post(url, headers=headers, data={"gmdtSeq": replay_seq, "cnt": 1000}, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                return data
    except Exception as e:
        logger.warning(f"[CUEUNY] 이닝 정보 조회 실패 (seq: {replay_seq}): {e}")

    return []


def get_game_innings(identifier: str) -> List[Dict[str, Any]]:
    """
    특정 경기의 이닝별 상세 득점/시간 목록을 반환합니다.
    로컬 사이드카 .json에 캐시되어 있으면 즉시 반환하고,
    없을 경우 큐니 API에서 온디맨드로 조회하여 .json에 영구 저장합니다.
    """
    meta = get_replay_metadata(identifier)
    if not meta:
        return []

    # 이미 메타데이터에 이닝 상세 정보가 있는 경우
    if meta.get("innings_data"):
        return meta["innings_data"]

    replay_seq = meta.get("replay_seq") or identifier
    innings = fetch_game_innings(replay_seq)
    if innings:
        meta["innings_data"] = innings
        record_folder = meta.get("record_folder") or identifier
        match_date = meta.get("match_date", "")
        target_dir = get_target_storage_dir(match_date)
        json_path = os.path.join(target_dir, f"{record_folder}.json")

        if not os.path.isfile(json_path):
            storage_root = get_cueuny_storage_dir()
            for dirpath, _, filenames in os.walk(storage_root):
                if f"{record_folder}.json" in filenames:
                    json_path = os.path.join(dirpath, f"{record_folder}.json")
                    break

        try:
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(meta, jf, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"[CUEUNY] 이닝 정보 사이드카 저장 실패: {e}")

        # 인메모리 캐시 갱신
        with _cache_lock:
            for it in _replays_cache:
                if it.get("replay_seq") == replay_seq or it.get("record_folder") == record_folder:
                    it["innings_data"] = innings
                    break

    return innings


def fetch_and_sync_replays(game_type: str = "") -> Dict[str, Any]:
    """
    m.cueuny.com/park/mypark/replay 페이지를 조회하고,
    미다운로드 신규 영상을 스토리지 다운로드 대기 큐에 등록하여 자동 다운로드를 시작합니다.
    """
    global _last_sync_status, _pending_download_queue

    for _p in [os.path.join(_root_dir, ".env"), os.path.join(_backend_dir, ".env")]:
        if os.path.isfile(_p):
            load_dotenv(_p, override=True)

    session = os.getenv("CUEUNY_SESSION", "").strip()
    login_id = os.getenv("CUEUNY_LOGIN_ID", "").strip()

    if not session or not login_id:
        _last_sync_status["session_valid"] = False
        _last_sync_status["last_error"] = "CUEUNY_SESSION 또는 CUEUNY_LOGIN_ID 환경변수가 설정되지 않았습니다."
        logger.warning(f"[CUEUNY] {_last_sync_status['last_error']}")
        return {
            "success": False,
            "error": _last_sync_status["last_error"],
            "session_valid": False,
            "synced_count": 0
        }

    base_url = os.getenv("CUEUNY_BASE_URL", "http://m.cueuny.com").rstrip("/")
    url = f"{base_url}/park/mypark/replay"
    params = {}
    if game_type:
        params["type"] = game_type

    headers = get_request_headers()

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15, allow_redirects=True)
    except Exception as e:
        _last_sync_status["last_error"] = f"네트워크 요청 실패: {e}"
        logger.error(f"[CUEUNY] {url} 요청 중 오류: {e}")
        return {
            "success": False,
            "error": str(e),
            "session_valid": None,
            "synced_count": 0
        }

    resp.encoding = "utf-8"

    final_url = resp.url.lower()
    if resp.status_code in (401, 403) or "login" in final_url or ("로그인" in resp.text[:2000] and "scorebox" not in resp.text):
        _last_sync_status["session_valid"] = False
        _last_sync_status["last_error"] = "큐니 세션이 만료되었습니다. 새 CUEUNY_SESSION 쿠키를 .env에 등록해주세요."
        logger.warning("[CUEUNY] 큐스코 큐니 세션 만료 감지됨")
        return {
            "success": False,
            "error": _last_sync_status["last_error"],
            "session_valid": False,
            "synced_count": 0
        }

    _last_sync_status["session_valid"] = True
    _last_sync_status["last_error"] = None
    _last_sync_status["last_sync_at"] = datetime.now().isoformat()

    soup = BeautifulSoup(resp.text, "html.parser")
    scoreboxes = soup.select("div.scorebox")
    synced_items = []

    # 인덱스 초기화 보장
    if not _cache_initialized:
        load_or_rebuild_index()

    queued_seqs = {item.get("replay_seq") for item in _pending_download_queue}

    for box in scoreboxes:
        btn = box.select_one("button[data-mp4]")
        if not btn:
            continue

        mp4_url = btn.get("data-mp4", "").strip()
        deep_url = btn.get("data-url", "").strip()
        replay_seq = box.get("id", "").strip() or btn.get("data-seq", "").strip()

        qs = {}
        if "?" in deep_url:
            raw_qs = parse_qs(deep_url.split("?", 1)[1])
            qs = {k: v[0] for k, v in raw_qs.items()}

        record_folder = qs.get("recordFolder", "")
        if not record_folder and mp4_url:
            m = re.search(r"/record/([^/]+)/", mp4_url)
            if m:
                record_folder = m.group(1)

        strong_el = box.select_one("strong")
        club_name = ""
        match_date = ""
        duration = ""

        if strong_el:
            p_el = strong_el.select_one("p")
            if p_el:
                p_text = p_el.get_text(strip=True)
                m_dur = re.search(r"\(([^)]+)\)", p_text)
                if m_dur:
                    duration = m_dur.group(1)
                    match_date = p_text.replace(f"({duration})", "").strip()
                else:
                    match_date = p_text
            full_strong = strong_el.get_text(strip=True)
            if p_el:
                p_raw = p_el.get_text(strip=True)
                club_name = full_strong.replace(p_raw, "").strip()
            else:
                club_name = full_strong

        inn_el = box.select_one(".inn em, strong.inn")
        innings = ""
        if inn_el:
            innings = inn_el.get_text(strip=True).replace("INN", "").strip()

        player_divs = []
        for img_div in box.select("div.img"):
            pdiv = img_div.parent
            if pdiv and pdiv not in player_divs:
                player_divs.append(pdiv)

        players = []
        for pdiv in player_divs:
            is_winner = "win" in pdiv.get("class", [])
            score_el = pdiv.select_one(".score")
            score = ""
            target_score = ""
            if score_el:
                target_span = score_el.select_one("span")
                if target_span:
                    target_score = target_span.get_text(strip=True)
                score = score_el.get_text(strip=True)
                if target_score and score.endswith(target_score):
                    score = score[:-len(target_score)].strip()

            name_el = pdiv.select_one("strong")
            name = name_el.get_text(strip=True) if name_el else ""

            run = ""
            avg = ""
            hr = ""
            for sp in pdiv.select("p span"):
                spt = sp.get_text(strip=True)
                if spt.startswith("Run"):
                    run = spt.replace("Run", "").strip()
                elif spt.startswith("Avg"):
                    avg = spt.replace("Avg", "").strip()
                elif spt.startswith("HR"):
                    hr = spt.replace("HR", "").strip()

            players.append({
                "name": name,
                "score": score,
                "target_score": target_score,
                "run": run,
                "avg": avg,
                "hr": hr,
                "is_winner": is_winner
            })

        if len(players) >= 2 and "물주" in players[1].get("name", ""):
            players[0], players[1] = players[1], players[0]

        player_a = players[0] if len(players) > 0 else {}
        player_b = players[1] if len(players) > 1 else {}

        if match_date and len(match_date) <= 14 and not match_date.startswith("20"):
            current_year = datetime.now().year
            match_date = f"{current_year}-{match_date}"

        item_data = {
            "replay_seq": replay_seq or record_folder or mp4_url,
            "match_date": match_date,
            "club_name": club_name,
            "table_name": qs.get("tbNUM", ""),
            "duration": duration,
            "innings": innings,
            "player_a": player_a,
            "player_b": player_b,
            "mp4_url": mp4_url,
            "record_folder": record_folder
        }

        # 캐시 및 디렉터리 확인 (이미 보관 완료된 영상인지 0.0001초 판별)
        folder_name = record_folder or replay_seq
        already_cached = (
            replay_seq in _replays_cache_by_seq or
            folder_name in _replays_cache_by_seq
        )

        if not already_cached:
            if replay_seq not in queued_seqs:
                _pending_download_queue.append(item_data)
                queued_seqs.add(replay_seq)

        synced_items.append(item_data)

    _last_sync_status["item_count"] = len(synced_items)
    logger.info(f"[CUEUNY] 리플레이 {len(synced_items)}건 수집 완료 (신규 대기 큐: {len(_pending_download_queue)}건)")

    trigger_background_download()

    return {
        "success": True,
        "session_valid": True,
        "synced_count": len(synced_items),
        "items": synced_items
    }


def download_single_replay(target: Any) -> bool:
    """
    단일 리플레이 영상을 연도/월별 폴더(storage/cueuny/YYYY/MM/)에 스트리밍으로 다운로드하고
    완료 시 마스터 인덱스를 즉시 갱신합니다.
    """
    global _current_download_info

    replay = None
    if isinstance(target, dict):
        replay = target
    elif isinstance(target, str):
        for q in _pending_download_queue:
            if q.get("replay_seq") == target or q.get("record_folder") == target:
                replay = q
                break
        if not replay:
            replay = get_replay_metadata(target)

    if not replay:
        logger.warning(f"[CUEUNY] 리플레이({target}) 정보를 찾을 수 없습니다.")
        return False

    replay_seq = replay.get("replay_seq") or ""
    mp4_url = replay.get("mp4_url")
    if not mp4_url:
        logger.warning(f"[CUEUNY] 리플레이({replay_seq})의 mp4_url이 없습니다.")
        return False

    folder_name = replay.get("record_folder") or replay_seq
    target_dir = get_target_storage_dir(replay.get("match_date"))
    file_name = f"{folder_name}.mp4"
    save_path = os.path.join(target_dir, file_name)
    json_path = os.path.join(target_dir, f"{folder_name}.json")

    # 이미 파일이 온전히 존재하는 경우
    if os.path.isfile(save_path) and os.path.getsize(save_path) > 1024 * 1024:
        if not os.path.isfile(json_path):
            try:
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump(replay, jf, ensure_ascii=False, indent=2, default=str)
            except Exception:
                pass
        return True

    temp_path = f"{save_path}.tmp"

    _current_download_info["is_downloading"] = True
    _current_download_info["current_seq"] = replay_seq
    _current_download_info["progress_percent"] = 0.0
    _current_download_info["downloaded_bytes"] = 0
    _current_download_info["total_bytes"] = 0

    logger.info(f"[CUEUNY] 영상 다운로드 시작: {mp4_url} -> {save_path}")

    try:
        with requests.get(mp4_url, stream=True, timeout=30) as r:
            r.raise_for_status()
            total_size = int(r.headers.get("Content-Length", 0))
            _current_download_info["total_bytes"] = total_size

            downloaded = 0
            with open(temp_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    f.write(chunk)
                    downloaded += len(chunk)
                    _current_download_info["downloaded_bytes"] = downloaded
                    if total_size > 0:
                        _current_download_info["progress_percent"] = round((downloaded / total_size) * 100, 1)

        if os.path.exists(save_path):
            os.remove(save_path)
        os.rename(temp_path, save_path)

        final_size = os.path.getsize(save_path)

        # 사이드카 JSON 저장
        replay_copy = dict(replay)
        replay_copy["local_path"] = save_path
        replay_copy["file_size"] = final_size
        replay_copy["download_status"] = "completed"
        replay_copy["downloaded_at"] = datetime.now().isoformat()
        replay_copy = _normalize_item_players(replay_copy)

        try:
            with open(json_path, "w", encoding="utf-8") as jf:
                json.dump(replay_copy, jf, ensure_ascii=False, indent=2, default=str)
        except Exception as je:
            logger.warning(f"[CUEUNY] 사이드카 JSON 저장 실패: {je}")

        # 마스터 인덱스 및 인메모리 캐시 실시간 갱신 (1ms 반영)
        with _cache_lock:
            # 기존 캐시에서 동일 항목이 있으면 제거 후 최상단 삽입
            _replays_cache[:] = [item for item in _replays_cache if item.get("replay_seq") != replay_seq and item.get("record_folder") != folder_name]
            _replays_cache.insert(0, replay_copy)
            _replays_cache_by_seq[replay_seq] = replay_copy
            _replays_cache_by_seq[folder_name] = replay_copy

            # index.json 파일 업데이트
            index_file = os.path.join(get_cueuny_storage_dir(), "index.json")
            try:
                temp_idx = f"{index_file}.tmp"
                with open(temp_idx, "w", encoding="utf-8") as f:
                    json.dump(_replays_cache, f, ensure_ascii=False, indent=2, default=str)
                if os.path.exists(index_file):
                    os.remove(index_file)
                os.rename(temp_idx, index_file)
            except Exception as ie:
                logger.error(f"[CUEUNY] index.json 저장 실패: {ie}")

        logger.info(f"[CUEUNY] ✅ 다운로드 완료: {save_path} ({final_size:,} bytes)")
        return True

    except Exception as e:
        logger.error(f"[CUEUNY] ❌ 다운로드 실패 ({replay_seq}): {e}")
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        return False
    finally:
        _current_download_info["is_downloading"] = False
        _current_download_info["current_seq"] = None


def _background_download_worker():
    """대기 큐의 미다운로드 영상을 1건씩 순차 처리하는 워커 스레드"""
    if not _download_lock.acquire(blocking=False):
        logger.info("[CUEUNY] 이미 다른 다운로드 작업이 진행 중입니다.")
        return

    try:
        logger.info("[CUEUNY] 백그라운드 순차 다운로드 큐 시작")
        while _pending_download_queue:
            target = _pending_download_queue.pop(0)
            seq = target.get("replay_seq")
            logger.info(f"[CUEUNY] 큐 순차 처리 중... 대상: {seq} ({target.get('club_name', '')})")

            download_single_replay(target)

            import time
            time.sleep(1.0)

        logger.info("[CUEUNY] 모든 대기 영상의 다운로드가 완료되었습니다.")
    except Exception as e:
        logger.error(f"[CUEUNY] 백그라운드 다운로드 워커 오류: {e}")
    finally:
        _download_lock.release()


def trigger_background_download():
    """백그라운드 순차 다운로드 스레드를 기동합니다."""
    t = threading.Thread(target=_background_download_worker, daemon=True, name="cueuny-dl-worker")
    t.start()


def get_cueuny_status() -> Dict[str, Any]:
    """현재 큐니 서비스 상태 및 통계 반환 (인메모리 캐시 기반 1ms 즉시 반환)"""
    for _p in [os.path.join(_root_dir, ".env"), os.path.join(_backend_dir, ".env")]:
        if os.path.isfile(_p):
            load_dotenv(_p, override=True)

    session = os.getenv("CUEUNY_SESSION", "").strip()
    login_id = os.getenv("CUEUNY_LOGIN_ID", "").strip()
    cron_expr = os.getenv("CUEUNY_SCHEDULE_CRON", "0 4 * * *").strip()

    if not _cache_initialized:
        load_or_rebuild_index()

    completed_count = len(_replays_cache)
    pending_count = len(_pending_download_queue)
    downloading_count = 1 if _current_download_info.get("is_downloading") else 0
    total_count = completed_count + pending_count

    return {
        "is_configured": bool(session and login_id),
        "session_valid": _last_sync_status.get("session_valid"),
        "last_sync_at": _last_sync_status.get("last_sync_at"),
        "last_error": _last_sync_status.get("last_error"),
        "cron_expression": cron_expr,
        "storage_dir": get_cueuny_storage_dir(),
        "current_download": _current_download_info,
        "counts": {
            "total": total_count,
            "completed": completed_count,
            "pending": pending_count,
            "downloading": downloading_count
        }
    }


def _parse_int(val: Any) -> Optional[int]:
    """문자열 등에서 안전하게 정수 추출 ('52min' -> 52, '38' -> 38)"""
    if val is None:
        return None
    try:
        m = re.search(r"\d+", str(val))
        return int(m.group()) if m else None
    except Exception:
        return None


def _parse_float(val: Any) -> Optional[float]:
    """문자열 등에서 안전하게 부동소수점 추출 ('0.421' -> 0.421)"""
    if val is None:
        return None
    try:
        m = re.search(r"\d+(\.\d+)?", str(val))
        return float(m.group()) if m else None
    except Exception:
        return None


def get_verified_completed_replays(
    limit: int = 10,
    offset: int = 0,
    force_refresh: bool = False,
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
) -> Dict[str, Any]:
    """
    서버 스토리지에 온전히 존재하는 영상 목록을 다차원 검색/필터링하여 최신순 페이징 반환합니다.
    (인메모리 캐시에서 직접 필터링하므로 수만 건 기준 0.001초 이내 초고속 필터링 보장)
    """
    if force_refresh or not _cache_initialized:
        load_or_rebuild_index(force_rebuild=force_refresh)

    # 1. 사용 가능한 연도 및 구장 목록 추출 (프론트 드롭다운 옵션용)
    all_years = sorted(
        list(
            {
                str(item.get("match_date", ""))[:4]
                for item in _replays_cache
                if len(str(item.get("match_date", ""))) >= 4 and str(item.get("match_date", ""))[:4].isdigit()
            }
        ),
        reverse=True,
    )
    all_clubs = sorted(
        list(
            {
                str(item.get("club_name", "")).strip()
                for item in _replays_cache
                if str(item.get("club_name", "")).strip()
            }
        )
    )

    # 2. 다차원 조건 필터링
    filtered = _replays_cache

    # 2-1. 통합 검색어 (상대 선수명, 구장명, 날짜 등)
    if q and q.strip():
        term = q.strip().lower()
        filtered = [
            it for it in filtered
            if term in str(it.get("club_name", "")).lower()
            or term in str(it.get("player_b", {}).get("name", "")).lower()
            or term in str(it.get("player_a", {}).get("name", "")).lower()
            or term in str(it.get("match_date", "")).lower()
        ]

    # 2-2. 연도 필터 (YYYY)
    if year and year.strip() and year.strip() != "all":
        y_val = year.strip()
        filtered = [it for it in filtered if str(it.get("match_date", ""))[:4] == y_val]

    # 2-3. 월 필터 (MM)
    if month and month.strip() and month.strip() != "all":
        try:
            m_val = f"{int(month.strip()):02d}"
            filtered = [it for it in filtered if str(it.get("match_date", ""))[5:7] == m_val]
        except ValueError:
            pass

    # 2-4. 구장 필터
    if club and club.strip() and club.strip() != "all":
        c_val = club.strip().lower()
        filtered = [it for it in filtered if c_val in str(it.get("club_name", "")).lower()]

    # 2-5. 상대 선수명 필터
    if opponent and opponent.strip():
        op_val = opponent.strip().lower()
        filtered = [it for it in filtered if op_val in str(it.get("player_b", {}).get("name", "")).lower()]

    # 2-6. 승/패 결과 필터 (win, lose)
    if result and result.strip() in ("win", "lose"):
        is_win_target = (result.strip() == "win")
        filtered = [
            it for it in filtered
            if bool(it.get("player_a", {}).get("is_winner")) is is_win_target
        ]

    # 2-7. 에버리지 (최소/최대)
    if min_avg is not None:
        filtered = [
            it for it in filtered
            if (_parse_float(it.get("player_a", {}).get("avg")) or 0.0) >= min_avg
        ]
    if max_avg is not None:
        filtered = [
            it for it in filtered
            if (_parse_float(it.get("player_a", {}).get("avg")) or 0.0) <= max_avg
        ]

    # 2-8. 하이런 (최소)
    if min_hr is not None:
        filtered = [
            it for it in filtered
            if (_parse_int(it.get("player_a", {}).get("hr")) or 0) >= min_hr
        ]

    # 2-9. 경기 시간 (최소/최대 분)
    if min_duration is not None:
        filtered = [
            it for it in filtered
            if (_parse_int(it.get("duration")) or 0) >= min_duration
        ]
    if max_duration is not None:
        filtered = [
            it for it in filtered
            if (_parse_int(it.get("duration")) or 9999) <= max_duration
        ]

    # 2-10. 이닝 수 (최소/최대)
    if min_innings is not None:
        filtered = [
            it for it in filtered
            if (_parse_int(it.get("innings")) or 0) >= min_innings
        ]
    if max_innings is not None:
        filtered = [
            it for it in filtered
            if (_parse_int(it.get("innings")) or 9999) <= max_innings
        ]

    total = len(filtered)
    paged = filtered[offset:offset + limit]
    has_more = (offset + limit) < total

    return {
        "items": paged,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": has_more,
        "available_years": all_years,
        "available_clubs": all_clubs
    }

