# Usage: .\manage.ps1

$VENV_PYTHON = ".\.venv\Scripts\python.exe"

function Print-TaskResult {
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[INFO] 작업이 정상적으로 완료되었습니다." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] 작업 중 오류가 발생했습니다. 로그를 확인하세요." -ForegroundColor Red
    }
}

function Run-Frontend {
    if (-not (Test-Path ".\frontend")) {
        Write-Host "[ERROR] frontend 디렉터리가 존재하지 않습니다." -ForegroundColor Red
        return
    }

    # 루트 README.md를 frontend/README.md로 자동 동기화 (문서 뷰어 404 방지)
    if (Test-Path ".\README.md") {
        Copy-Item -Path ".\README.md" -Destination ".\frontend\README.md" -Force
    }

    Write-Host "[INFO] 프론트엔드 웹 서버를 시작합니다. (http://localhost:80)..." -ForegroundColor Cyan
    Write-Host "[INFO] 종료하려면 Ctrl+C를 누르세요.`n" -ForegroundColor Yellow

    python -m http.server 80 --directory frontend
}

function Run-FastAPI {
    if (-not (Test-Path $VENV_PYTHON)) {
        Write-Host "[ERROR] 가상환경(.venv)이 구축되지 않았습니다. 91번 메뉴를 먼저 실행하세요." -ForegroundColor Red
        return
    }

    if (-not (Test-Path ".\backend\main.py")) {
        Write-Host "[ERROR] 백엔드 진입점(backend/main.py)이 존재하지 않습니다." -ForegroundColor Red
        return
    }

    $port = "8000"
    Write-Host "[INFO] 백엔드 FastAPI 서버를 시작합니다. (http://127.0.0.1:$port)..." -ForegroundColor Cyan
    Write-Host "[INFO] API 문서 (Swagger): http://127.0.0.1:$port/docs" -ForegroundColor Green
    Write-Host "[INFO] 종료하려면 Ctrl+C를 누르세요.`n" -ForegroundColor Yellow

    & $VENV_PYTHON -m uvicorn backend.main:app --host 127.0.0.1 --port $port --reload
}

function Show-Menu {
    Clear-Host
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  GUMA™ 서버 관리 대시보드" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "■  서버 가동" -ForegroundColor DarkCyan
    Write-Host " 1. 프론트엔드 서버 시작 (Foreground, Port 80)"
    Write-Host " 2. 백엔드 FastAPI 서버 시작 (Foreground, Port 8000)"
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
        "1" { Run-Frontend }
        "2" { Run-FastAPI }
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
