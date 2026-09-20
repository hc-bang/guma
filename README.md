# GUMA™ — 운용 통합 마스터 가이드

> 검색, 북마크, 문서 뷰어, 자료실부터 유튜브 다운로더까지 한곳에서 통합 관리하는 차세대 3-Tier 하이브리드 브라우저 시작 페이지입니다.

![GitHub Pages](https://img.shields.io/badge/Hosted-GitHub%20Pages-181717?logo=github&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Neon PostgreSQL](https://img.shields.io/badge/Database-Neon%20Postgres-00E599?logo=postgresql&logoColor=black)
![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)

---

## 📌 목차

1. [🔍 프로젝트 개요](#1--프로젝트-개요)
2. [🗂️ 전체 디렉토리 구조](#2-️-전체-디렉토리-구조)
3. [🚀 빠른 시작 & 로컬 실행 (manage.ps1)](#3--빠른-시작--로컬-실행-manageps1)
4. [🖥️ 대시보드 화면 및 주요 기능](#4-️-대시보드-화면-및-주요-기능)
   - [4.1. 화면 구성](#41-화면-구성)
   - [4.2. 주요 기능 상세](#42-주요-기능-상세)
   - [4.3. 기기별 프로필 관리 (PC · 모바일)](#43-기기별-프로필-관리-pc--모바일)
   - [4.4. 환경설정 및 클라우드 DB 동기화](#44-환경설정-및-클라우드-db-동기화)
5. [⚙️ 데이터베이스 및 저장소 명세](#5-️-데이터베이스-및-저장소-명세)
   - [5.1. Neon PostgreSQL 테이블 구조](#51-neon-postgresql-테이블-구조)
   - [5.2. `localStorage` 데이터 명세](#52-localstorage-데이터-명세)
6. [📚 콘텐츠 관리 및 공통 모듈](#6--콘텐츠-관리-및-공통-모듈)
   - [6.1. 신규 콘텐츠 추가 (문서 · 자료실)](#61-신규-콘텐츠-추가-문서--자료실)
   - [6.2. 공통 모듈 (`shared/`)](#62-공통-모듈-shared)
7. [🌐 배포 및 운용 가이드](#7--배포-및-운용-가이드)
   - [7.1. 프론트엔드 배포 (GitHub Pages)](#71-프론트엔드-배포-github-pages)
   - [7.2. 단일 통합 서버 및 외부 터널 운용](#72-단일-통합-서버-및-외부-터널-운용)

---

## 1. 🔍 프로젝트 개요

**GUMA™**는 GitHub Pages 기반 정적 프론트엔드, FastAPI 로컬 통합 백엔드, 그리고 Neon Serverless PostgreSQL 클라우드 데이터베이스가 유기적으로 결합된 **3-Tier 하이브리드 대시보드**입니다.

* **단일 진실 공급원 (SSOT):** 모든 북마크, 바로가기, 검색 엔진, 유튜브 채널 설정이 Neon PostgreSQL 클라우드 DB에 영구 저장되어 어떤 기기나 브라우저에서 접속하든 실시간으로 동일한 최신 환경이 동기화됩니다.
* **기기별 맞춤 프로필:** 상단 탭에서 손쉽게 **기본 (PC)** 환경과 **모바일** 전용 환경을 전환하며 최적화된 바로가기와 북마크 구성을 사용할 수 있습니다.
* **초경량 & 초고속 UX:** 프레임워크 없는 순수 Vanilla JS로 빌드되어 번들링 지연 없이 즉각적인 반응성과 쾌적한 사용감을 보장합니다.
* **원스톱 미디어 & 유틸리티:** YouTube 클립/음원 다운로더, 마크다운 문서 뷰어, 파일 자료실, 레트로 미니게임 3종을 내장하고 있습니다.

---

## 2. 🗂️ 전체 디렉토리 구조

```
guma/                                   # 단일 Git 통합 저장소
│
├── manage.ps1                          # [Windows 통합 관리 스크립트] (PowerShell 대시보드)
├── manage.sh                           # [Linux 통합 관리 스크립트] (Bash 대시보드)
│
├── frontend/                           # [1] 프론트엔드 영역 (GitHub Pages 배포 및 정적 웹)
│   ├── index.html                      # 대시보드 메인 페이지
│   ├── script.js                       # 대시보드 메인 로직 (검색, 바로가기, 북마크)
│   ├── style.css                       # 대시보드 전역 스타일
│   ├── menu.json, favicon.svg          # 사이드바 메뉴 라우팅 및 파비콘
│   ├── shared/                         # 공통 모듈 (topbar, theme, tree)
│   ├── config/                         # 환경설정 화면 (config.css, config.js, index.html)
│   ├── posts/                          # 마크다운 문서 뷰어
│   ├── resources/                      # 트리 구조 파일 자료실
│   ├── games/                          # 내장 레트로 미니게임 3종
│   └── youtube/                        # 유튜브 클립 & 음원 다운로더
│
├── backend/                            # [2] 파이썬 백엔드 영역 (FastAPI 단일 통합 서빙)
│   ├── main.py                         # FastAPI 진입점 (정적 웹 서빙 + API 라우팅)
│   ├── requirements.txt                # 백엔드 의존성 패키지 (fastapi, psycopg2, yt-dlp 등)
│   └── app/                            # 핵심 모듈 (database.py, youtube_downloader.py 등)
│
├── database/                           # [3] 데이터베이스 DDL & SQL 관리 영역
│   ├── schema.sql                      # Neon PostgreSQL 테이블 생성 쿼리 (CREATE TABLE)
│   └── seed.sql                        # 실무 초기 시드 데이터 삽입 쿼리 (INSERT INTO)
│
├── .env                                # 로컬 환경 변수 (DATABASE_URL 등 - 보안 유지)
├── .env.example                        # 환경 변수 템플릿
├── .gitignore                          # Git 버전 관리 예외 파일
└── README.md                           # 차세대 통합 운용 마스터 가이드
```

---

## 3. 🚀 빠른 시작 & 로컬 실행 (manage.ps1)

프로젝트 루트의 `manage.ps1`을 실행하면 콘솔 메뉴를 통해 백엔드 환경 구성부터 통합 서버 구동, 외부 터널 연동까지 한곳에서 제어할 수 있습니다.

```powershell
.\manage.ps1
```

### 콘솔 메뉴 가이드
* **통합 웹 서버 제어 (포트 80)**:
  * `1`: 백그라운드 서버 시작 (프론트엔드 + FastAPI 통합 서빙)
  * `2`: 백그라운드 서버 종료 (프로세스 및 포트 안전 해제)
  * `3`: 서버 구동 상태 및 로그 실시간 점검
* **Cloudflare 보안 터널 제어 (외부 접속용)**:
  * `11`: 터널 백그라운드 시작 (외부 접속용 전용 HTTPS URL 발급 및 DB 자동 등록)
  * `12`: 터널 백그라운드 종료
  * `13`: 터널 상태 및 현재 발급된 URL 확인
* **환경 구축 및 설정**:
  * `91`: Python 가상환경(`.venv`) 생성
  * `92`: 백엔드 의존성 패키지 설치 (`requirements.txt`)
  * `93`: Cloudflare CLI (`cloudflared`) 자동 설치
  * `0`: 종료

---

## 4. 🖥️ 대시보드 화면 및 주요 기능

### 4.1. 화면 구성

| 영역 | 설명 |
| :--- | :--- |
| **상단 북마크 바** | 자주 찾는 사이트 링크 및 다단계 폴더형 드롭다운 메뉴 |
| **메인 검색창** | 다중 검색 엔진 전환, 키보드 자동 포커싱, 즉시 검색 |
| **바로가기 그리드** | 최대 15개의 자주 방문하는 사이트 타일 (추가/우클릭 삭제 가능) |
| **우측 사이드바** | 문서, 자료실, 게임, 유튜브 다운로더, 환경설정 이동 메뉴 |

### 4.2. 주요 기능 상세

1. **기기별 프로필 관리 (PC / 모바일)**
   * **환경설정(⚙️)** 탭 바 좌측의 프로필 선택기를 통해 PC와 모바일 환경에 맞는 최적화된 북마크/바로가기 구성을 선택 및 관리합니다.
   * 프로필 변경 시 해당 프로필의 설정이 클라우드 DB로부터 즉시 로드되어 반영됩니다.
2. **다중 검색 엔진**
   * 네이버, 구글, 유튜브 등 검색 엔진을 아이콘 클릭으로 손쉽게 전환할 수 있습니다.
   * 환경설정에서 검색 엔진의 **[표시 명칭]**과 **[검색 주소]**만 입력하면 호스트 도메인을 자동 추출하여 파비콘과 1줄로 단정하게 연동됩니다.
3. **바로가기 그리드 (Shortcuts)**
   * `+` 버튼으로 새 사이트를 등록하고, 타일을 **우클릭**하여 즉시 삭제할 수 있습니다.
4. **유튜브 클립 & 음원 다운로더 (`/youtube`)**
   * YouTube 영상 URL 분석, 원하는 구간 정밀 트리밍(Start/End)을 지원합니다.
   * 고화질 MP4 동영상 및 고음질 MP3 음원 다운로드, 채널별 피드 탐색을 제공합니다.
5. **다크 / 라이트 모드**
   * 우측 상단 🌙/☀️ 버튼으로 테마를 전환하며, 첫 방문 시 시스템 테마를 자동 감지합니다.

### 4.3. 환경설정 및 클라우드 DB 동기화

사이드바 ⚙️ **환경설정** 메뉴에서 북마크, 바로가기, 검색 엔진, 유튜브 관심 채널을 직관적으로 편집할 수 있습니다.

* **심플한 액션 버튼:** 불필요한 내보내기/불러오기/초기화 버튼을 배제하고, `[리로드]`와 `[적용]` 버튼으로 간결하게 구성했습니다.
* **클라우드 DB 즉시 저장:** `[적용]` 버튼 클릭 시 로컬 캐시가 아닌 **Neon PostgreSQL 클라우드 DB로 직접 저장**되어 즉시 전역 반영됩니다.
* **단정한 1줄 레이아웃:** 모든 항목의 `[삭제]` 버튼이 입력 필드 바로 우측 옆에 일정한 간격으로 나란히 배치되어 조작 편의성이 우수합니다.

---

## 5. ⚙️ 데이터베이스 및 저장소 명세

### 5.1. Neon PostgreSQL 테이블 구조

모든 데이터는 [`database/schema.sql`](file:///c:/workspace/git-hub(hc-bang)/guma/database/schema.sql)에 정의된 최신 스키마를 통해 중앙 집중 관리됩니다.

```sql
-- 1. system_config (시스템 전역 설정 및 Cloudflare 터널 주소)
CREATE TABLE system_config (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. profiles (기기별/사용자별 프로필)
CREATE TABLE profiles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. profile_configs (프로필별 설정 JSONB 데이터)
CREATE TABLE profile_configs (
    profile_id VARCHAR(50) REFERENCES profiles(id) ON DELETE CASCADE,
    config_type VARCHAR(50) NOT NULL,            -- 'topBookmarks', 'bookmarks', 'engines', 'youtube_channels'
    config_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(profile_id, config_type)
);
```

### 5.2. `localStorage` 데이터 명세

클라우드 DB 일원화 원칙에 따라, 브라우저 로컬 저장소에는 비동기 초기화를 위한 **최소한의 식별자**만 보관됩니다.

| 키 (Key) | 저장 내용 설명 |
| :--- | :--- |
| `guma_active_profile` | 현재 기기에서 활성화된 프로필 ID (`default` 또는 `mobile`) |
| `theme` | 현재 화면 테마 (`dark` 또는 `light`) |

---

## 6. 📚 콘텐츠 관리 및 공통 모듈

### 6.1. 신규 콘텐츠 추가 (문서 · 자료실)

#### 1) 문서 (Post) 추가
1. `posts/files/{카테고리}/{파일명}.md` 경로에 마크다운 파일 작성
2. `posts/index.json`의 `files` 배열에 항목 추가:
   ```json
   { "group": "카테고리", "file": "파일명.md", "display": "화면 표시 제목" }
   ```

#### 2) 자료실 (Resource) 추가
`resources/index.json`의 `files` 배열에 파일 또는 외부 링크 등록:
```json
{
  "group": "카테고리/하위그룹",
  "file": "files/example.zip",
  "display": "화면 표시 이름",
  "desc": "파일 설명"
}
```

### 6.2. 공통 모듈 (`shared/`)

| 파일 경로 | 핵심 역할 |
| :--- | :--- |
| `shared/topbar.js` | 상단 기기 선택기, 북마크 바 렌더링 및 사이드바 메뉴 동적 연동 (`menu.json`) |
| `shared/theme-effects.js` | 다크/라이트 테마 전환 및 파티클(Embers) 시각 효과 |
| `shared/tree.js` | 트리 데이터 재귀 렌더링 유틸리티 |

---

## 7. 🌐 배포 및 운용 가이드

### 7.1. 프론트엔드 배포 (GitHub Pages)

1. 저장소를 GitHub 원격 레포지토리에 푸시합니다.
2. 저장소의 `Settings` > `Pages` > `Build and deployment`에서 Source를 `Deploy from a branch`로 설정합니다.
3. `main` 브랜치의 `/ (root)` 디렉토리를 선택하고 저장하면 자동 배포됩니다.
4. 배포 완료 후 `https://{username}.github.io/{repository}/`로 접속 가능합니다.

### 7.2. 단일 통합 서버 및 외부 터널 운용

로컬 PC 또는 홈 서버에서 `manage.ps1`을 실행하여 24시간 안정적으로 개인 대시보드를 운용할 수 있습니다.
* 통합 서버(포트 80)를 실행하면 별도의 프론트엔드 빌드 과정 없이 정적 파일과 백엔드 API가 동시에 서빙됩니다.
* Cloudflare 터널(`manage.ps1` 메뉴 11)을 가동하면 공인 IP나 포트 포워딩 없이도 외부 어디서나 안전한 HTTPS 보안 주소로 개인 대시보드에 접근할 수 있습니다.

---

**GUMA™ — All-in-One Dashboard System**
