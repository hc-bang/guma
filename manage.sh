#!/usr/bin/env bash
# ==============================================================================
# GUMA™ Unified Server Management Script (Ubuntu / Linux)
# Usage: ./manage.sh (or: sudo ./manage.sh for Port 80 binding)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="80"
export PYTHONIOENCODING="utf-8"
export PYTHONUTF8="1"
VENV_PYTHON="$SCRIPT_DIR/.venv/bin/python"
VENV_PIP="$SCRIPT_DIR/.venv/bin/pip"
LOG_DIR="$SCRIPT_DIR/logs"

load_env() {
    if [ -f "./.env" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "${line// }" ]] && continue
            if [[ "$line" =~ ^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$ ]]; then
                local key="${BASH_REMATCH[1]}"
                local val="${BASH_REMATCH[2]}"
                val="${val%\"}"
                val="${val#\"}"
                val="${val%\'}"
                val="${val#\'}"
                val="${val%$'\r'}"
                export "$key"="$val"
            fi
        done < "./.env"
    fi
}

sync_git_credentials() {
    if [ -n "$GITHUB_TOKEN" ] && command -v git >/dev/null 2>&1; then
        local current_url
        current_url=$(git remote get-url origin 2>/dev/null || true)
        local target_url="https://${GITHUB_TOKEN}@github.com/hc-bang/guma.git"
        if [ "$current_url" != "$target_url" ]; then
            git remote set-url origin "$target_url" 2>/dev/null || true
        fi
    fi
}

# 환경 변수 로드 및 Git 자격증명 자동 동기화
load_env
sync_git_credentials

ensure_log_dir() {
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
    fi
}

check_port_root() {
    if [ "$PORT" -lt 1024 ] && [ "$EUID" -ne 0 ]; then
        echo -e "\033[1;33m[WARN] 포트 80은 1024 이하의 시스템 포트이므로 일반 사용자 권한에서 바인딩 실패할 수 있습니다.\033[0m"
        echo -e "\033[1;33m       실행 시 'sudo ./manage.sh' 로 실행하는 것을 권장합니다.\033[0m"
    fi
}

clean_garbage_files() {
    # downloads 폴더 및 임시 디렉터리 내 잔여 가비지 일괄 청소
    local dirs=("$SCRIPT_DIR/downloads" "$SCRIPT_DIR/downloads/torrent" "$SCRIPT_DIR/backend/downloads" "$SCRIPT_DIR/backend/downloads/torrent")
    for d in "${dirs[@]}"; do
        if [ -d "$d" ]; then
            find "$d" -mindepth 1 ! -name ".gitkeep" ! -name ".gitignore" -exec rm -rf {} + 2>/dev/null
        fi
    done
}

