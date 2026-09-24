# Usage: .\manage.ps1

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$PORT = "80"
$VENV_PYTHON = ".\.venv\Scripts\python.exe"
$LOG_DIR = ".\logs"

function Load-Env {
    if (Test-Path ".\.env") {
        Get-Content ".\.env" | ForEach-Object {
            $line = $_.Trim()
            if (-not $line.StartsWith("#") -and $line -match '^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$') {
                $key = $matches[1]
                $val = $matches[2].Trim('"', "'")
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

function Sync-GitCredentials {
    $token = [System.Environment]::GetEnvironmentVariable("GITHUB_TOKEN", "Process")
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($token -and $gitCmd) {
        $currentUrl = (git remote get-url origin 2>$null)
        $targetUrl = "https://${token}@github.com/hc-bang/guma.git"
        if ($currentUrl -ne $targetUrl) {
            git remote set-url origin $targetUrl 2>$null
        }
    }
}

# 환경 변수 로드 및 Git 자격증명 자동 동기화
Load-Env
Sync-GitCredentials

function Ensure-LogDir {
    if (-not (Test-Path $LOG_DIR)) {
        New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
    }
}

function Print-TaskResult {
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[INFO] 작업이 정상적으로 완료되었습니다." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] 작업 중 오류가 발생했습니다. 메시지를 확인하세요." -ForegroundColor Red
    }
}

function Get-CloudflaredPath {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $paths = @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

# ==========================================
# 1, 2, 3: 백엔드/웹 통합 서버 제어 (포트 80)
# ==========================================

function Clean-GarbageFiles {
    # downloads 폴더 및 임시 디렉터리 내 잔여 가비지 일괄 청소
    $dirsToClean = @(
        (Join-Path $PSScriptRoot "downloads"),
        (Join-Path $PSScriptRoot "downloads\torrent"),
        (Join-Path $PSScriptRoot "backend\downloads"),
        (Join-Path $PSScriptRoot "backend\downloads\torrent")
    )
    foreach ($d in $dirsToClean) {
        if (Test-Path $d) {
            Get-ChildItem -Path $d -Exclude ".gitkeep", ".gitignore" -Force -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Start-UnifiedServer {
    Ensure-LogDir
    Clean-GarbageFiles

    if (-not (Test-Path ".\frontend")) {
        Write-Host "[ERROR] frontend 디렉터리가 존재하지 않습니다." -ForegroundColor Red
        return
    }
    if (-not (Test-Path $VENV_PYTHON)) {
        Write-Host "[ERROR] 가상환경(.venv)이 구축되지 않았습니다. 91번 메뉴를 먼저 실행하세요." -ForegroundColor Red
        return
    }
    if (-not (Test-Path ".\backend\main.py")) {
        Write-Host "[ERROR] 진입점 파일(backend/main.py)이 존재하지 않습니다." -ForegroundColor Red
        return
    }

    # 포트 점유 여부 점검
    $conn = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = ($conn | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        Write-Host "[WARN] 포트 $PORT 을 사용하는 서버가 이미 실행 중입니다. (PID: $pids)" -ForegroundColor Yellow
        $reChoice = Read-Host "기존 서버를 종료하고 새로 시작할까요? (y/N)"
        if ($reChoice -eq "y" -or $reChoice -eq "Y") {
            Stop-UnifiedServer
            Start-Sleep -Seconds 1
        } else {
            Write-Host "[INFO] 서버 시작을 취소했습니다." -ForegroundColor Gray
            return
        }
    }

    # README.md 동기화
    if (Test-Path ".\README.md") {
        Copy-Item -Path ".\README.md" -Destination ".\frontend\README.md" -Force
    }

    Write-Host "[INFO] GUMA™ 단일 통합 서버(포트 $PORT)를 백그라운드로 시작합니다..." -ForegroundColor Cyan

    $stdOutLog = Join-Path $LOG_DIR "server.log"
    $stdErrLog = Join-Path $LOG_DIR "server.err.log"

    $serverProc = Start-Process $VENV_PYTHON -ArgumentList "-m uvicorn backend.main:app --host 0.0.0.0 --port $PORT" `
        -RedirectStandardOutput $stdOutLog `
        -RedirectStandardError $stdErrLog `
        -WindowStyle Hidden `
        -PassThru

    if ($serverProc) {
        $serverProc.Id | Out-File -FilePath (Join-Path $LOG_DIR "server.pid") -Encoding ASCII
    }

    $checkConn = $null
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Milliseconds 500
        $checkConn = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
        if ($checkConn) { break }
    }

    if ($checkConn) {
        Write-Host ""
        Write-Host "=================================================" -ForegroundColor Green
        Write-Host "✔ GUMA™ 단일 통합 서버 백그라운드 실행 완료" -ForegroundColor Green
        Write-Host "  - 서비스 상태 : 정상 가동 중 (포트 $PORT)" -ForegroundColor White
        Write-Host "  - 로컬 웹 주소: http://localhost" -ForegroundColor White
        Write-Host "=================================================" -ForegroundColor Green
    } else {
        Write-Host "[WARN] 서버 프로세스를 시작했으나 포트 $PORT 응답 대기 중입니다. 3번 메뉴로 상태를 확인하세요." -ForegroundColor Yellow
    }
}

function Stop-UnifiedServer {
    Write-Host "[INFO] GUMA™ 통합 서버(포트 $PORT)를 점검하고 종료합니다..." -ForegroundColor Cyan
    $stopped = 0

    # 1. server.pid 프로세스 트리 종료
    $pidFile = Join-Path $LOG_DIR "server.pid"
    if (Test-Path $pidFile) {
        $savedPid = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue)
        $pIdNum = 0
        if ($savedPid -and [int]::TryParse($savedPid.Trim(), [ref]$pIdNum) -and $pIdNum -gt 4) {
            cmd.exe /c "taskkill /F /PID $pIdNum /T" 2>$null | Out-Null
            $stopped++
        }
        Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    }

    # 2. 포트 점유 프로세스 종료
    $conns = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            if ($procId -gt 4) {
                cmd.exe /c "taskkill /F /PID $procId /T" 2>$null | Out-Null
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "  ✔ 포트 $PORT 서버 프로세스 종료 완료 (PID: $procId)" -ForegroundColor Green
                $stopped++
            }
        }
    }

    # 3. uvicorn 관련 프로세스 정리 (Get-CimInstance로 CommandLine 정밀 감지)
    try {
        Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -like "*backend.main:app*" -or $_.CommandLine -like "*uvicorn*"
        } | ForEach-Object {
            cmd.exe /c "taskkill /F /PID $($_.ProcessId) /T" 2>$null | Out-Null
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            $stopped++
        }
    } catch {}

    # 4. aria2c 다운로드 엔진 프로세스 정리
    Get-Process -Name aria2c -ErrorAction SilentlyContinue | ForEach-Object {
        cmd.exe /c "taskkill /F /PID $($_.Id) /T" 2>$null | Out-Null
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  ✔ aria2c 엔진 프로세스 종료 완료 (PID: $($_.Id))" -ForegroundColor Green
        $stopped++
    }

    # 프로세스 파일 핸들 릴리즈 대기 후 임시 잔여 파일 청소
    Start-Sleep -Milliseconds 400
    Clean-GarbageFiles

    Start-Sleep -Milliseconds 200
    if ($stopped -gt 0) {
        Write-Host "[INFO] 서버가 안전하게 종료되었으며 잔여 임시 파일이 정리되었습니다. (포트 $PORT 해제)" -ForegroundColor Green
    } else {
        Write-Host "[INFO] 현재 실행 중인 서버가 없습니다. (잔여 임시 파일 정리 완료)" -ForegroundColor Yellow
    }
}

function Check-UnifiedServer {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  GUMA™ 통합 서버 및 서비스 상태 점검" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan

    $conn = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = ($conn | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        Write-Host "✔ 통합 웹 서버 (Port $PORT):" -ForegroundColor Green
        Write-Host "  - 상태         : 정상 가동 중 (RUNNING, Background)" -ForegroundColor Green
        Write-Host "  - 접속 주소    : http://localhost" -ForegroundColor White
        Write-Host "  - 프로세스 PID : $pids" -ForegroundColor Gray
    } else {
        Write-Host "✖ 통합 웹 서버 (Port $PORT):" -ForegroundColor Red
        Write-Host "  - 상태         : 중지됨 (STOPPED)" -ForegroundColor Red
    }

    Write-Host ""
    $aria2Port = if ($env:ARIA2_RPC_PORT) { $env:ARIA2_RPC_PORT } else { "6800" }
    $aria2Conn = Get-NetTCPConnection -LocalPort $aria2Port -State Listen -ErrorAction SilentlyContinue
    $aria2Proc = Get-Process -Name aria2c -ErrorAction SilentlyContinue

    if ($aria2Conn -or $aria2Proc) {
        $aPids = if ($aria2Proc) { ($aria2Proc | Select-Object -ExpandProperty Id) -join ", " } else { ($aria2Conn | Select-Object -ExpandProperty OwningProcess -Unique) -join ", " }
        Write-Host "✔ aria2 다운로드 엔진 (Port $aria2Port):" -ForegroundColor Green
        Write-Host "  - 상태         : 정상 가동 중 (ONLINE, JSON-RPC)" -ForegroundColor Green
        Write-Host "  - RPC 주소     : http://127.0.0.1:$aria2Port/jsonrpc" -ForegroundColor White
        Write-Host "  - 프로세스 PID : $aPids" -ForegroundColor Gray
    } else {
        Write-Host "✖ aria2 다운로드 엔진 (Port $aria2Port):" -ForegroundColor Red
        Write-Host "  - 상태         : 중지됨 (STOPPED)" -ForegroundColor Red
    }
    Write-Host "================================================" -ForegroundColor Cyan
}

function Update-Project {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  프로젝트 최신 버전 업데이트 (Git Pull)" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan

    # 1. Git 설치 여부 및 자격증명 확인
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Host "[ERROR] Git이 설치되어 있지 않습니다." -ForegroundColor Red
        return
    }

    Load-Env
    Sync-GitCredentials

    $gitVer = (& git --version)
    Write-Host "[INFO] $gitVer 확인 완료" -ForegroundColor Green

    # 2. 원격 저장소 최신 버전 가져오기
    Write-Host "[INFO] 원격 저장소에서 최신 버전을 가져옵니다 (git pull origin main)..." -ForegroundColor Cyan
    git pull origin main
    if ($LASTEXITCODE -ne 0) { git pull }
    Print-TaskResult

    # 백엔드 의존성 패키지 자동 동기화
    if (Test-Path $VENV_PYTHON) {
        Write-Host "[INFO] 백엔드 패키지 의존성을 최신 상태로 동기화합니다..." -ForegroundColor Cyan
        & $VENV_PYTHON -m pip install -r backend/requirements.txt --quiet
    }

    # 3. 서버 실행 중인 경우 재시작 제안
    $conn = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host ""
        $restart = Read-Host "최신 코드를 적용하기 위해 통합 서버(포트 $PORT)를 재시작할까요? (y/N)"
        if ($restart -eq "y" -or $restart -eq "Y") {
            Stop-UnifiedServer
            Start-Sleep -Seconds 1
            Start-UnifiedServer
        }
    }
}

