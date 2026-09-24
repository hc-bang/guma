"""
GUMA™ aria2c JSON-RPC Service Module
고성능 토렌트 다운로드 데몬 프로세스 생명주기 제어, Neon DB 트래커 풀 연동, 자동 수집 및 스마트 중복 감지
"""

import os
import re
import sys
import json
import time
import base64
import shutil
import hashlib
import random
import socket
import struct
import threading
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, List, Optional, Tuple

try:
    from app.database import get_db_trackers, save_db_trackers, delete_db_trackers, is_db_available
except ImportError:
    from backend.app.database import get_db_trackers, save_db_trackers, delete_db_trackers, is_db_available

# ==============================================================================
# 환경 설정 로드 (우선순위: 환경 변수 > 기본값)
# ==============================================================================
def get_env_int(key: str, default: int) -> int:
    try:
        val = os.getenv(key)
        return int(val) if val else default
    except (ValueError, TypeError):
        return default

ARIA2_RPC_PORT: int = get_env_int("ARIA2_RPC_PORT", 6800)
TORRENT_MAX_CONCURRENT: int = get_env_int("TORRENT_MAX_CONCURRENT", 3)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend
PROJECT_ROOT = os.path.dirname(BASE_DIR)
LOG_DIR = os.path.join(PROJECT_ROOT, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

DEFAULT_DOWNLOAD_DIR = os.path.join(PROJECT_ROOT, "downloads", "torrent")
TORRENT_DOWNLOAD_DIR: str = os.getenv("TORRENT_DOWNLOAD_DIR", DEFAULT_DOWNLOAD_DIR)
if not os.path.isabs(TORRENT_DOWNLOAD_DIR):
    TORRENT_DOWNLOAD_DIR = os.path.abspath(os.path.join(PROJECT_ROOT, TORRENT_DOWNLOAD_DIR))

# 데몬 프로세스 핸들
_DAEMON_PROCESS: Optional[subprocess.Popen] = None
_DAEMON_LOCK = threading.Lock()
_STATUS_LOCK = threading.Lock()
_TASK_METADATA: Dict[str, Dict[str, Any]] = {}  # GID별 사용자 업로드 메타데이터 보관
_TASK_STATUS_OVERRIDE: Dict[str, str] = {}      # GID -> 'cancelling' | 'deleting'
_TASK_DELETED_RECENT: Dict[str, float] = {}     # GID -> timestamp (삭제 직후 유령 부활 방지)


def clean_tracker_url(url: str) -> Optional[str]:
    """잘못 결합되었거나 비정상적인 트래커 URL을 정제합니다."""
    u = url.strip()
    if not u or u.startswith("#"):
        return None
    # 2개 이상이 겹친 경우 (예: http://...udp://...)
    for prefix in ["udp://", "http://", "https://"]:
        count = u.count(prefix)
        if count > 1:
            u = prefix + u.split(prefix)[1]
            break
    # 기본 스키마 검사
    if not (u.startswith("udp://") or u.startswith("http://") or u.startswith("https://")):
        return None
    # announce 포함 여부
    if "/announce" not in u:
        return None
    return u


_TRACKERS_CACHE: List[str] = []
_TRACKERS_CACHE_TIME: float = 0.0
_TRACKERS_CACHE_TTL: float = 300.0  # 5분 캐시


def get_active_trackers() -> List[str]:
    """오직 Neon DB에서만 살아있는 검증된 활성 트래커 목록을 로드합니다. (5분 메모리 캐시 적용)"""
    global _TRACKERS_CACHE, _TRACKERS_CACHE_TIME
    now = time.time()
    if _TRACKERS_CACHE and (now - _TRACKERS_CACHE_TIME < _TRACKERS_CACHE_TTL):
        return _TRACKERS_CACHE

    trackers = []
    try:
        raw_trackers = get_db_trackers()
        for t in raw_trackers:
            cleaned = clean_tracker_url(t)
            if cleaned and cleaned not in trackers:
                trackers.append(cleaned)
    except Exception as e:
        print(f"[aria2] DB 트래커 조회 예외: {e}")

    # DB가 비어있는 초기 상태일 경우에만 원격 공식 소스에서 동기화 후 로드
    if not trackers:
        try:
            sync_remote_trackers()
            raw_trackers = get_db_trackers()
            for t in raw_trackers:
                cleaned = clean_tracker_url(t)
                if cleaned and cleaned not in trackers:
                    trackers.append(cleaned)
        except Exception:
            pass

    if trackers:
        _TRACKERS_CACHE = trackers
        _TRACKERS_CACHE_TIME = now

    return trackers


def check_tracker_alive(url: str, timeout: float = 1.5) -> bool:
    """트래커 URL에 경량 핑(UDP connect 패킷 / HTTP GET)을 전송하여 실제 생존 여부를 판별합니다."""
    try:
        parsed = urllib.parse.urlparse(url)
        scheme = parsed.scheme.lower()
        host = parsed.hostname
        port = parsed.port
        if not host:
            return False

        if scheme == "udp":
            if not port:
                port = 80
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(timeout)
            try:
                protocol_id = 0x41727101980
                action = 0  # connect
                transaction_id = random.randint(0, 0x7FFFFFFF)
                req = struct.pack(">QII", protocol_id, action, transaction_id)
                sock.sendto(req, (host, port))
                data, _ = sock.recvfrom(2048)
                if len(data) >= 16:
                    res_action, res_trans_id = struct.unpack(">II", data[:8])
                    return res_action == 0 and res_trans_id == transaction_id
            finally:
                sock.close()
        elif scheme in ["http", "https"]:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "uTorrent/3530"},
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status < 500
    except urllib.error.HTTPError as he:
        # 트래커 서버가 400 Bad Request 등을 반환하면 서버 자체는 정상 응답 중
        return he.code < 500
    except Exception:
        return False
    return False


