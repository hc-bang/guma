# PowerShell 명령어 가이드

PowerShell은 작업 자동화 및 구성 관리를 위해 설계된 강력한 명령줄 셸이자 스크립트 언어입니다. 본 문서는 자주 사용되는 주요 명령어들을 카운테고리별로 상세히 설명합니다.

---

## 1. 도움말 및 명령어 검색

PowerShell의 핵심은 스스로 학습할 수 있는 환경을 제공하는 것입니다.

### Get-Help
명령어 사용법, 파라미터, 예시 등을 확인할 수 있는 가장 중요한 명령어입니다.
- **별칭 (Alias):** `help`, `man`
- **주요 파라미터:**
    - `-Name`: 도움말을 확인할 명령어 이름
    - `-Examples`: 실제 사용 예시만 추출하여 표시
    - `-Detailed`: 상세한 정보 표시
- **예시:**
    ```powershell
    # Get-ChildItem 명령어의 도움말 확인
    Get-Help Get-ChildItem

    # Get-Service 명령어의 사용 예시만 확인
    Get-Help Get-Service -Examples
    ```

### Get-Command
현재 세션에서 사용할 수 있는 모든 명령어, 함수, 별칭 등을 검색합니다.
- **별칭 (Alias):** `gcm`
- **주요 파라미터:**
    - `-Name`: 검색할 이름 패턴 (와일드카드 `*` 지원)
    - `-CommandType`: 특정 유형(Cmdlet, Function, Alias 등)만 검색
- **예시:**
    ```powershell
    # 'IP'가 포함된 모든 명령어 검색
    Get-Command *IP*

    # 'ls'라는 별칭이 가리키는 실제 명령어 확인
    Get-Command ls
    ```

---

## 2. 파일 및 디렉토리 관리

Windows 탐색기에서 수행하는 대부분의 작업을 명령줄에서 처리할 수 있습니다.

### Get-ChildItem
특정 경로의 파일 및 폴더 목록을 가져옵니다.
- **별칭 (Alias):** `ls`, `dir`, `gci`
- **주요 파라미터:**
    - `-Path`: 대상 경로
    - `-Recurse`: 하위 디렉토리까지 모두 탐색
    - `-Filter`: 특정 파일명 패턴으로 필터링
- **예시:**
    ```powershell
    # 현재 디렉토리의 모든 파일 목록 표시
    Get-ChildItem

    # 특정 확장자(.log) 파일만 하위 폴더까지 검색
    Get-ChildItem -Path C:\Logs -Filter *.log -Recurse
    ```

### New-Item
새 파일이나 디렉토리를 생성합니다.
- **별칭 (Alias):** `ni`
- **주요 파라미터:**
    - `-Path`: 생성할 경로 및 이름
    - `-ItemType`: 생성할 종류 (`Directory` 또는 `File`)
    - `-Value`: 파일 생성 시 초기 내용 입력
- **예시:**
    ```powershell
    # 새 폴더 생성 (mkdir과 유사)
    New-Item -Path ".\test_folder" -ItemType Directory

    # 내용이 있는 새 텍스트 파일 생성
    New-Item -Path "log.txt" -ItemType File -Value "Hello PowerShell"
    ```

### Copy-Item / Move-Item
파일이나 폴더를 복사하거나 이동(이름 변경)합니다.
- **별칭:** `cp`/`copy`, `mv`/`move`
- **예시:**
    ```powershell
    # 파일 복사
    Copy-Item -Path .\config.json -Destination .\config_backup.json

    # 폴더 전체 이동
    Move-Item -Path .\old_docs -Destination .\new_docs
    ```

### Remove-Item
파일이나 폴더를 삭제합니다.
- **별칭:** `rm`, `del`, `erase`
- **주요 파라미터:**
    - `-Recurse`: 폴더 내 내용물이 있어도 강제 삭제
    - `-Force`: 읽기 전용 파일 등도 삭제
- **예시:**
    ```powershell
    # 특정 파일 삭제
    Remove-Item -Path .\temp.txt

    # 폴더와 그 안의 모든 내용을 강제 삭제
    Remove-Item -Path .\outdated_folder -Recurse -Force
    ```

---

## 3. 시스템 및 프로세스 제어

실행 중인 프로그램과 시스템 서비스의 상태를 관리합니다.

### Get-Process
현재 실행 중인 프로세스 목록을 확인합니다.
- **별칭:** `ps`, `gps`
- **예시:**
    ```powershell
    # 모든 프로세스 확인
    Get-Process

    # 특정 이름(chrome)으로 프로세스 검색
    Get-Process -Name chrome
    ```

### Stop-Process
실행 중인 프로세스를 종료합니다.
- **별칭:** `kill`, `spps`
- **주요 파라미터:**
    - `-Id`: 프로세스 ID(PID)로 지정
    - `-Name`: 프로세스 이름으로 지정
- **예시:**
    ```powershell
    # 응답 없는 메모장 종료
    Stop-Process -Name notepad
    ```

### Get-Service
시스템에 등록된 서비스 상태를 확인합니다.
- **별칭:** `gsv`
- **예시:**
    ```powershell
    # 'Running' 상태인 서비스만 확인
    Get-Service | Where-Object Status -eq 'Running'
    ```

---

## 4. 네트워크 및 유틸리티

네트워크 연결을 진단하거나 문자열을 처리할 때 유용합니다.

### Test-NetConnection
네트워크 연결 상태를 진단합니다. (ping 및 telnet 기능 포함)
- **별칭:** `tnc`
- **주요 파라미터:**
    - `-ComputerName`: 대상 호스트
    - `-Port`: 특정 포트 열림 여부 확인
- **예시:**
    ```powershell
    # 특정 서버의 80포트 통신 확인
    Test-NetConnection -ComputerName google.com -Port 80
    ```

### Select-String
파일 내에서 특정 문자열 패턴을 검색합니다. (grep과 유사)
- **별칭:** `sls`
- **예시:**
    ```powershell
    # 로그 파일에서 'Error'라는 단어가 포함된 줄 찾기
    Get-Content server.log | Select-String "Error"
    ```

---

## 5. 파이프라인 활용 (PowerShell의 강점)

PowerShell의 가장 강력한 특징은 명령어의 **출력(객체)**을 다른 명령어의 **입력**으로 전달하는 파이프라인(`|`)입니다.

- **필터링 (`Where-Object`):**
    ```powershell
    # 100MB 이상 사용하는 프로세스만 추출
    Get-Process | Where-Object WorkingSet -gt 100MB
    ```

- **반복 처리 (`ForEach-Object`):**
    ```powershell
    # 현재 디렉토리의 모든 .tmp 파일을 찾아 삭제
    Get-ChildItem *.tmp | ForEach-Object { Remove-Item $_.FullName }
    ```

- **정렬 및 선택:**
    ```powershell
    # CPU 사용량이 높은 순으로 상위 5개 프로세스 표시
    Get-Process | Sort-Object CPU -Descending | Select-Object -First 5
    ```

---

> [!NOTE]
> PowerShell 명령어는 대소문자를 구분하지 않지만, 가독성을 위해 PascalCase(예: `Get-ChildItem`) 사용을 권장합니다.