# ==========================================
# 11, 12, 13: Cloudflare 터널 제어
# ==========================================

function Start-CloudflareTunnel {
    Ensure-LogDir
    $cfPath = Get-CloudflaredPath

    if (-not $cfPath) {
        Write-Host "[ERROR] cloudflared 실행 파일을 찾을 수 없습니다." -ForegroundColor Red
        Write-Host "[HINT] 93번 메뉴를 실행하여 cloudflared를 먼저 설치하세요." -ForegroundColor Yellow
        return
    }

    # 안전 확인 질문 (개발 중 실수 방지)
    Write-Host ""
    Write-Host "[주의] 터널을 시작하면 GitHub Pages(운영 환경)의 접속 주소가 이 PC로 갱신됩니다." -ForegroundColor Yellow
    $startChoice = Read-Host "정말 터널을 시작하고 깃허브에 배포할까요? (y/N)"
    if ($startChoice -ne "y" -and $startChoice -ne "Y") {
        Write-Host "[INFO] 터널 시작을 안전하게 취소했습니다." -ForegroundColor Gray
        return
    }

    # 이미 실행 중인지 확인
    $existing = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if ($existing) {
        $pids = ($existing | Select-Object -ExpandProperty Id) -join ", "
        Write-Host "[WARN] Cloudflare 터널이 이미 실행 중입니다. (PID: $pids)" -ForegroundColor Yellow
        $urlFile = Join-Path $LOG_DIR "tunnel_url.txt"
        if (Test-Path $urlFile) {
            $curUrl = Get-Content $urlFile -Raw -ErrorAction SilentlyContinue
            Write-Host "  - 현재 터널 주소: $curUrl" -ForegroundColor Cyan
        }
        $reChoice = Read-Host "기존 터널을 재시작할까요? (y/N)"
        if ($reChoice -eq "y" -or $reChoice -eq "Y") {
            Stop-CloudflareTunnel
            Start-Sleep -Seconds 1
        } else {
            return
        }
    }

    Write-Host "[INFO] Cloudflare 터널을 백그라운드로 시작합니다..." -ForegroundColor Cyan

    $tunnelLog = Join-Path $LOG_DIR "tunnel.log"
    if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }

    # cloudflared는 터널 접속 URL을 stderr로 출력함
    $cfProc = Start-Process $cfPath -ArgumentList "tunnel --url http://localhost:$PORT" `
        -RedirectStandardError $tunnelLog `
        -WindowStyle Hidden `
        -PassThru

    if ($cfProc) {
        $cfProc.Id | Out-File -FilePath (Join-Path $LOG_DIR "tunnel.pid") -Encoding ASCII
    }

    # URL 발급 대기 (최대 10초)
    Write-Host "[INFO] 외부 전용 보안 URL을 발급받는 중입니다..." -ForegroundColor Gray
    $tunnelUrl = ""
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $tunnelLog) {
            $logContent = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
            if ($logContent -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
                break
            }
        }
    }

    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host "✔ Cloudflare 터널 백그라운드 가동 완료" -ForegroundColor Green
    if ($tunnelUrl) {
        $tunnelUrl | Out-File -FilePath (Join-Path $LOG_DIR "tunnel_url.txt") -Encoding UTF8
        Write-Host "  - 외부 전용 주소: $tunnelUrl" -ForegroundColor Cyan
        Write-Host "  - 안내: 스마트폰이나 외부 어디서든 위 주소로 접속 가능합니다." -ForegroundColor White

        # frontend/tunnel.json 파일 갱신 및 Git 자동 푸시 (모든 기기 완전 무설정 동기화)
        $nowUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $tunnelJsonPath = ".\frontend\tunnel.json"
        $tunnelContent = @"
{
  "url": "$tunnelUrl",
  "status": "online",
  "updated_at": "$nowUtc"
}
"@
        [System.IO.File]::WriteAllText((Resolve-Path $tunnelJsonPath), $tunnelContent, [System.Text.Encoding]::UTF8)

        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
        if ($gitCmd) {
            Load-Env
            Sync-GitCredentials
            Write-Host "  - [Git] tunnel.json 동기화 커밋 및 푸시 진행 중..." -ForegroundColor Cyan
            git add .\frontend\tunnel.json 2>$null | Out-Null
            git commit -m "Chore: Cloudflare 터널 주소 갱신 ($tunnelUrl)" 2>$null | Out-Null
            git push origin main 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  - ✔ GitHub Pages 동기화 완료: 모든 기기(스마트폰/PC)에서 즉시 자동 연결됩니다." -ForegroundColor Green
            } else {
                Write-Host "  - [WARN] Git push 실패 (네트워크 또는 인증 확인 필요)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  - 터널 프로세스가 시작되었습니다. 주소 확인은 13번 메뉴를 이용하세요." -ForegroundColor Yellow
    }
    Write-Host "=================================================" -ForegroundColor Green
}

function Stop-CloudflareTunnel {
    Write-Host "[INFO] Cloudflare 터널을 점검하고 종료합니다..." -ForegroundColor Cyan
    $stopped = 0

    # frontend/tunnel.json 오프라인 갱신 및 Git 자동 푸시
    $nowUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $tunnelJsonPath = ".\frontend\tunnel.json"
    if (Test-Path $tunnelJsonPath) {
        $tunnelContent = @"
{
  "url": "",
  "status": "offline",
  "updated_at": "$nowUtc"
}
"@
        [System.IO.File]::WriteAllText((Resolve-Path $tunnelJsonPath), $tunnelContent, [System.Text.Encoding]::UTF8)

        $gitCmd = Get-Command git -ErrorAction SilentlyContinue
        if ($gitCmd) {
            Load-Env
            Sync-GitCredentials
            git add .\frontend\tunnel.json 2>$null | Out-Null
            git commit -m "Chore: Cloudflare 터널 종료 (오프라인 전환)" 2>$null | Out-Null
            git push origin main 2>$null | Out-Null
        }
    }

    $pidFile = Join-Path $LOG_DIR "tunnel.pid"
    if (Test-Path $pidFile) {
        $savedPid = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue)
        $pIdNum = 0
        if ($savedPid -and [int]::TryParse($savedPid.Trim(), [ref]$pIdNum) -and $pIdNum -gt 4) {
            cmd.exe /c "taskkill /F /PID $pIdNum /T" 2>$null | Out-Null
            $stopped++
        }
        Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    }

    cmd.exe /c "taskkill /F /IM cloudflared.exe /T" 2>$null | Out-Null
    Get-Process -Name cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        $stopped++
    }

    $urlFile = Join-Path $LOG_DIR "tunnel_url.txt"
    if (Test-Path $urlFile) { Remove-Item $urlFile -Force -ErrorAction SilentlyContinue }

    Start-Sleep -Milliseconds 500
    if ($stopped -gt 0) {
        Write-Host "[INFO] Cloudflare 터널이 정상적으로 종료되었습니다." -ForegroundColor Green
    } else {
        Write-Host "[INFO] 현재 실행 중인 Cloudflare 터널이 없습니다." -ForegroundColor Yellow
    }
}

function Check-CloudflareTunnel {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  Cloudflare 터널 상태 점검" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan

    $procs = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if ($procs) {
        $pids = ($procs | Select-Object -ExpandProperty Id) -join ", "
        $urlFile = Join-Path $LOG_DIR "tunnel_url.txt"
        $curUrl = "확인 중 (잠시 후 다시 조회하세요)"
        if (Test-Path $urlFile) {
            $curUrl = (Get-Content $urlFile -Raw -ErrorAction SilentlyContinue).Trim()
        } elseif (Test-Path (Join-Path $LOG_DIR "tunnel.log")) {
            $logContent = Get-Content (Join-Path $LOG_DIR "tunnel.log") -Raw -ErrorAction SilentlyContinue
            if ($logContent -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
                $curUrl = $matches[0]
            }
        }

        Write-Host "✔ Cloudflare 터널:" -ForegroundColor Green
        Write-Host "  - 상태         : 정상 가동 중 (RUNNING, Background)" -ForegroundColor Green
        Write-Host "  - 외부 접속 URL: $curUrl" -ForegroundColor Cyan
        Write-Host "  - GitHub Pages : https://hc-bang.github.io/guma/ (무설정 자동 연결)" -ForegroundColor Green
        Write-Host "  - 프로세스 PID : $pids" -ForegroundColor Gray
    } else {
        Write-Host "✖ Cloudflare 터널:" -ForegroundColor Red
        Write-Host "  - 상태         : 중지됨 (STOPPED)" -ForegroundColor Red
    }
    Write-Host "================================================" -ForegroundColor Cyan
}

# ==========================================
# 91, 92, 93: 환경 및 패키지 설정
# ==========================================

function Install-CloudflaredTool {
    Write-Host "[INFO] winget 도구를 통해 Cloudflare(cloudflared) 설치를 시작합니다..." -ForegroundColor Cyan
    winget install --id Cloudflare.cloudflared
    Print-TaskResult

    $path = Get-CloudflaredPath
    if ($path) {
        Write-Host "[INFO] cloudflared 설치가 정상 확인되었습니다. (경로: $path)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] 설치 완료 후 현재 터미널을 재시작해야 명령어가 인식될 수 있습니다." -ForegroundColor Yellow
    }
}

function Install-GitTool {
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCmd) {
        $ver = (& git --version)
        Write-Host "[INFO] 이미 Git이 설치되어 있습니다. ($ver)" -ForegroundColor Yellow
        return
    }

    Write-Host "[INFO] winget 도구를 통해 Git 설치를 시작합니다..." -ForegroundColor Cyan
    winget install --id Git.Git -e --source winget
    Print-TaskResult

    $checkGit = Get-Command git -ErrorAction SilentlyContinue
    if ($checkGit) {
        Write-Host "[INFO] Git 설치가 정상 확인되었습니다." -ForegroundColor Green
    } else {
        Write-Host "[WARN] 설치 완료 후 현재 터미널을 재시작해야 git 명령어가 인식될 수 있습니다." -ForegroundColor Yellow
    }
}

function Install-Aria2Tool {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  aria2 다운로드 엔진 설치 (Install aria2)" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan

    $aria2Cmd = Get-Command aria2c -ErrorAction SilentlyContinue
    if ($aria2Cmd) {
        $ver = (& aria2c --version | Select-Object -First 1)
        Write-Host "[INFO] 이미 aria2가 설치되어 있습니다. ($ver)" -ForegroundColor Yellow
        return
    }

    Write-Host "[INFO] winget 도구를 통해 aria2 설치를 시작합니다..." -ForegroundColor Cyan
    winget install --id aria2.aria2 -e --source winget
    Print-TaskResult

    $checkAria2 = Get-Command aria2c -ErrorAction SilentlyContinue
    if ($checkAria2) {
        Write-Host "[INFO] aria2 설치가 정상 확인되었습니다." -ForegroundColor Green
    } else {
        Write-Host "[WARN] 설치 완료 후 현재 터미널을 재시작해야 aria2c 명령어가 인식될 수 있습니다." -ForegroundColor Yellow
    }
}

function Uninstall-Aria2Tool {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  aria2 다운로드 엔진 설치 제거 (Uninstall aria2)" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan

    $aria2Cmd = Get-Command aria2c -ErrorAction SilentlyContinue
    if (-not $aria2Cmd) {
        Write-Host "[INFO] aria2가 설치되어 있지 않습니다." -ForegroundColor Yellow
        return
    }

    $confirm = Read-Host "정말로 aria2를 시스템에서 삭제하시겠습니까? (y/N)"
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "[INFO] winget 도구를 통해 aria2를 삭제합니다..." -ForegroundColor Cyan
        winget uninstall --id aria2.aria2
        Print-TaskResult
    } else {
        Write-Host "[INFO] 삭제 작업을 취소했습니다." -ForegroundColor Gray
    }
}

# ==========================================
# 메뉴 루프
# ==========================================

function Show-Menu {
    Clear-Host
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  GUMA™ 단일 통합 서버 관리 대시보드" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  통합 웹 서버 제어 (포트: $PORT)" -ForegroundColor DarkCyan
    Write-Host " 1. 백그라운드 서버 시작 (Start Server)"
    Write-Host " 2. 백그라운드 서버 종료 (Stop Server)"
    Write-Host " 3. 백그라운드 서버 상태 확인 (Server Status)"
    Write-Host " 4. 프로젝트 최신 버전 업데이트 (Git Pull)"
    Write-Host ""
    Write-Host "■  Cloudflare 터널 제어 (외부 보안 연동)" -ForegroundColor DarkCyan
    Write-Host " 11. 터널 시작 (Start Tunnel, 백그라운드)"
    Write-Host " 12. 터널 종료 (Stop Tunnel)"
    Write-Host " 13. 터널 상태 및 주소 확인 (Tunnel Status)"
    Write-Host ""
    Write-Host "■  환경 및 패키지 설정" -ForegroundColor DarkCyan
    Write-Host " 91. 파이썬 가상환경(.venv) 생성"
    Write-Host " 92. 백엔드 패키지 설치 (backend/requirements.txt)"
    Write-Host " 93. Cloudflare(cloudflared) 설치"
    Write-Host " 94. Git 도구 설치 (Install Git)"
    Write-Host " 95. aria2 엔진 설치 (Install aria2)"
    Write-Host " 96. aria2 엔진 설치 제거 (Uninstall aria2)"
    Write-Host "`n 0. 프로그램 종료"
    Write-Host "================================================" -ForegroundColor Cyan
}

