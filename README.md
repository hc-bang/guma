# GUMA™ — 나만의 브라우저 시작 페이지

> 정적 파일만으로 동작하는 개인 홈페이지 및 새 탭 페이지입니다.  
> 서버 관리 없이 GitHub Pages 등에 바로 배포하여 사용할 수 있는 전문가용 대시보드입니다.

---

## 📘 상세 문서 (Links)

프로젝트에 대한 보다 자세한 정보는 아래 문서들을 참조하십시오.

- **[현재 프로젝트 상태](.docs/PROJECT_STATUS.md)**: 실시간 작업 현황 및 To-Do 리스트
- **[개발자용 관리 가이드](.docs/MANAGER_GUIDE.md)**: 설치, 배포, 구성 관리 및 콘텐츠 추가 방법
- **[일반 사용자 가이드](.docs/USER_GUIDE.md)**: 주요 기능 설명 및 개인화 설정 안내

---

## 🚀 주요 기능

- **통합 검색**: 다중 검색 엔진 전환 및 빠른 검색
- **GUI 환경설정**: 북마크, 바로가기 관리 및 데이터 백업/복원
- **문서 및 자료실**: Markdown 기반 문서 렌더링 및 트리 구조 자료 탐색
- **유틸리티 도구**: JWT 디버거, JSON 포맷터 등 개발 편의 도구 내장
- **심미적 디자인**: 다크 모드 지원 및 반응형 애니메이션 레이아웃

---

## ⚙️ 빠른 시작 (Quick Start)

```bash
# 로컬 테스트 (Python 3)
python -m http.server 80
```

> [!IMPORTANT]
> 로컬 파일 관리(`file://`) 프로토콜에서는 보안 제약으로 인해 일부 기능이 제한됩니다. 반드시 로컬 HTTP 서버 환경에서 실행해 주세요.

---

## 🛠️ 기술 스택

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Docs**: Markdown (Marked.js + Highlight.js)
- **Icons**: CSS Shape & Custom SVGs
- **Deployment**: Any Static Hosting (GitHub Pages Recommended)

---

## 📄 라이선스
이 프로젝트는 개인 사용 및 커스터마이징을 목적으로 공개되었습니다.

---

## 도구 페이지 추가 방법

1. `tools/{도구명}/index.html` 파일을 생성합니다.
   - `<link rel="stylesheet" href="../tool.css" />` 로 공통 스타일 적용
   - 스크립트에 아래 테마 코드 추가:
     ```js
     if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
     window.addEventListener('storage', e => e.key === 'theme' && (document.body.classList.toggle('dark', e.newValue === 'dark')));
     window.addEventListener('message', e => e.data?.type === 'themeChange' && (document.body.classList.toggle('dark', e.data.theme === 'dark')));
     ```
2. `tools/index.json` 의 `files` 배열에 경로를 추가합니다:
   ```json
   { "file": "도구명/index.html", "group": "그룹명" }
   ```

---

## 문서 추가 방법

1. `posts/{카테고리}/파일명.md` 를 생성합니다.
2. `posts/index.json` 의 `files` 배열에 추가합니다:
   ```json
   { "files": ["카테고리/파일명.md"] }
   ```

---

## 자료실 추가 방법

자료실(`resources/`)은 `index.json` 데이터만을 기반으로 목록 트리와 카드 뷰를 렌더링합니다.

1. `resources/index.json` 의 `files` 배열에 파일 정보를 추가합니다:
   ```json
   {
     "group": "카테고리/하위그룹",
     "file": "files/example.zip",  // 또는 "https://외부.다운로드.링크"
     "display": "화면에 표시할 이름",
     "desc": "파일에 대한 간단한 설명"
   }
   ```
2. `file` 값에 `http://`나 `https://` 와 같은 형태의 절대 URL을 입력하면, 사용자가 클릭 시 GitHub Releases 등 **외부 호스팅 링크로 직접 파일 다운로드**를 수행하게 됩니다.

---

## 커스터마이징

### 색상 테마

`style.css` 최상단의 `:root` / `body.dark` CSS 변수를 수정합니다.

```css
:root {
  --accent:     #1a73e8;   /* 강조색 */
  --bg:         #ffffff;   /* 배경 */
  --panel:      #ffffff;   /* 카드/패널 배경 */
}
```

### 검색 엔진 추가

`script.js` → `engines` 객체에 항목 추가 후,  
`index.html` → `#engineMenu` 에 버튼을 추가합니다.

---

## 실시간 이슈 (뉴스)

메인 화면 하단에 Google 뉴스 RSS 기반의 실시간 이슈 카드를 표시합니다.

- **데이터 소스**: Google 뉴스 RSS (`news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko`)
- **파싱 방법**: `rss2json.com` API → 실패 시 `allorigins.win` 프록시로 XML 직접 파싱
- **캐싱**: `localStorage`에 30분 단위로 캐싱하여 불필요한 외부 API 호출 방지
  - 30분 이내 재방문 시 캐시에서 즉시 렌더링 (API 호출 없음)
  - 30분 초과 시 새 데이터를 fetch하여 캐시 갱신

---

## localStorage 키 목록

| 키 | 설명 |
|----|------|
| `theme` | `"dark"` 또는 `"light"` |
| `engine` | 마지막으로 선택한 검색 엔진 ID |
| `bookmarks` | 바로가기 그리드 데이터 (JSON 배열) |
| `topBookmarks` | 상단 북마크 데이터 (환경설정에서 적용 시) |
| `newsCache` | 뉴스 기사 캐시 (`{ timestamp, articles }` JSON) — 30분 유효 |
| `faviconCache::{origin}` | 파비콘 URL 캐시 |

---

## 기술 스택

- **Vanilla HTML / CSS / JavaScript** — 프레임워크 없음
- **외부 의존성** (CDN, 선택적):
  - [marked.js](https://marked.js.org/) — Markdown 파싱
  - [highlight.js](https://highlightjs.org/) — 코드 하이라이팅
  - [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) — Markdown 스타일
  - Google S2 Favicon API — 파비콘 로딩