start_unified_server() {
    ensure_log_dir
    clean_garbage_files
    check_port_root

    # 유효성 검사
    if [ ! -d "./frontend" ]; then
        echo -e "\033[1;31m[ERROR] frontend 디렉터리가 존재하지 않습니다.\033[0m"
        return 1
    fi
    if [ ! -f "$VENV_PYTHON" ]; then
        echo -e "\033[1;31m[ERROR] 가상환경(.venv)이 구축되지 않았습니다. 91번 메뉴를 먼저 실행하세요.\033[0m"
        return 1
    fi
    if [ ! -f "./backend/main.py" ]; then
        echo -e "\033[1;31m[ERROR] 진입점 파일(backend/main.py)이 존재하지 않습니다.\033[0m"
        return 1
    fi

    # 포트 80 바인딩 권한 검사 (일반 유저 차단)
    if [ "$PORT" -lt 1024 ] && [ "$EUID" -ne 0 ]; then
        echo -e "\033[1;31m[ERROR] 포트 $PORT 은 시스템 권한(1024 이하)이 필요한 포트입니다.\033[0m"
        echo -e "\033[1;33m       반드시 'sudo ./manage.sh' 명령어로 실행해 주세요.\033[0m"
        return 1
    fi

    # 포트 80 점유 여부 점검
    if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
        echo -e "\033[1;33m[WARN] 포트 $PORT 을 사용하는 프로세스가 이미 실행 중입니다.\033[0m"
        read -rp "기존 서버를 종료하고 새로 시작할까요? (y/N): " re_choice
        if [[ "$re_choice" =~ ^[yY]$ ]]; then
            stop_unified_server
            sleep 1
        else
            echo "[INFO] 서버 시작을 취소했습니다."
            return 0
        fi
    fi

    echo -e "\033[1;36m[INFO] GUMA™ 단일 통합 서버(포트 $PORT)를 백그라운드로 시작합니다...\033[0m"

    # 웹 문서 뷰어용 README.md 정적 미러 복사 (Git 추적 제외 대상)
    if [ -f "./README.md" ]; then
        cp -f "./README.md" "./frontend/README.md" 2>/dev/null || true
    fi

    nohup "$VENV_PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port "$PORT" > "$LOG_DIR/server.log" 2>&1 &
    local server_pid=$!
    echo "$server_pid" > "$LOG_DIR/server.pid"

    local is_started=0
    for i in {1..12}; do
        sleep 0.5
        if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
            is_started=1
            break
        fi
    done

    if [ $is_started -eq 1 ]; then
        echo ""
        echo -e "\033[1;32m=================================================\033[0m"
        echo -e "\033[1;32m✔ GUMA™ 단일 통합 서버 백그라운드 실행 완료\033[0m"
        echo -e "  - 서비스 상태 : 정상 가동 중 (포트 $PORT)"
        echo -e "  - 로컬 웹 주소: http://localhost"
        echo -e "\033[1;32m=================================================\033[0m"
    else
        echo -e "\033[1;31m[ERROR] 서버 시작에 실패했습니다. (포트 $PORT 미감지)\033[0m"
        echo -e "\033[1;33m[HINT] 로그 확인: cat $LOG_DIR/server.log\033[0m"
    fi
}

stop_unified_server() {
    echo -e "\033[1;36m[INFO] GUMA™ 통합 서버(포트 $PORT)를 점검하고 종료합니다...\033[0m"
    local stopped=0

    # 1. PID 파일 기반 종료
    if [ -f "$LOG_DIR/server.pid" ]; then
        local saved_pid
        saved_pid=$(cat "$LOG_DIR/server.pid" 2>/dev/null)
        if [ -n "$saved_pid" ]; then
            kill "$saved_pid" 2>/dev/null && stopped=$((stopped + 1))
        fi
        rm -f "$LOG_DIR/server.pid"
    fi

    # 2. uvicorn 백엔드 프로세스 종료
    pkill -f "uvicorn backend.main:app" 2>/dev/null && stopped=$((stopped + 1))

    # 3. aria2c 다운로드 엔진 데몬 종료
    pkill -f "aria2c" 2>/dev/null && stopped=$((stopped + 1))

    # 3. 포트 점유 프로세스 강제 종료 (fuser 또는 lsof)
    if command -v fuser >/dev/null 2>&1; then
        fuser -k -9 "${PORT}/tcp" >/dev/null 2>&1 && stopped=$((stopped + 1))
    fi
    if command -v lsof >/dev/null 2>&1; then
        local port_pids
        port_pids=$(lsof -t -i :"$PORT" 2>/dev/null)
        if [ -n "$port_pids" ]; then
            echo "$port_pids" | xargs kill -9 2>/dev/null && stopped=$((stopped + 1))
        fi
    fi

    # 프로세스 파일 핸들 릴리즈 대기 후 임시 잔여 파일 청소
    sleep 0.4
    clean_garbage_files

    # 포트 해제 대기 (최대 3초)
    for i in {1..6}; do
        if ! ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
            break
        fi
        sleep 0.5
    done

    if ! ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
        echo -e "\033[1;32m[INFO] 서버가 안전하게 종료되었으며 잔여 임시 파일이 정리되었습니다. (포트 $PORT 해제)\033[0m"
    else
        echo -e "\033[1;31m[WARN] 포트 $PORT 해제에 실패했습니다. root 권한('sudo ./manage.sh')으로 종료해 주세요.\033[0m"
    fi
}

