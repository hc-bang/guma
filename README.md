# GUMA™ — 나만의 브라우저 시작 페이지

> 서버 없이, 정적 파일만으로 동작하는 개인용 브라우저 새 탭 대시보드입니다.  
> GitHub Pages 등 정적 호스팅 環境에 즉시 배포하여 사용할 수 있습니다.

![GitHub Pages](https://img.shields.io/badge/Hosted-GitHub%20Pages-181717?logo=github&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![No Framework](https://img.shields.io/badge/Framework-None-brightgreen)
![License](https://img.shields.io/badge/License-Personal%20Use-blue)

---

## 📘 상세 문서

| 문서 | 설명 |
|------|------|
| 📋 [프로젝트 현재 상태](.docs/PROJECT_STATUS.md) | 실시간 작업 현황 및 To-Do 리스트 |
| 🛠️ [개발자 관리 가이드](.docs/MANAGER_GUIDE.md) | 로컬 실행, 배포, 구성 관리, 콘텐츠 추가 |
| 👤 [사용자 가이드](.docs/USER_GUIDE.md) | 주요 기능 사용법 및 개인화 설정 안내 |

---

## 🚀 주요 기능

| 기능 | 설명 |
|------|------|
| 🔍 **통합 검색** | 네이버, 구글, 유튜브, GitHub 등 다중 검색 엔진 전환 |
| ⭐ **바로가기 그리드** | 자주 방문하는 사이트를 아이콘 그리드로 관리 |
| 🔖 **상단 북마크 바** | 폴더형 드롭다운 북마크 메뉴 |
| 📄 **문서 뷰어** | Markdown 기반 기술 문서 렌더링 |
| 🗂️ **자료실** | 파일/링크를 트리 구조로 탐색 및 다운로드 |
| 🔧 **개발 도구** | JWT 디버거, JSON 포맷터, URL 인코더, 키 생성기 등 내장 |
| 🎮 **게임** | 외부 게임 월드(gameWorld)로 연결 |
| 📰 **실시간 이슈** | Google 뉴스 RSS 기반 실시간 카드 뉴스 |
| 🌙 **다크/라이트 모드** | 시스템 설정 연동 및 수동 전환 |
| ⚙️ **환경설정 GUI** | 북마크·바로가기 편집, 설정 백업/복원 |

---

## ⚡ 빠른 시작

```bash
# Python 3 내장 서버로 로컬 실행
python -m http.server 80

# 또는 Node.js (npx)
npx serve . -l 80
```

> [!IMPORTANT]
> `file://` 프로토콜(더블클릭 실행)은 브라우저 보안 정책으로 인해 일부 기능이 제한됩니다.  
> 반드시 **로컬 HTTP 서버 환경**에서 실행해 주세요.

---

## 🗂️ 프로젝트 구조

```
guma/
├── index.html          # 메인 시작 페이지
├── script.js           # 메인 로직 (검색, 뉴스, 북마크 등)
├── style.css           # 전역 스타일 (라이트/다크 CSS 변수)
├── menu.json           # 사이드바 내비게이션 메뉴 정의
├── favicon.svg         # 프로젝트 아이콘
│
├── shared/             # 공통 모듈 (재사용 컴포넌트)
│   ├── topbar.js       # 상단 북마크/공통 헤더 로직
│   ├── theme-effects.js # 테마 전환 및 시각 효과
│   ├── tree.js         # 트리 구조 렌더링 유틸
│   └── tree.css        # 트리 구조 스타일
│
├── config/             # 환경설정 페이지 및 기본 구성 데이터
│   ├── index.html      # 환경설정 UI
│   ├── config.js       # 환경설정 로직
│   ├── config.css      # 환경설정 스타일
│   ├── bookmarks.json  # 상단 북마크 기본값
│   ├── shortcuts.json  # 바로가기 그리드 기본값
│   └── engines.json    # 검색 엔진 정의
│
├── posts/              # 문서 뷰어 페이지
│   ├── index.html      # 문서 목록 UI
│   ├── index.json      # 문서 목록 정의
│   └── files/          # Markdown 문서 파일
│
├── tools/              # 개발 도구 페이지
│   ├── index.html      # 도구 목록 UI
│   ├── index.json      # 도구 목록 정의
│   ├── tool.css        # 도구 공통 스타일
│   └── files/          # 각 도구 HTML 파일
│
├── resources/          # 자료실 페이지
│   ├── index.html      # 자료실 UI
│   └── index.json      # 자료 목록 정의
│
├── games/              # 게임 페이지 (외부 gameWorld 리다이렉트)
│   └── index.html
│
└── .docs/              # 프로젝트 문서 디렉토리
    ├── PROJECT_STATUS.md
    ├── MANAGER_GUIDE.md
    └── USER_GUIDE.md
```

---

## 🛠️ 기술 스택

- **Core**: Vanilla HTML5 / CSS3 / JavaScript (ES6+) — 프레임워크 없음
- **외부 라이브러리** (CDN, 선택적 의존):
  - [marked.js](https://marked.js.org/) — Markdown 파싱
  - [highlight.js](https://highlightjs.org/) — 코드 구문 강조
  - [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) — Markdown 스타일
  - Google S2 Favicon API — 파비콘 자동 로딩
- **배포**: GitHub Pages (정적 호스팅)

---

## 📄 라이선스

이 프로젝트는 **개인 사용 및 커스터마이징** 목적으로 공개되었습니다.
