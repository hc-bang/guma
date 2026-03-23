# setup-project.ps1
$agentsRepo = "https://github.com/hc-bang/AntigravityAgents.git"

Write-Host "--- 프로젝트 환경 구성 시작 ---" -ForegroundColor Cyan

# 1. 기존 .agents 폴더가 있다면 삭제 (충돌 방지)
if (Test-Path ".agents") { Remove-Item -Recurse -Force ".agents" }

# 2. 서브모듈로 에이전트 레포 연결
git submodule add $agentsRepo .agents
git submodule update --init --recursive

# 3. 안티그레비티가 이 구조를 인식하도록 설정 (필요시)
Write-Host "연결 완료! 이제 안티그레비티 GUI에서 .agents 폴더 내 파일을 수정하세요." -ForegroundColor Green