# GUMA™ — 운용 통합 마스터 가이드

> 검색, 북마크, 문서 뷰어, 자료실까지 한곳에서 통합 관리하는 서버리스 브라우저 시작 페이지입니다.

![GitHub Pages](https://img.shields.io/badge/Hosted-GitHub%20Pages-181717?logo=github&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![No Framework](https://img.shields.io/badge/Framework-None-brightgreen)

---

## 📌 목차

1. [🔍 프로젝트 개요](#1--프로젝트-개요)
2. [🗂️ 전체 디렉토리 구조](#2-️-전체-디렉토리-구조)
3. [🚀 빠른 시작 & 로컬 실행](#3--빠른-시작--로컬-실행)
4. [🖥️ 대시보드 화면 및 주요 기능](#4-️-대시보드-화면-및-주요-기능)
   - [4.1. 화면 구성](#41-화면-구성)
   - [4.2. 주요 기능 상세](#42-주요-기능-상세)
   - [4.3. 환경설정 및 데이터 백업/복원](#43-환경설정-및-데이터-백업복원)
   - [4.4. 팁 & 주의사항](#44-팁--주의사항)
5. [⚙️ 시스템 구성 및 콘텐츠 관리](#5-️-시스템-구성-및-콘텐츠-관리)
   - [5.1. 기본 구성(Configuration) 파일](#51-기본-구성configuration-파일)
   - [5.2. 신규 콘텐츠 추가 (문서 · 도구 · 자료실)](#52-신규-콘텐츠-추가-문서--도구--자료실)
   - [5.3. 공통 모듈 (`shared/`) 활용](#53-공통-모듈-shared-활용)
   - [5.4. `localStorage` 데이터 명세](#54-localstorage-데이터-명세)
   - [5.5. UI 커스터마이징](#55-ui-커스터마이징)
6. [🌐 배포 및 운용 가이드](#6--배포-가이드)
   - [6.1. 프론트엔드 배포 (GitHub Pages)](#61-프론트엔드-배포-github-pages)
   - [6.2. 단일 통합 서버 운용 (로컬 / 홈서버)](#62-단일-통합-서버-운용-로컬--홈서버)

---

## 1. 🔍 프로젝트 개요

**GUMA™**는 별도의 백엔드 서버나 프레임워크 없이 단일 정적 파일(HTML, CSS, JS)만으로 구동되는 개인용 브라우저 새 탭 대시보드입니다.

- **서버리스 동작:** 백엔드 구축 없이 브라우저 내에서 완전하게 동작합니다.
- **빠른 응답속도:** 경량화된 Vanilla JS 구현으로 즉각적인 반응성과 쾌적한 UX를 제공합니다.
- **풍부한 내장 유틸리티:** 마크다운 문서 뷰어, 자료실 및 상단 북마크 연결 외부 개발 도구를 탑재하고 있습니다.
- **데이터 백업/복원:** 모든 개인화 설정(북마크, 바로가기 등)은 JSON 기반 내보내기/불러오기로 손쉽게 관리할 수 있습니다.

---

## 2. 🗂️ 전체 디렉토리 구조

```
guma/                                   # 단일 Git 저장소
│
├── manage.ps1                          # [Windows 통합 관리 스크립트] (PowerShell 대시보드)
├── manage.sh                           # [Ubuntu/Linux 통합 관리 스크립트] (Bash 대시보드)
│
├── frontend/                           # [1] 프론트엔드 영역 (GitHub Pages 배포 및 정적 웹)
│   ├── index.html                      # 대시보드 메인 페이지
│   ├── script.js                       # 대시보드 스크립트
│   ├── style.css                       # 대시보드 전역 스타일
│   ├── menu.json, favicon.svg          # 메뉴 및 파비콘
│   ├── shared/                         # 공통 모듈 (topbar, theme, tree)
│   ├── config/                         # 환경설정 UI & JSON 기본 데이터
│   ├── posts/                          # 문서 뷰어
│   ├── resources/                      # 자료실
│   ├── games/                          # 내장 미니게임 3종
│   └── youtube/                        # 유튜브 클립 & 음원 다운로더
│
├── backend/                            # [2] 파이썬 백엔드 영역 (FastAPI 단일 통합 서빙)
│   ├── main.py                         # FastAPI 웹 앱 메인 진입점 (정적 웹 + API 통합)
│   ├── requirements.txt                # 파이썬 의존성 패키지 (fastapi, uvicorn, yt-dlp)
│   └── app/                            # API 라우터 (youtube 다운로더 등)
│
├── database/                           # [3] 데이터베이스 DDL & SQL 관리 영역
│   ├── schema.sql                      # PostgreSQL 테이블 생성 쿼리 (CREATE TABLE)
│   ├── seed.sql                        # 초기 기본 데이터 삽입 쿼리 (INSERT INTO)
│   └── migrations/                     # 스키마 변경 이력 SQL 모음
│
├── .gitignore                          # Git 버전 관리 예외 파일
└── README.md                           # 차세대 통합 운용 마스터 가이드
```

---

## 3. 🚀 빠른 시작 & 로컬 실행

프로젝트 루트에서 단일 관리 스크립트(`manage.ps1`)를 통해 파이썬 가상환경 구축부터 패키지 설치, 프론트엔드 및 백엔드 서버 가동을 선택형 콘솔 메뉴로 실행할 수 있습니다.

1. **통합 관리 스크립트 실행 (PowerShell):**
   ```powershell
   .\manage.ps1
   ```

2. **메뉴 기능 선택:**
   - **`1`**: 프론트엔드 웹 서버 가동 (`http://localhost:80`)
   - **`2`**: 백엔드 FastAPI 서버 가동 (`http://127.0.0.1:8000`)
   - **`91`**: 파이썬 가상환경(`.venv`) 최초 생성
   - **`92`**: 백엔드 의존성 패키지 설치 (`backend/requirements.txt`)
   - **`0`**: 프로그램 종료

---

## 4. 🖥️ 대시보드 화면 및 주요 기능

### 4.1. 화면 구성

| 영역 | 설명 |
| :--- | :--- |
| **상단 북마크 바** | 자주 방문하는 사이트 링크 및 폴더형 드롭다운 메뉴 |
| **메인 검색창** | 다중 검색 엔진 전환, 빠른 키보드 자동 입력 지원 |
| **바로가기 그리드** | 자주 방문하는 사이트 아이콘 모음 (추가/삭제 가능) |
| **좌측 사이드바** | 문서 · 자료실 · 게임 · 환경설정 페이지 이동 |

### 4.2. 주요 기능 상세

1. **🔍 검색 엔진 활용**
   - 검색창 좌측 아이콘을 클릭하여 다중 검색 엔진(네이버, 구글, 유튜브, GitHub, Bing 등)을 선택할 수 있습니다.
   - 검색어 입력 후 `Enter`를 누르면 해당 엔진으로 이동하며, 선택한 엔진은 브라우저에 자동 저장됩니다.
2. **⭐ 바로가기 그리드 (Shortcuts)**
   - **추가:** 그리드의 `+` 아이콘을 클릭하여 사이트 이름과 URL을 등록합니다.
   - **삭제:** 바로가기 아이콘을 **우클릭**하여 손쉽게 삭제할 수 있습니다.
   - **순서 관리:** 환경설정 페이지에서 전체 순서를 직접 편집할 수 있습니다.
3. **🔖 상단 북마크 바**
   - 단일 사이트 링크 클릭 시 즉시 이동하며, 폴더 항목은 마우스 호버 시 중첩 드롭다운 메뉴로 펼쳐집니다.
4. **🌙 다크 / 라이트 모드**
   - 우측 상단 🌙/☀️ 버튼으로 테마를 교체합니다. 첫 방문 시 OS 시스템 설정 테마를 자동 감지합니다.
5. **📄 문서 뷰어**
   - Markdown 문서를 깔끔하게 파싱하여 보여주며, 코드 블록 자동 구문 강조(Syntax Highlighting)를 지원합니다.
6. **🗂️ 자료실**
   - 트리 구조 인터페이스로 폴더 및 파일을 탐색하고 다운로드/링크 이동을 할 수 있습니다.
7. **🎮 게임**
   - 내장 게임 월드(Game World) 페이지로 바로 연결되며, 3종 미니게임(테트리스, 스네이크, 갤러그)을 즉시 플레이할 수 있습니다.
8. **🎬 유튜브 클립/음원 다운로더 (`/youtube`)**
   - YouTube 영상 URL 분석 및 원하는 구간(Start/End) 정밀 트리밍을 지원합니다.
   - 고화질 MP4 동영상 및 고음질 MP3 음원을 직접 다운로드할 수 있습니다.
   - 관심 채널 등록/관리 및 최신 영상 피드 무한 스크롤(Infinite Scroll) 탐색을 지원합니다.
   - 클라우드 백엔드(FastAPI + yt-dlp + ffmpeg)와 연동되어 안정적인 변환 처리를 수행합니다.

### 4.3. 환경설정 및 데이터 백업/복원

사이드바 ⚙️ **환경설정** 메뉴에서 개인화 설정을 관리할 수 있습니다.

- **북마크 GUI 편집:** 상단 북마크 바의 구조를 GUI 화면에서 직접 추가/수정/삭제합니다.
- **바로가기 관리:** 바로가기 그리드 목록과 순서를 관리합니다.
- **데이터 내보내기/불러오기:** 모든 개인 설정을 JSON 파일로 백업하고, 필요 시 복원합니다.
- **초기화:** 설정을 초기 기본 데이터로 리셋합니다.

### 4.4. 팁 & 주의사항

> [!TIP]
> 검색창에 마우스 포커스가 없더라도 키보드를 입력하면 검색창에 자동으로 문자가 입력됩니다.

> [!WARNING]
> 모든 설정 데이터(북마크, 바로가기, 테마)는 브라우저의 `localStorage`에 보관됩니다.  
> 브라우저 데이터/쿠키를 삭제하거나 다른 PC에서 접속하면 설정이 초기화되므로, 중요한 설정은 **환경설정의 데이터 내보내기**로 백업해 두는 것을 권장합니다.

---

## 5. ⚙️ 시스템 구성 및 콘텐츠 관리

### 5.1. 기본 구성(Configuration) 파일

모든 기본 구성 데이터는 `config/` 디렉터리의 JSON 파일에 수록되어 있습니다.

모든 기본 구성 데이터는 `config/` 디렉터리의 JSON 파일을 통해 관리됩니다.

### 5.2. 신규 콘텐츠 추가 (문서 · 자료실)

#### 1) 문서 (Post) 추가
1. `posts/files/{카테고리}/{파일명}.md` 경로에 마크다운 파일 작성
2. `posts/index.json`의 `files` 배열에 항목 추가:
   ```json
   { "group": "카테고리", "file": "파일명.md", "display": "화면 표시 제목" }
   ```

#### 2) 도구 (Tool) 추가
1. `tools/files/{도구명}.html` 파일 생성 (`../tool.css` 링크 및 아래 테마 동기화 코드 삽입):
   ```javascript
   if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
   window.addEventListener('storage', e => e.key === 'theme' && document.body.classList.toggle('dark', e.newValue === 'dark'));
   window.addEventListener('message', e => e.data?.type === 'themeChange' && document.body.classList.toggle('dark', e.data.theme === 'dark'));
   ```
2. `tools/index.json`에 정보 등록:
   ```json
   { "group": "그룹명", "file": "files/도구명.html", "display": "도구 이름" }
   ```

#### 3) 자료실 (Resource) 추가
`resources/index.json`의 `files` 배열에 항목 추가 (`file`에 `https://` 연결 시 외부 다운로드 주소로 자동 지정됨):
```json
{
  "group": "카테고리/하위그룹",
  "file": "files/example.zip",
  "display": "화면 표시 이름",
  "desc": "파일 설명"
}
```

### 5.3. 공통 모듈 (`shared/`) 활용

| 파일 경로 | 핵심 역할 |
| :--- | :--- |
| `shared/topbar.js` | 상단 북마크 바 렌더링 및 사이드바 메뉴 동적 로딩 (`menu.json` 연동) |
| `shared/theme-effects.js` | 다크/라이트 테마 전환 및 파티클(Embers) 시각 효과 |
| `shared/tree.js` | 트리 데이터 재귀 렌더링 유틸리티 |
| `shared/tree.css` | 트리 용 스타일 Sheet |

각 HTML 페이지에서 `shared/topbar.js` 활용 시 로딩 전 `window.GUMA` 사전 정의가 필요합니다.
```html
<!-- 루트 페이지 예시 -->
<script>window.GUMA = { root: './', page: '' };</script>
<script src="./shared/topbar.js"></script>

<!-- 하위 디렉토리(예: tools/) 예시 -->
<script>window.GUMA = { root: '../', page: 'tools' };</script>
<script src="../shared/topbar.js"></script>
```

### 5.4. `localStorage` 데이터 명세

| 키 (Key) | 저장 내용 설명 |
| :--- | :--- |
| `theme` | `"dark"` 또는 `"light"` (현재 테마) |
| `engine` | 마지막 선택 검색 엔진 ID |
| `bookmarks` | 사용자 정의 바로가기 그리드 데이터 (JSON) |
| `topBookmarks` | 사용자 정의 상단 북마크 데이터 (JSON) |
| `faviconCache::{origin}` | 도메인별 파비콘 로딩 캐시 |

### 5.5. UI 커스터마이징

`style.css` 상단의 CSS 루트 변수를 수정하여 글로벌 색상 시스템을 조절합니다.

```css
:root {
  --accent:  #1a73e8;  /* 강조 색상 */
  --bg:      #ffffff;  /* 라이트 배경 */
  --panel:   #ffffff;  /* 패널 배경 */
}

body.dark {
  --accent:  #60a5fa;
  --bg:      #0f172a;  /* 다크 배경 */
  --panel:   #1e293b;
}
```

---

## 6. 🌐 배포 가이드

### 6.1. 프론트엔드 배포 (GitHub Pages)

1. 저장소를 GitHub 원격 레포지토리에 푸시합니다.
2. `Settings` > `Pages` > `Build and deployment` > `Source`를 `Deploy from a branch`로 선택합니다.
3. `main` 브랜치의 `/ (root)` 디렉토리를 선택 후 저장합니다.
4. 배포 완료 후 `https://{username}.github.io/{repository}/`로 접속 가능합니다.

> [!NOTE]
> 루트에 `.nojekyll` 파일이 존재해야 언더스코어(`_`)로 시작하는 내부 경로가 차단 없이 정상 배포됩니다. (기본 제공됨)

### 6.2. 단일 통합 서버 및 외부 터널 운용 (manage.ps1)

루트의 `manage.ps1` 대시보드를 통해 **웹 서버와 Cloudflare 보안 터널을 모두 백그라운드로 안전하게 가동 및 관리**할 수 있습니다.

- **통합 웹 서버 제어 (포트 80)**:
  - `1`: 백그라운드 서버 시작 (통합 웹 + API 가동)
  - `2`: 백그라운드 서버 종료 (프로세스 및 포트 해제)
  - `3`: 백그라운드 서버 상태 점검
- **Cloudflare 보안 터널 제어 (외부 연동)**:
  - `11`: 터널 백그라운드 가동 (외부 전용 HTTPS URL 자동 발급)
  - `12`: 터널 종료
  - `13`: 터널 상태 및 현재 발급된 URL 확인
- **환경 구축**:
  - `91`: 파이썬 가상환경 생성 / `92`: 백엔드 패키지 설치 / `93`: Cloudflare CLI 설치