def filter_alive_trackers(urls: List[str], max_workers: int = 10) -> List[str]:
    """주어진 트래커 목록을 병렬 검사하여 실제 응답하는 살아있는 트래커만 선별합니다."""
    if not urls:
        return []
    alive = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = executor.map(lambda u: (u, check_tracker_alive(u)), urls)
        for u, is_alive in results:
            if is_alive:
                alive.append(u)
    return alive


def prune_dead_trackers_from_db():
    """DB에 저장된 트래커들의 생존 여부를 점검하여, 응답 없는 죽은 트래커를 DB에서 영구 삭제합니다."""
    try:
        db_urls = get_db_trackers()
        if not db_urls:
            return
        dead_urls = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            results = executor.map(lambda u: (u, check_tracker_alive(u)), db_urls)
            for u, is_alive in results:
                if not is_alive:
                    dead_urls.append(u)

        if dead_urls:
            removed = delete_db_trackers(dead_urls)
            print(f"[aria2] 죽은 트래커 {removed}개 감지 및 DB에서 영구 삭제 완료 (남은 활성 트래커: {len(db_urls) - removed}개)")
        else:
            print(f"[aria2] DB 트래커 전수 점검 완료: {len(db_urls)}개 모두 정상 생존 중")
    except Exception as e:
        print(f"[aria2] 트래커 정리 오류: {e}")


def harvest_trackers_from_torrent(torrent_bytes: bytes) -> int:
    """토렌트 바이트에서 announce URL들을 추출하여 살아있는 것만 선별 후 Neon DB에 누적 저장합니다."""
    try:
        text = torrent_bytes.decode("utf-8", errors="ignore")
        found = re.findall(r'(?:udp|http|https)://[a-zA-Z0-9\.\-_:]+(?:/[a-zA-Z0-9\.\-_%]+)*/announce', text)
        if found:
            valid_list = []
            for f in set(found):
                cleaned = clean_tracker_url(f)
                if cleaned and cleaned not in valid_list:
                    valid_list.append(cleaned)
            if valid_list:
                # 헬스체크: 과도한 스레드 부하를 방지하기 위해 상위 5개만 경량 검증
                alive_list = filter_alive_trackers(valid_list[:5], max_workers=3)
                if alive_list:
                    added = save_db_trackers(alive_list, source="torrent_harvest")
                    if added > 0:
                        print(f"[aria2] 신규 검증 생존 트래커 {added}개 Neon DB 저장 완료 (검사 대상 {min(len(valid_list), 5)}개)")
                    return added
    except Exception as e:
        print(f"[aria2] 트래커 자동 수집 실패: {e}")
    return 0


