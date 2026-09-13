# Usage: .\manage.ps1

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$PORT = "80"
$VENV_PYTHON = ".\.venv\Scripts\python.exe"

function Print-TaskResult {
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[INFO] 작업이 정상적으로 완료되었습니다." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] 작업 중 오류가 발생했습니다. 메시지를 확인하세요." -ForegroundColor Red
    }
}

function Start-UnifiedServer {
    # 1. 유효성 검사
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

    # 2. 포트 80 점유 여부 확인
    $conn = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $pids = ($conn | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        Write-Host "[WARN] 포트 $PORT 을 사용하는 다른 프로세스가 이미 실행 중입니다. (PID: $pids)" -ForegroundColor Yellow
        Write-Host "[HINT] IIS 웹 서버, Skype, 기타 웹 서버가 포트 80을 점유하고 있는지 확인하세요." -ForegroundColor Gray
        $reChoice = Read-Host "강제로 점유 프로세스를 종료하고 시작할까요? (y/N)"
        if ($reChoice -eq "y" -or $reChoice -eq "Y") {
            foreach ($procId in ($conn | Select-Object -ExpandProperty OwningProcess -Unique)) {
                if ($procId -gt 4) {
                    cmd.exe /c "taskkill /F /PID $procId /T" 2>$null | Out-Null
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
            Start-Sleep -Seconds 1
        } else {
            Write-Host "[INFO] 서버 시작을 취소했습니다." -ForegroundColor Gray
            return
        }
    }

    # 3. README.md 동기화
    if (Test-Path ".\README.md") {
        Copy-Item -Path ".\README.md" -Destination ".\frontend\README.md" -Force
    }

    # 4. 안내 출력
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host "✔ GUMA™ 단일 통합 서버 실행 (Port $PORT)" -ForegroundColor Green
    Write-Host "  [종료 안내] 서버를 중지하려면 언제든지 Ctrl + C 를 누르세요." -ForegroundColor Yellow
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host ""

    # 5. 포그라운드 실행 (실시간 로그 표시 및 Ctrl+C 로 정상 종료 지원)
    & $VENV_PYTHON -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT --reload

    Write-Host "`n[INFO] 서버가 안전하게 중지되었습니다." -ForegroundColor Cyan
}

function Show-Menu {
    Clear-Host
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  GUMA™ 통합 서버 관리 대시보드" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  서버 제어 (포트: $PORT)" -ForegroundColor DarkCyan
    Write-Host " 1. 서버 실행 (통합 웹 + API, Foreground)"
    Write-Host ""
    Write-Host "■  환경 및 패키지 설정" -ForegroundColor DarkCyan
    Write-Host " 91. 파이썬 가상환경(.venv) 생성"
    Write-Host " 92. 백엔드 패키지 설치 (backend/requirements.txt)"
    Write-Host "`n 0. 프로그램 종료"
    Write-Host "================================================" -ForegroundColor Cyan
}

do {
    Show-Menu
    $choice = Read-Host "메뉴를 선택하세요"
    
    switch ($choice) {
        "0" { break }
        "1" { Start-UnifiedServer }
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
        default { Write-Host "[WARN] 잘못된 선택입니다." -ForegroundColor Red }
    }
    
    if ($choice -ne "0") {
        Write-Host "`n메뉴로 돌아가려면 아무 키나 누르세요."
        $null = [Console]::ReadKey($true)
    }
} while ($choice -ne "0")

Write-Host "[INFO] 프로그램을 종료합니다." -ForegroundColor Green
Start-Sleep -Seconds 1
Clear-Host