check_unified_server() {
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  GUMA™ 통합 서버 및 서비스 상태 점검\033[0m"
    echo -e "\033[1;36m================================================\033[0m"

    if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
        echo -e "\033[1;32m✔ 통합 웹 서버 (Port $PORT):\033[0m"
        echo -e "  - 상태         : \033[1;32m정상 가동 중 (RUNNING, Background)\033[0m"
        echo -e "  - 로컬 접속주소: http://localhost"
    else
        echo -e "\033[1;31m✖ 통합 웹 서버 (Port $PORT):\033[0m"
        echo -e "  - 상태         : \033[1;31m중지됨 (STOPPED)\033[0m"
    fi

    echo ""
    local aria2_port="${ARIA2_RPC_PORT:-6800}"
    if ss -tulpn 2>/dev/null | grep -q ":$aria2_port " || pgrep -f "aria2c" >/dev/null 2>&1; then
        echo -e "\033[1;32m✔ aria2 다운로드 엔진 (Port $aria2_port):\033[0m"
        echo -e "  - 상태         : \033[1;32m정상 가동 중 (ONLINE, JSON-RPC)\033[0m"
        echo -e "  - RPC 주소     : http://127.0.0.1:$aria2_port/jsonrpc"
    else
        echo -e "\033[1;31m✖ aria2 다운로드 엔진 (Port $aria2_port):\033[0m"
        echo -e "  - 상태         : \033[1;31m중지됨 (STOPPED)\033[0m"
    fi
    echo -e "\033[1;36m================================================\033[0m"
}

update_project() {
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  프로젝트 최신 버전 업데이트 (Git Pull)\033[0m"
    echo -e "\033[1;36m================================================\033[0m"

    # 1. Git 설치 여부 확인
    if ! command -v git >/dev/null 2>&1; then
        echo -e "\033[1;31m[ERROR] Git이 설치되어 있지 않습니다.\033[0m"
        return 1
    fi

    load_env
    sync_git_credentials

    local git_ver
    git_ver=$(git --version)
    echo -e "\033[1;32m[INFO] $git_ver 확인 완료\033[0m"

    # 2. 원격 저장소 최신 버전 가져오기
    echo -e "\033[1;36m[INFO] 원격 저장소에서 최신 버전을 가져옵니다 (git pull origin main)...\033[0m"
    git pull origin main || git pull

    # 3. 서버 실행 중인 경우 재시작 제안
    if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
        echo ""
        read -rp "최신 코드를 적용하기 위해 통합 서버(포트 $PORT)를 재시작할까요? (y/N): " restart_choice
        if [[ "$restart_choice" =~ ^[yY]$ ]]; then
            if [ "$PORT" -lt 1024 ] && [ "$EUID" -ne 0 ]; then
                echo -e "\033[1;33m[WARN] 포트 $PORT 은 시스템 권한이 필요합니다.\033[0m"
                echo -e "\033[1;33m       기존 서버 종료 및 재시작을 위해 'sudo ./manage.sh' 로 재실행을 권장합니다.\033[0m"
            fi
            stop_unified_server
            sleep 1
            start_unified_server
        fi
    fi
}

# ==========================================
# 11, 12, 13: Cloudflare 터널 제어
# ==========================================

get_cloudflared_path() {
    command -v cloudflared 2>/dev/null
}

start_cloudflare_tunnel() {
    ensure_log_dir
    local cf_path
    cf_path=$(get_cloudflared_path)

    if [ -z "$cf_path" ]; then
        echo -e "\033[1;31m[ERROR] cloudflared 명령어를 찾을 수 없습니다.\033[0m"
        echo -e "\033[1;33m[HINT] 93번 메뉴를 실행하여 cloudflared를 먼저 설치하세요.\033[0m"
        return 1
    fi

    if pgrep -x "cloudflared" >/dev/null 2>&1; then
        echo -e "\033[1;33m[WARN] Cloudflare 터널이 이미 실행 중입니다.\033[0m"
        if [ -f "$LOG_DIR/tunnel_url.txt" ]; then
            echo -e "  - 현재 터널 주소: \033[1;36m$(cat "$LOG_DIR/tunnel_url.txt")\033[0m"
        fi
        read -rp "기존 터널을 재시작할까요? (y/N): " re_choice
        if [[ "$re_choice" =~ ^[yY]$ ]]; then
            stop_cloudflare_tunnel
            sleep 1
        else
            return 0
        fi
    fi

    echo -e "\033[1;36m[INFO] Cloudflare 터널을 백그라운드로 시작합니다...\033[0m"
    local tunnel_log="$LOG_DIR/tunnel.log"
    rm -f "$tunnel_log"

    nohup "$cf_path" tunnel --url "http://localhost:$PORT" > "$tunnel_log" 2>&1 &
    echo $! > "$LOG_DIR/tunnel.pid"

    echo "[INFO] 외부 전용 보안 URL을 발급받는 중입니다..."
    local tunnel_url=""
    for i in {1..10}; do
        sleep 1
        if [ -f "$tunnel_log" ]; then
            tunnel_url=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$tunnel_log" | head -n 1)
            if [ -n "$tunnel_url" ]; then
                break
            fi
        fi
    done

    echo ""
    echo -e "\033[1;32m=================================================\033[0m"
    echo -e "\033[1;32m✔ Cloudflare 터널 백그라운드 가동 완료\033[0m"
    if [ -n "$tunnel_url" ]; then
        echo "$tunnel_url" > "$LOG_DIR/tunnel_url.txt"
        echo -e "  - 외부 전용 주소: \033[1;36m$tunnel_url\033[0m"
        echo -e "  - 안내: 스마트폰이나 외부 어디서든 위 주소로 접속 가능합니다."

        # frontend/tunnel.json 파일 갱신 및 Git 자동 푸시 (모든 기기 완전 무설정 동기화)
        cat <<EOF > ./frontend/tunnel.json
{
  "url": "$tunnel_url",
  "status": "online",
  "updated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
        if command -v git >/dev/null 2>&1; then
            echo -e "  - \033[1;36m[Git] tunnel.json 동기화 커밋 및 푸시 진행 중...\033[0m"
            git add ./frontend/tunnel.json >/dev/null 2>&1
            git commit -m "Chore: Cloudflare 터널 주소 갱신 ($tunnel_url)" >/dev/null 2>&1
            git push origin main >/dev/null 2>&1 && echo -e "  - \033[1;32m✔ GitHub Pages 동기화 완료: 모든 기기(스마트폰/PC)에서 즉시 자동 연결됩니다.\033[0m" || echo -e "  - \033[1;33m[WARN] Git push 실패 (네트워크 또는 인증 확인 필요)\033[0m"
        fi
    else
        echo -e "\033[1;33m  - 터널 프로세스가 시작되었습니다. 주소 확인은 13번 메뉴를 이용하세요.\033[0m"
    fi
    echo -e "\033[1;32m=================================================\033[0m"
}

stop_cloudflare_tunnel() {
    echo -e "\033[1;36m[INFO] Cloudflare 터널을 점검하고 종료합니다...\033[0m"
    local stopped=0

    # frontend/tunnel.json 오프라인 갱신 및 Git 자동 푸시
    cat <<EOF > ./frontend/tunnel.json
{
  "url": "",
  "status": "offline",
  "updated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    if command -v git >/dev/null 2>&1; then
        git add ./frontend/tunnel.json >/dev/null 2>&1
        git commit -m "Chore: Cloudflare 터널 종료 (오프라인 전환)" >/dev/null 2>&1
        git push origin main >/dev/null 2>&1 || true
    fi

    if [ -f "$LOG_DIR/tunnel.pid" ]; then
        local saved_pid
        saved_pid=$(cat "$LOG_DIR/tunnel.pid" 2>/dev/null)
        if [ -n "$saved_pid" ] && kill -0 "$saved_pid" 2>/dev/null; then
            kill "$saved_pid" 2>/dev/null
            stopped=$((stopped + 1))
        fi
        rm -f "$LOG_DIR/tunnel.pid"
    fi

    pkill -x "cloudflared" 2>/dev/null && stopped=$((stopped + 1))
    rm -f "$LOG_DIR/tunnel_url.txt"

    sleep 0.5
    if [ "$stopped" -gt 0 ]; then
        echo -e "\033[1;32m[INFO] Cloudflare 터널이 정상적으로 종료되었습니다.\033[0m"
    else
        echo -e "\033[1;33m[INFO] 현재 실행 중인 Cloudflare 터널이 없습니다.\033[0m"
    fi
}

check_cloudflare_tunnel() {
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  Cloudflare 터널 상태 점검\033[0m"
    echo -e "\033[1;36m================================================\033[0m"

    if pgrep -x "cloudflared" >/dev/null 2>&1; then
        local cur_url="확인 중 (잠시 후 다시 조회하세요)"
        if [ -f "$LOG_DIR/tunnel_url.txt" ]; then
            cur_url=$(cat "$LOG_DIR/tunnel_url.txt")
        elif [ -f "$LOG_DIR/tunnel.log" ]; then
            local found_url
            found_url=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -n 1)
            [ -n "$found_url" ] && cur_url="$found_url"
        fi

        echo -e "\033[1;32m✔ Cloudflare 터널:\033[0m"
        echo -e "  - 상태         : \033[1;32m정상 가동 중 (RUNNING, Background)\033[0m"
        echo -e "  - 외부 접속 URL: \033[1;36m$cur_url\033[0m"
        if [[ "$cur_url" =~ ^https:// ]]; then
            echo -e "  - GitHub Pages : \033[1;32mhttps://hc-bang.github.io/guma/ (무설정 자동 연결)\033[0m"
        fi
    else
        echo -e "\033[1;31m✖ Cloudflare 터널:\033[0m"
        echo -e "  - 상태         : \033[1;31m중지됨 (STOPPED)\033[0m"
    fi
    echo -e "\033[1;36m================================================\033[0m"
}

# ==========================================
# 91, 92, 93: 환경 및 패키지 설정
# ==========================================

setup_virtualenv() {
    if [ -d "./.venv" ]; then
        echo -e "\033[1;33m[INFO] 이미 가상환경(.venv)이 존재합니다.\033[0m"
    else
        echo -e "\033[1;32m[INFO] 새로운 가상환경(.venv)을 생성합니다...\033[0m"
        if ! command -v python3 >/dev/null 2>&1; then
            echo -e "\033[1;31m[ERROR] python3가 설치되어 있지 않습니다. 'sudo apt install python3 python3-venv' 를 먼저 실행하세요.\033[0m"
            return 1
        fi
        python3 -m venv .venv
        if [ $? -eq 0 ]; then
            echo -e "\033[1;32m[INFO] 가상환경 구축이 완료되었습니다.\033[0m"
        else
            echo -e "\033[1;31m[ERROR] 가상환경 생성 실패: 'sudo apt install python3-venv' 가 설치되어 있는지 확인하세요.\033[0m"
        fi
    fi
}

install_requirements() {
    if [ ! -f "$VENV_PIP" ]; then
        echo -e "\033[1;31m[ERROR] 가상환경이 없습니다. 91번 메뉴를 먼저 실행하세요.\033[0m"
        return 1
    fi
    if [ ! -f "./backend/requirements.txt" ]; then
        echo -e "\033[1;31m[ERROR] backend/requirements.txt 파일이 없습니다.\033[0m"
        return 1
    fi

    echo -e "\033[1;32m[INFO] 백엔드 패키지 설치를 시작합니다...\033[0m"
    "$VENV_PIP" install -r ./backend/requirements.txt
    if [ $? -eq 0 ]; then
        echo -e "\033[1;32m[INFO] 패키지 설치가 완료되었습니다.\033[0m"
    else
        echo -e "\033[1;31m[ERROR] 패키지 설치 중 오류가 발생했습니다.\033[0m"
    fi
}

install_cloudflared_linux() {
    echo -e "\033[1;36m[INFO] Ubuntu / Debian 용 cloudflared 다운로드 및 설치를 시작합니다...\033[0m"
    local deb_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    
    if command -v curl >/dev/null 2>&1; then
        curl -L -o /tmp/cloudflared.deb "$deb_url"
    elif command -v wget >/dev/null 2>&1; then
        wget -O /tmp/cloudflared.deb "$deb_url"
    else
        echo -e "\033[1;31m[ERROR] curl 또는 wget 명령어가 필요합니다. 'sudo apt install curl' 후 다시 시도하세요.\033[0m"
        return 1
    fi

    echo "[INFO] 패키지 설치 중 (sudo dpkg -i /tmp/cloudflared.deb)..."
    sudo dpkg -i /tmp/cloudflared.deb
    rm -f /tmp/cloudflared.deb

    if command -v cloudflared >/dev/null 2>&1; then
        echo -e "\033[1;32m[INFO] cloudflared 설치가 정상 완료되었습니다! (경로: $(which cloudflared))\033[0m"
    else
        echo -e "\033[1;31m[ERROR] 설치 후 명령어를 찾을 수 없습니다.\033[0m"
    fi
}

install_git_linux() {
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  Git 도구 설치 (Install Git)\033[0m"
    echo -e "\033[1;36m================================================\033[0m"

    if command -v git >/dev/null 2>&1; then
        local git_ver
        git_ver=$(git --version)
        echo -e "\033[1;32m[INFO] 이미 Git이 설치되어 있습니다: $git_ver\033[0m"
        return 0
    fi

    echo -e "\033[1;36m[INFO] apt 패키지 관리자를 통해 Git을 설치합니다...\033[0m"
    sudo apt update && sudo apt install -y git

    if command -v git >/dev/null 2>&1; then
        echo -e "\033[1;32m[INFO] Git 설치가 정상 완료되었습니다! ($(git --version))\033[0m"
    else
        echo -e "\033[1;31m[ERROR] Git 설치에 실패했습니다. 수동으로 설치해주세요.\033[0m"
    fi
}

install_aria2_linux() {
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  aria2 다운로드 엔진 설치 (Install aria2)\033[0m"
    echo -e "\033[1;36m================================================\033[0m"

    if command -v aria2c >/dev/null 2>&1; then
        local aria2_ver
        aria2_ver=$(aria2c --version | head -n 1)
        echo -e "\033[1;32m[INFO] 이미 aria2가 설치되어 있습니다: $aria2_ver\033[0m"
        return 0
    fi

    echo -e "\033[1;36m[INFO] apt 패키지 관리자를 통해 aria2를 설치합니다...\033[0m"
    sudo apt update && sudo apt install -y aria2

    if command -v aria2c >/dev/null 2>&1; then
        echo -e "\033[1;32m[INFO] aria2 설치가 정상 완료되었습니다! ($(aria2c --version | head -n 1))\033[0m"
    else
        echo -e "\033[1;31m[ERROR] aria2 설치에 실패했습니다. 수동으로 설치해주세요.\033[0m"
    fi
}

uninstall_aria2_linux() {
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  aria2 다운로드 엔진 설치 제거 (Uninstall aria2)\033[0m"
    echo -e "\033[1;36m================================================\033[0m"

    if ! command -v aria2c >/dev/null 2>&1; then
        echo -e "\033[1;33m[INFO] aria2가 설치되어 있지 않습니다.\033[0m"
        return 0
    fi

    read -rp "정말로 aria2를 시스템에서 완전히 삭제하시겠습니까? (y/N): " confirm
    if [[ "$confirm" =~ ^[yY]$ ]]; then
        echo -e "\033[1;36m[INFO] apt 패키지 관리자를 통해 aria2를 삭제합니다...\033[0m"
        sudo apt purge -y aria2 && sudo apt autoremove -y
        echo -e "\033[1;32m[INFO] aria2 삭제 작업이 완료되었습니다.\033[0m"
    else
        echo -e "\033[1;33m[INFO] 삭제 작업을 취소했습니다.\033[0m"
    fi
}

# ==========================================
# 메뉴 루프
# ==========================================

show_menu() {
    clear
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;33m■  GUMA™ 우분투/리눅스 통합 서버 관리 대시보드\033[0m"
    echo -e "\033[1;36m================================================\033[0m"
    echo -e "\033[1;34m■  통합 웹 서버 제어 (포트: $PORT)\033[0m"
    echo " 1. 백그라운드 서버 시작 (Start Server)"
    echo " 2. 백그라운드 서버 종료 (Stop Server)"
    echo " 3. 백그라운드 서버 상태 확인 (Server Status)"
    echo " 4. 프로젝트 최신 버전 업데이트 (Git Pull)"
    echo ""
    echo -e "\033[1;34m■  Cloudflare 터널 제어 (외부 보안 연동)\033[0m"
    echo " 11. 터널 시작 (Start Tunnel, 백그라운드)"
    echo " 12. 터널 종료 (Stop Tunnel)"
    echo " 13. 터널 상태 및 주소 확인 (Tunnel Status)"
    echo ""
    echo -e "\033[1;34m■  환경 및 패키지 설정\033[0m"
    echo " 91. 파이썬 가상환경(.venv) 생성"
    echo " 92. 백엔드 패키지 설치 (backend/requirements.txt)"
    echo " 93. Cloudflare(cloudflared) 자동 설치"
    echo " 94. Git 도구 설치 (Install Git)"
    echo " 95. aria2 엔진 설치 (Install aria2)"
    echo " 96. aria2 엔진 설치 제거 (Uninstall aria2)"
    echo ""
    echo " 0. 프로그램 종료"
    echo -e "\033[1;36m================================================\033[0m"
}

while true; do
    show_menu
    read -rp "메뉴를 선택하세요: " choice

    case "$choice" in
        0)
            echo -e "\033[1;32m[INFO] 프로그램을 종료합니다.\033[0m"
            break
            ;;
        1)
            start_unified_server
            ;;
        2)
            stop_unified_server
            ;;
        3)
            check_unified_server
            ;;
        4)
            update_project
            ;;
        11)
            start_cloudflare_tunnel
            ;;
        12)
            stop_cloudflare_tunnel
            ;;
        13)
            check_cloudflare_tunnel
            ;;
        91)
            setup_virtualenv
            ;;
        92)
            install_requirements
            ;;
        93)
            install_cloudflared_linux
            ;;
        94)
            install_git_linux
            ;;
        95)
            install_aria2_linux
            ;;
        96)
            uninstall_aria2_linux
            ;;
        *)
            echo -e "\033[1;31m[WARN] 잘못된 선택입니다.\033[0m"
            ;;
    esac

    echo ""
    read -rp "메뉴로 돌아가려면 엔터(Enter) 키를 누르세요..."
done