def sync_remote_trackers():
    """GitHub ngosang/trackerslist 에서 최신 트래커를 가져와 생존 검증 후 Neon DB에 병합합니다."""
    remote_url = "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt"
    try:
        req = urllib.request.Request(remote_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            lines = [clean_tracker_url(l) for l in content.splitlines()]
            valid = [l for l in lines if l]
            if valid:
                alive = filter_alive_trackers(valid)
                if alive:
                    added = save_db_trackers(alive, source="remote_sync")
                    print(f"[aria2] 원격 트래커 동기화: 검증 생존 {len(alive)}개 중 신규 {added}개 등록")
    except Exception as e:
        print(f"[aria2] 원격 트래커 동기화 건너뜀: {e}")


def ensure_download_dir() -> str:
    """다운로드 임시 디렉터리를 생성하고 절대 경로를 반환합니다."""
    if not os.path.exists(TORRENT_DOWNLOAD_DIR):
        os.makedirs(TORRENT_DOWNLOAD_DIR, exist_ok=True)
    return TORRENT_DOWNLOAD_DIR


def find_aria2c_executable() -> Optional[str]:
    """시스템 PATH 또는 표준 설치 위치(Windows 방화벽 등록 패키지 포함)에서 aria2c 실행 파일 경로를 탐색합니다."""
    if sys.platform == "win32":
        local_app_data = os.getenv("LOCALAPPDATA", "")
        program_files = os.getenv("ProgramFiles", "C:\\Program Files")
        
        # 1. 방화벽 규칙에 등록된 WinGet 패키지 원본 바이너리 최우선 탐색
        winget_pkg_dir = os.path.join(local_app_data, "Microsoft", "WinGet", "Packages")
        if os.path.isdir(winget_pkg_dir):
            for root, _, files in os.walk(winget_pkg_dir):
                if "aria2c.exe" in files:
                    return os.path.join(root, "aria2c.exe")

        candidates = [
            os.path.join(local_app_data, "Microsoft", "WinGet", "Links", "aria2c.exe"),
            os.path.join(program_files, "aria2", "aria2c.exe"),
            "C:\\ProgramData\\chocolatey\\bin\\aria2c.exe",
            os.path.expanduser("~\\scoop\\shims\\aria2c.exe"),
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c

    cmd_name = "aria2c.exe" if sys.platform == "win32" else "aria2c"
    exe_path = shutil.which(cmd_name)
    if exe_path:
        return exe_path

    linux_candidates = ["/usr/bin/aria2c", "/usr/local/bin/aria2c"]
    for c in linux_candidates:
        if os.path.isfile(c):
            return c

    return None


def rpc_call(method: str, params: Optional[List[Any]] = None) -> Any:
    """aria2c 로컬 JSON-RPC 엔드포인트와 통신합니다."""
    url = f"http://127.0.0.1:{ARIA2_RPC_PORT}/jsonrpc"
    payload = {
        "jsonrpc": "2.0",
        "id": f"guma-{int(time.time() * 1000)}",
        "method": method,
        "params": params or []
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=3.0) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        if "error" in result:
            err = result["error"]
            raise RuntimeError(f"aria2c RPC Error [{err.get('code')}]: {err.get('message')}")
        return result.get("result")


def is_rpc_alive() -> bool:
    """현재 aria2c RPC 서버가 응답 가능한 상태인지 신속히 검사합니다."""
    import socket
    try:
        with socket.create_connection(("127.0.0.1", ARIA2_RPC_PORT), timeout=0.15):
            pass
    except Exception:
        return False

    try:
        ver = rpc_call("aria2.getVersion")
        return bool(ver and "version" in ver)
    except Exception:
        return False


def start_daemon() -> bool:
    """aria2c 백그라운드 RPC 데몬 프로세스를 구동합니다."""
    global _DAEMON_PROCESS
    with _DAEMON_LOCK:
        if is_rpc_alive():
            return True

        exe_path = find_aria2c_executable()
        if not exe_path:
            print("[aria2] aria2c 실행 바이너리를 찾을 수 없습니다. 설치 메뉴를 통해 먼저 설치해 주세요.")
            return False

        download_dir = ensure_download_dir()
        trackers = get_active_trackers()
        trackers_arg = ",".join(trackers)

        args = [
            exe_path,
            "--enable-rpc=true",
            "--rpc-listen-all=false",
            f"--rpc-listen-port={ARIA2_RPC_PORT}",
            f"--max-concurrent-downloads={TORRENT_MAX_CONCURRENT}",
            f"--dir={download_dir}",
            "--seed-time=0",
            "--follow-torrent=mem",
            "--bt-stop-timeout=0",
            f"--bt-tracker={trackers_arg}",
            "--enable-dht=true",
            "--enable-dht6=false",
            "--dht-listen-port=6881-6999",
            "--dht-entry-point=router.bittorrent.com:6881",
            "--dht-entry-point=dht.transmissionbt.com:6881",
            "--dht-entry-point=router.utorrent.com:6881",
            "--enable-peer-exchange=true",
            "--bt-enable-lpd=true",
            "--listen-port=6881-6999",
            "--peer-id-prefix=-UT3530-",
            "--user-agent=uTorrent/3530(10991)",
            "--bt-max-peers=200",
            "--bt-request-peer-speed-limit=50M",
            "--bt-tracker-connect-timeout=5",
            "--bt-tracker-timeout=8",
            "--bt-stop-timeout=0",
            "--max-tries=0",
            "--retry-wait=2",
            "--file-allocation=none",
            "--async-dns=false",
            "--summary-interval=0",
            f"--log={os.path.join(LOG_DIR, 'aria2.log')}",
            "--log-level=notice",
            "--rpc-save-upload-metadata=false",
            "--auto-file-renaming=false",
            "--allow-overwrite=true"
        ]

        try:
            startupinfo = None
            if sys.platform == "win32":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            _DAEMON_PROCESS = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                startupinfo=startupinfo
            )

            # 기동 대기 (최대 3초)
            for _ in range(15):
                time.sleep(0.2)
                if is_rpc_alive():
                    print(f"[aria2] aria2c JSON-RPC 데몬이 포트 {ARIA2_RPC_PORT}에서 정상 시작되었습니다. (DB 트래커: {len(trackers)}개)")
                    # 백그라운드로 최신 원격 트래커 동기화 및 DB 내 죽은 트래커 영구 삭제 점검
                    threading.Thread(target=sync_remote_trackers, daemon=True).start()
                    threading.Thread(target=prune_dead_trackers_from_db, daemon=True).start()
                    return True

            print("[aria2] aria2c 데몬이 시간 내에 응답하지 않았습니다.")
            return False
        except Exception as e:
            print(f"[aria2] 데몬 프로세스 시작 실패: {e}")
            return False


def stop_daemon():
    """aria2c 데몬 프로세스를 안전하게 종료합니다."""
    global _DAEMON_PROCESS
    with _DAEMON_LOCK:
        try:
            if is_rpc_alive():
                rpc_call("aria2.shutdown")
        except Exception:
            pass

        if _DAEMON_PROCESS:
            try:
                _DAEMON_PROCESS.terminate()
                _DAEMON_PROCESS.wait(timeout=2)
            except Exception:
                try:
                    _DAEMON_PROCESS.kill()
                except Exception:
                    pass
            _DAEMON_PROCESS = None


def parse_torrent_metadata(content: bytes) -> Tuple[Optional[str], Optional[str]]:
    """토렌트 바이너리에서 info_hash(SHA-1 16진수)와 파일/폴더 name을 직접 추출합니다."""
    idx = content.find(b"4:info")
    if idx == -1:
        return None, None
    info_start = idx + 6
    depth = 0
    i = info_start
    while i < len(content):
        c = chr(content[i])
        if c == 'd' or c == 'l':
            depth += 1
            i += 1
        elif c == 'e':
            depth -= 1
            i += 1
            if depth == 0:
                break
        elif c == 'i':
            end = content.find(b'e', i)
            if end == -1:
                break
            i = end + 1
        elif c.isdigit():
            colon = content.find(b':', i)
            if colon == -1:
                break
            length = int(content[i:colon])
            i = colon + 1 + length
        else:
            i += 1

    info_bytes = content[info_start:i]
    if not info_bytes:
        return None, None

    info_hash = hashlib.sha1(info_bytes).hexdigest().lower()
    name = ""
    name_idx = info_bytes.find(b"4:name")
    if name_idx != -1:
        c_idx = info_bytes.find(b":", name_idx + 6)
        if c_idx != -1:
            try:
                n_len = int(info_bytes[name_idx + 6:c_idx])
                name = info_bytes[c_idx + 1:c_idx + 1 + n_len].decode("utf-8", errors="ignore")
            except Exception:
                pass
    return info_hash, name


def add_torrent_bytes(torrent_bytes: bytes, original_filename: str = "") -> Dict[str, Any]:
    """
    .torrent 파일 바이너리를 인코딩하여 aria2c 작업 큐에 등록합니다.
    중복 토렌트가 이미 실행/완료 목록에 존재하면 에러 대신 기존 작업 정보(is_duplicate=True)를 반환합니다.
    """
    if not is_rpc_alive():
        if not start_daemon():
            raise RuntimeError("aria2c 엔진이 실행되어 있지 않으며 시작할 수 없습니다. 시스템에 aria2가 설치되어 있는지 확인하세요.")

    # 1. 토렌트 메타데이터 사전 파싱 (info_hash, name)
    torrent_hash, torrent_name = parse_torrent_metadata(torrent_bytes)

    # 2. 스마트 중복 사전 검사 (Pre-check): aria2.addTorrent 호출 전에 기존 작업과 대조
    clean_fn = original_filename.replace(".torrent", "").strip() if original_filename else ""
    all_data = get_all_tasks()
    existing_tasks = all_data.get("tasks", [])

    matched_task = None
    for t in existing_tasks:
        t_hash = (t.get("info_hash") or "").lower()
        t_name = t.get("name", "")
        # A. 해시 일치
        if torrent_hash and t_hash and torrent_hash == t_hash:
            matched_task = t
            break
        # B. 토렌트 내부 이름 일치
        if torrent_name and t_name and (torrent_name == t_name or torrent_name in t_name or t_name in torrent_name):
            matched_task = t
            break
        # C. 업로드 파일명 일치
        if clean_fn and t_name and (clean_fn == t_name or clean_fn in t_name or t_name in clean_fn):
            matched_task = t
            break

    if matched_task:
        # 기존 작업이 error 상태(오류 발생)인 경우: 손상된 작업이므로 제거 후 재등록 허용
        if matched_task.get("status") == "error":
            cancel_task(matched_task.get("gid", ""))
        else:
            # 정상 active, waiting, paused, complete 상태는 즉시 중복 감지 반환!
            matched_gid = matched_task.get("gid", "")
            status_text = "다운로드 진행 중인" if matched_task.get("status") in ["active", "waiting"] else "이미 완료된"
            return {
                "gid": matched_gid,
                "is_duplicate": True,
                "task": matched_task,
                "message": f"{status_text} 토렌트입니다."
            }

    # 3. 토렌트 내부 announce 트래커 자동 수집 및 Neon DB 저장을 백그라운드 비동기 실행 (0초 즉각 등록)
    threading.Thread(target=harvest_trackers_from_torrent, args=(torrent_bytes,), daemon=True).start()

    # 4. 최신 DB 트래커 목록 획득 (메모리 캐시 적용으로 즉시 반환)
    trackers = get_active_trackers()

    b64_content = base64.b64encode(torrent_bytes).decode("utf-8")
    download_dir = ensure_download_dir()

    options = {
        "dir": download_dir,
        "max-connection-per-server": "16",
        "split": "16",
        "file-allocation": "none",
        "async-dns": "false",
        "bt-stop-timeout": "0",
        "bt-tracker-connect-timeout": "5",
        "bt-tracker-timeout": "8",
        "max-tries": "0",
        "retry-wait": "2",
        "seed-time": "0",
        "seed-ratio": "0.0",
        "bt-tracker": ",".join(trackers)
    }

    try:
        gid = rpc_call("aria2.addTorrent", [b64_content, [], options])
        _TASK_METADATA[gid] = {
            "original_filename": original_filename or torrent_name or f"torrent_{gid[:6]}",
            "info_hash": torrent_hash or "",
            "created_at": time.time(),
            "download_dir": download_dir
        }
        return {
            "gid": gid,
            "is_duplicate": False,
            "task": get_task_status(gid)
        }
    except RuntimeError as rpc_err:
        err_text = str(rpc_err).lower()
        if "duplicate" in err_text or "already exists" in err_text or "same hash" in err_text:
            matched_gid = matched_task.get("gid", "") if matched_task else ""
            return {
                "gid": matched_gid,
                "is_duplicate": True,
                "task": matched_task,
                "message": "이미 다운로드 목록에 등록되어 있는 토렌트입니다."
            }
        raise


def format_bytes(size_bytes: int) -> str:
    """바이트 수치를 사람이 읽기 쉬운 단위(KB, MB, GB)로 변환합니다."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def format_speed(speed_bytes: int) -> str:
    """속도 수치(bytes/s)를 포맷팅합니다."""
    return f"{format_bytes(speed_bytes)}/s"


def parse_task_status(raw: Dict[str, Any]) -> Dict[str, Any]:
    """aria2.tellStatus 원시 데이터를 프론트엔드 표준 포맷으로 정제합니다."""
    gid = raw.get("gid", "")
    status = raw.get("status", "unknown")
    total_len = int(raw.get("totalLength", 0))
    completed_len = int(raw.get("completedLength", 0))
    down_speed = int(raw.get("downloadSpeed", 0))
    up_speed = int(raw.get("uploadSpeed", 0))
    num_peers = int(raw.get("connections", 0))
    num_seeders = int(raw.get("numSeeders", 0))

    progress = round((completed_len / total_len * 100), 1) if total_len > 0 else 0.0

    meta = _TASK_METADATA.get(gid, {})
    files = raw.get("files", [])
    primary_name = meta.get("original_filename", f"task_{gid[:6]}")
    file_path = ""
    is_directory = False

    valid_paths = [f.get("path", "") for f in files if f.get("path")]
    if valid_paths:
        if len(valid_paths) == 1:
            file_path = valid_paths[0]
            is_directory = os.path.isdir(file_path)
            primary_name = os.path.basename(file_path)
        else:
            is_directory = True
            try:
                common_dir = os.path.commonpath(valid_paths)
                if common_dir == TORRENT_DOWNLOAD_DIR or common_dir == os.path.dirname(TORRENT_DOWNLOAD_DIR):
                    rel = os.path.relpath(valid_paths[0], TORRENT_DOWNLOAD_DIR)
                    primary_name = rel.split(os.sep)[0]
                    file_path = os.path.join(TORRENT_DOWNLOAD_DIR, primary_name)
                else:
                    file_path = common_dir
                    primary_name = os.path.basename(common_dir)
            except Exception:
                file_path = os.path.dirname(valid_paths[0])
                primary_name = os.path.basename(file_path)

    eta_sec = 0
    if down_speed > 0 and total_len > completed_len:
        eta_sec = int((total_len - completed_len) / down_speed)

    files_detail = []
    for f in files:
        f_path = f.get("path", "")
        f_len = int(f.get("length", 0))
        f_completed = int(f.get("completedLength", 0))
        f_prog = round((f_completed / f_len * 100), 1) if f_len > 0 else 0.0
        rel_name = os.path.relpath(f_path, TORRENT_DOWNLOAD_DIR) if f_path and TORRENT_DOWNLOAD_DIR in f_path else (os.path.basename(f_path) or f_path)
        files_detail.append({
            "name": rel_name or os.path.basename(f_path) or primary_name,
            "length": f_len,
            "length_str": format_bytes(f_len),
            "completed_length": f_completed,
            "completed_length_str": format_bytes(f_completed),
            "progress": f_prog,
            "selected": f.get("selected", "true") == "true"
        })

    # 파일 목록이 비어있다면, 최소 1개의 단일 파일 정보로 자동 생성
    if not files_detail and (total_len > 0 or primary_name):
        files_detail.append({
            "name": primary_name,
            "length": total_len,
            "length_str": format_bytes(total_len),
            "completed_length": completed_len,
            "completed_length_str": format_bytes(completed_len),
            "progress": progress,
            "selected": True
        })

    with _STATUS_LOCK:
        if gid in _TASK_STATUS_OVERRIDE:
            status = _TASK_STATUS_OVERRIDE[gid]
            down_speed = 0
            up_speed = 0

    return {
        "gid": gid,
        "status": status,
        "name": primary_name,
        "info_hash": (info_hash or "").lower(),
        "total_length": total_len,
        "total_length_str": format_bytes(total_len),
        "completed_length": completed_len,
        "completed_length_str": format_bytes(completed_len),
        "progress": progress,
        "download_speed": down_speed,
        "download_speed_str": format_speed(down_speed),
        "upload_speed": up_speed,
        "upload_speed_str": format_speed(up_speed),
        "num_peers": num_peers,
        "num_seeders": num_seeders,
        "eta_seconds": eta_sec,
        "file_path": file_path,
        "is_directory": is_directory,
        "file_count": len(valid_paths),
        "files_detail": files_detail,
        "piece_length": int(raw.get("pieceLength", 0)),
        "num_pieces": int(raw.get("numPieces", 0)),
        "error_code": raw.get("errorCode"),
        "error_message": raw.get("errorMessage", "")
    }


def get_task_status(gid: str) -> Optional[Dict[str, Any]]:
    """특정 GID의 작업 상태를 반환합니다."""
    if not is_rpc_alive():
        return None
    try:
        raw = rpc_call("aria2.tellStatus", [gid])
        return parse_task_status(raw)
    except Exception:
        return None


def get_all_tasks() -> Dict[str, Any]:
    """현재 활성, 대기, 완료된 모든 작업과 글로벌 전송 속도를 반환합니다. (취소/삭제된 작업은 목록에서 제외)"""
    if not is_rpc_alive():
        return {
            "is_engine_ready": False,
            "global_stats": {"download_speed": 0, "upload_speed": 0, "active_count": 0},
            "tasks": []
        }

    try:
        global_stat = rpc_call("aria2.getGlobalStat") or {}
        active_tasks = rpc_call("aria2.tellActive") or []
        waiting_tasks = rpc_call("aria2.tellWaiting", [0, 50]) or []
        stopped_tasks = rpc_call("aria2.tellStopped", [0, 50]) or []

        with _STATUS_LOCK:
            now = time.time()
            expired = [g for g, t in _TASK_DELETED_RECENT.items() if now - t > 15]
            for g in expired:
                del _TASK_DELETED_RECENT[g]
            recent_deleted = set(_TASK_DELETED_RECENT.keys())

        all_raw = active_tasks + waiting_tasks + stopped_tasks
        # 취소/삭제된(removed) 작업 및 최근 삭제 완료된 작업은 목록에서 제외
        parsed_tasks = [
            parse_task_status(r) for r in all_raw 
            if r.get("status") != "removed" and r.get("gid") not in recent_deleted
        ]
        tasks = [t for t in parsed_tasks if t and not t.get("name", "").startswith("[METADATA]")]

        down_speed = int(global_stat.get("downloadSpeed", 0))
        up_speed = int(global_stat.get("uploadSpeed", 0))

        return {
            "is_engine_ready": True,
            "max_concurrent": TORRENT_MAX_CONCURRENT,
            "global_stats": {
                "download_speed": down_speed,
                "download_speed_str": format_speed(down_speed),
                "upload_speed": up_speed,
                "upload_speed_str": format_speed(up_speed),
                "num_active": int(global_stat.get("numActive", 0)),
                "num_waiting": int(global_stat.get("numWaiting", 0)),
                "num_stopped": int(global_stat.get("numStopped", 0))
            },
            "tasks": tasks
        }
    except Exception as e:
        return {
            "is_engine_ready": False,
            "error": str(e),
            "global_stats": {"download_speed": 0, "upload_speed": 0, "active_count": 0},
            "tasks": []
        }


def cancel_task(gid: str, wait_complete: bool = False) -> bool:
    """작업 취소/삭제를 요청합니다."""
    res = request_cancel_or_delete_task(gid, wait_complete=wait_complete)
    return res.get("success", False)


def request_cancel_or_delete_task(gid: str, wait_complete: bool = False) -> Dict[str, Any]:
    """
    클라이언트의 취소/삭제 요청을 접수하여 즉시 상태를 'cancelling' 또는 'deleting'으로 변경하고,
    실제 무거운 파일 I/O 및 aria2 큐 정리는 백그라운드 워커 스레드에서 비동기로 수행합니다. (0ms 즉시 응답)
    """
    if not is_rpc_alive():
        return {"success": False, "message": "엔진이 응답하지 않습니다."}

    # 1. 대상 작업 정보 및 현재 상태 파악
    task = get_task_status(gid)
    action_status = "deleting" if (task and task.get("status") == "complete") else "cancelling"
    file_path = task.get("file_path", "") if task else ""

    # 2. 서버 메모리에 즉시 '취소중'/'삭제중' 상태 오버라이드 등록 (0ms)
    with _STATUS_LOCK:
        _TASK_STATUS_OVERRIDE[gid] = action_status

    print(f"[aria2] 작업 {action_status} 상태 전환 완료 ({gid}), 백그라운드 영구 삭제 스레드 가동")

    # 3. 실제 무거운 파일 삭제 및 엔진 큐 제거를 백그라운드 워커 스레드로 위임
    worker_thread = threading.Thread(
        target=_async_cleanup_worker,
        args=(gid, file_path, action_status),
        daemon=True
    )
    worker_thread.start()

    if wait_complete:
        worker_thread.join(timeout=3.0)

    return {
        "success": True,
        "gid": gid,
        "status": action_status,
        "message": "삭제 중입니다." if action_status == "deleting" else "취소 중입니다."
    }


def _async_cleanup_worker(gid: str, file_path: str, action_status: str):
    """백그라운드 워커 스레드: aria2c 큐 제거 및 디스크 파일 영구 삭제를 비동기로 수행합니다."""
    try:
        try:
            rpc_call("aria2.remove", [gid])
        except Exception:
            pass
        try:
            rpc_call("aria2.removeDownloadResult", [gid])
        except Exception:
            pass

        # aria2c가 파일 핸들을 닫을 수 있도록 안전 대기 (0.2초)
        time.sleep(0.2)
        cleanup_task_disk_files(gid, target_path=file_path)

        # 뒤늦은 플러시 대비 2차 재삭제 (0.25초)
        time.sleep(0.25)
        cleanup_task_disk_files(gid, target_path=file_path)
    except Exception as e:
        print(f"[aria2] 백그라운드 {action_status} 오류 ({gid}): {e}")
    finally:
        with _STATUS_LOCK:
            _TASK_STATUS_OVERRIDE.pop(gid, None)
            _TASK_DELETED_RECENT[gid] = time.time()
            if gid in _TASK_METADATA:
                del _TASK_METADATA[gid]
        print(f"[aria2] 백그라운드 {action_status} 최종 완료 및 목록 소멸 ({gid})")


def cleanup_task_disk_files(gid: str, target_path: str = ""):
    """특정 GID와 연관된 실제 파일, 디렉터리 및 .aria2 제어 파일을 서버 디스크에서 영구 삭제합니다."""
    file_path = target_path
    if not file_path:
        task = get_task_status(gid)
        if task:
            file_path = task.get("file_path", "")

    # 경로를 못 찾았을 경우 메타데이터 기반 폴백 탐색
    meta = _TASK_METADATA.get(gid, {})
    orig_name = meta.get("original_filename", "")
    task_name = meta.get("task_name", "")

    search_bases = [
        TORRENT_DOWNLOAD_DIR,
        os.path.join(PROJECT_ROOT, "downloads"),
        os.path.join(PROJECT_ROOT, "downloads", "torrent"),
        os.path.join(BASE_DIR, "downloads"),
    ]

    if not file_path or not os.path.exists(file_path):
        for name_candidate in [orig_name, task_name]:
            if not name_candidate:
                continue
            for base_dir in search_bases:
                candidate = os.path.join(base_dir, name_candidate)
                if os.path.exists(candidate) or os.path.exists(f"{candidate}.aria2"):
                    file_path = candidate
                    break
            if file_path:
                break

    target_paths = set()
    if file_path:
        target_paths.add(file_path)
        target_paths.add(f"{file_path}.aria2")

        dir_name = os.path.dirname(file_path)
        base_name = os.path.basename(file_path)
        if os.path.isdir(dir_name):
            try:
                for f in os.listdir(dir_name):
                    if f.startswith(base_name) and f.endswith(".aria2"):
                        target_paths.add(os.path.join(dir_name, f))
            except Exception:
                pass

    # 추가 안전망: search_bases 내에서 orig_name 또는 task_name으로 시작하는 .aria2 파일 전수 수집
    for name_candidate in [orig_name, task_name]:
        if not name_candidate:
            continue
        clean_cand = name_candidate.replace(".torrent", "").strip()
        if not clean_cand:
            continue
        for base_dir in search_bases:
            if os.path.isdir(base_dir):
                try:
                    for f in os.listdir(base_dir):
                        if f.startswith(clean_cand) and f.endswith(".aria2"):
                            target_paths.add(os.path.join(base_dir, f))
                except Exception:
                    pass

    # 파일 삭제 실행 (Windows 파일 락 대비 최대 3회 재시도)
    for p in target_paths:
        if not os.path.exists(p):
            continue
        for attempt in range(3):
            try:
                if os.path.isdir(p):
                    shutil.rmtree(p, ignore_errors=True)
                    print(f"[aria2] 디렉터리 영구 삭제 완료 ({gid}): {p}")
                else:
                    os.remove(p)
                    print(f"[aria2] 파일 영구 삭제 완료 ({gid}): {p}")
                break
            except Exception as e:
                if attempt < 2:
                    time.sleep(0.1)
                else:
                    print(f"[aria2] 파일 삭제 최종 실패 ({p}): {e}")


def cleanup_old_abandoned_files(max_age_seconds: int = 86400):
    """24시간 이상 방치된 고아 다운로드 파일을 서버 디렉터리에서 주기적으로 정리합니다."""
    now = time.time()
    if not os.path.exists(TORRENT_DOWNLOAD_DIR):
        return

    try:
        for entry in os.listdir(TORRENT_DOWNLOAD_DIR):
            full_path = os.path.join(TORRENT_DOWNLOAD_DIR, entry)
            mtime = os.path.getmtime(full_path)
            if now - mtime > max_age_seconds:
                if os.path.isdir(full_path):
                    shutil.rmtree(full_path, ignore_errors=True)
                else:
                    os.remove(full_path)
    except Exception as e:
        print(f"[aria2] 오래된 파일 정리 오류: {e}")


def cleanup_startup_garbage() -> int:
    """서버 시작 시 이전 세션의 잔여 불완전 다운로드 파일 및 시스템 임시 파일들을 일괄 정리합니다."""
    print("[Garbage Cleanup] 서버 시작 시 임시 가비지 파일 정리를 진행합니다...")
    target_dirs = [
        TORRENT_DOWNLOAD_DIR,
        os.path.join(PROJECT_ROOT, "downloads"),
        os.path.join(PROJECT_ROOT, "downloads", "torrent"),
        os.path.join(BASE_DIR, "downloads"),
        os.path.join(BASE_DIR, "downloads", "torrent"),
        os.path.join(BASE_DIR, "backend", "downloads", "torrent")
    ]
    cleaned_count = 0
    for d in set(target_dirs):
        if os.path.exists(d):
            try:
                for item in os.listdir(d):
                    if item.lower() in [".gitkeep", ".gitignore"]:
                        continue
                    p = os.path.join(d, item)
                    try:
                        if os.path.isdir(p):
                            shutil.rmtree(p, ignore_errors=True)
                        else:
                            os.remove(p)
                        cleaned_count += 1
                    except Exception:
                        pass
            except Exception:
                pass

    # 시스템 임시 디렉터리(tempfile) 내 GUMA 임시 파일(guma_yt_*, guma_torrent_*) 정리
    import tempfile
    temp_dir = tempfile.gettempdir()
    try:
        for f in os.listdir(temp_dir):
            if f.startswith("guma_yt_") or f.startswith("guma_torrent_"):
                fp = os.path.join(temp_dir, f)
                try:
                    if os.path.isdir(fp):
                        shutil.rmtree(fp, ignore_errors=True)
                    else:
                        os.remove(fp)
                    cleaned_count += 1
                except Exception:
                    pass
    except Exception:
        pass

    print(f"[Garbage Cleanup] 잔여 임시 가비지 파일 {cleaned_count}개 정리 완료.")
    return cleaned_count