while ($true) {
    Show-Menu
    $choice = Read-Host "메뉴를 선택하세요"

    if ($choice -eq "0") {
        break
    }

    switch ($choice) {
        "1" { Start-UnifiedServer }
        "2" { Stop-UnifiedServer }
        "3" { Check-UnifiedServer }
        "4" { Update-Project }
        "11" { Start-CloudflareTunnel }
        "12" { Stop-CloudflareTunnel }
        "13" { Check-CloudflareTunnel }
        "91" {
            if (Test-Path ".\.venv") {
                Write-Host "[INFO] 이미 가상환경(.venv)이 존재합니다." -ForegroundColor Yellow
            } else {
                Write-Host "[INFO] 새로운 가상환경(.venv)을 생성합니다..." -ForegroundColor Green
                python -m venv .venv
                Print-TaskResult
            }
        }
        "92" {
            if (-not (Test-Path $VENV_PYTHON)) {
                Write-Host "[ERROR] 가상환경이 없습니다. 91번 메뉴를 먼저 실행하세요." -ForegroundColor Red
            } else {
                if (-not (Test-Path ".\backend\requirements.txt")) {
                    Write-Host "[ERROR] backend/requirements.txt 파일이 없습니다." -ForegroundColor Red
                } else {
                    Write-Host "[INFO] 백엔드 패키지 설치를 시작합니다..." -ForegroundColor Green
                    $oldEAP = $ErrorActionPreference
                    $ErrorActionPreference = "SilentlyContinue"
                    & $VENV_PYTHON -m pip install -r backend/requirements.txt 2>&1 | Tee-Object -Variable pipOut
                    $ErrorActionPreference = $oldEAP

                    if ($pipOut -match "A new release of pip is available") {
                        Write-Host ""
                        $upChoice = Read-Host "[!] pip 업데이트 안내가 감지되었습니다. 지금 업데이트할까요? (y/N)"
                        if ($upChoice -eq "y" -or $upChoice -eq "Y") {
                            Write-Host "[INFO] pip 도구를 최신으로 업데이트합니다..." -ForegroundColor Cyan
                            & $VENV_PYTHON -m pip install --upgrade pip
                        }
                    }
                    Print-TaskResult
                }
            }
        }
        "93" { Install-CloudflaredTool }
        "94" { Install-GitTool }
        "95" { Install-Aria2Tool }
        "96" { Uninstall-Aria2Tool }
        default { Write-Host "[WARN] 잘못된 선택입니다." -ForegroundColor Red }
    }

    Write-Host "`n메뉴로 돌아가려면 아무 키나 누르세요."
    $null = [Console]::ReadKey($true)
}

Write-Host "[INFO] 프로그램을 종료합니다." -ForegroundColor Green
Start-Sleep -Seconds 1
Clear-Host
