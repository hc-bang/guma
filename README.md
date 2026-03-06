# GUMA™ — 나만의 브라우저 시작 페이지

> 정적 파일만으로 동작하는 개인 홈페이지 / 새 탭 페이지입니다.  
> 서버, 빌드 도구, 백엔드 없이 GitHub Pages 등에 바로 배포할 수 있습니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **검색** | 네이버 / 다음 / 구글 / 빙 / 유튜브 / GitHub / 위키백과 — 드롭다운으로 엔진 전환 |
| **상단 북마크 바** | `bookmarks.json` 또는 환경설정에서 관리. 링크 · 폴더(드롭다운) · 중첩 폴더 지원 |
| **바로가기 그리드** | 메인 화면 아이콘 그리드. 우클릭으로 삭제, ＋ 버튼으로 추가 (최대 15개) |
| **다크 / 라이트 모드** | 시스템 설정 자동 감지 + 수동 전환, `localStorage` 저장 |
| **슬라이드 메뉴** | `menu.json`으로 네비게이션 항목 관리. 모든 서브 페이지에 동일 메뉴 표시 |
| **환경설정** | 상단 북마크 · 바로가기 GUI/JSON 편집, 내보내기 · 불러오기 |
| **문서 뷰어** | Markdown 파일 트리 탐색 + 렌더링 (marked.js + highlight.js) |
| **도구 모음** | Key Generator · URL Encoder · JSON Formatter · JSON↔Base64 · JWT Debugger |

---

## 파일 구조

```
/
├── index.html          # 메인 홈 (검색 + 바로가기)
├── style.css           # 홈 공통 스타일 (CSS 변수 기반)
├── script.js           # 홈 동작 스크립트
├── favicon.svg         # 파비콘
├── bookmarks.json      # 상단 북마크 기본값 (편집 가능)
├── menu.json           # 슬라이드 메뉴 네비게이션 항목
│
├── shared/
│   └── topbar.js       # 공통 슬라이드 메뉴 / 테마 토글 모듈
│
├── config/
│   ├── index.html      # 환경설정 페이지
│   ├── config.css      # 서브 페이지 공통 스타일
│   └── config.js       # 환경설정 스크립트
│
├── posts/
│   ├── index.html      # 문서 목록 + 뷰어
│   ├── index.json      # 문서 파일 목록 인덱스
│   ├── viewer.html     # 단독 Markdown 뷰어
│   └── {카테고리}/     # Markdown 파일 폴더
│
└── tools/
    ├── index.html      # 도구 목록 + iframe 뷰어
    ├── index.json      # 도구 파일 목록 인덱스
    ├── tool.css        # 도구 페이지 공통 CSS 변수
    ├── key-generator/
    ├── url-encoder/
    ├── json-formatter/
    ├── json-base64-converter/
    └── jwt-debugger/
```

---

## 빠른 시작

### GitHub Pages 배포

1. 저장소를 Fork 하거나 이 파일들을 새 저장소에 업로드합니다.
2. 저장소 → **Settings → Pages → Source: `main` 브랜치 루트** 선택.
3. `https://{username}.github.io/{repo}/` 에서 확인합니다.

### 로컬 실행

```bash
# Python 3
python -m http.server 8080
# 또는
npx serve .
```

> `file://` 프로토콜은 fetch() 제한으로 일부 기능이 동작하지 않습니다.  
> 반드시 로컬 HTTP 서버를 통해 확인하세요.

### 브라우저 새 탭 페이지로 설정

| 브라우저 | 방법 |
|----------|------|
| Chrome | [New Tab Redirect](https://chrome.google.com/webstore/detail/new-tab-redirect/icpgjfneehieebagbmdbhnlpiopdcmna) 확장 설치 후 URL 입력 |
| Firefox | `about:preferences` → 홈 → 사용자 지정 URL 입력 |
| Edge | 설정 → 새 탭 → 사용자 지정 URL |

---

## 데이터 관리

### 상단 북마크 (`bookmarks.json`)

`bookmarks.json`을 직접 편집하거나 **환경설정 → 북마크** 에서 GUI로 관리합니다.

```json
{
  "top": [
    { "name": "네이버", "url": "https://naver.com" },
    {
      "name": "지도",
      "items": [
        { "name": "네이버지도", "url": "https://map.naver.com" },
        { "name": "카카오맵",   "url": "https://map.kakao.com" }
      ]
    }
  ]
}
```

- **링크**: `{ "name": "이름", "url": "https://..." }`
- **폴더**: `{ "name": "폴더명", "items": [...] }` — 중첩 폴더 지원

환경설정에서 적용하면 `localStorage`에 저장되어 `bookmarks.json`보다 우선합니다.  
"초기화" 버튼을 누르면 `localStorage`를 삭제하고 `bookmarks.json`으로 돌아갑니다.

### 슬라이드 메뉴 (`menu.json`)

모든 서브 페이지(환경설정 · 문서 · 도구)의 슬라이드 메뉴는 `menu.json`에서 관리합니다.

```json
{
  "nav": [
    { "label": "환경설정", "href": "config/", "icon": "settings"  },
    { "label": "문서",     "href": "posts/",  "icon": "document"  },
    { "label": "도구",     "href": "tools/",  "icon": "tool"      }
  ]
}
```

`icon` 키: `settings` · `document` · `tool` · `home` (추가 아이콘은 `shared/topbar.js` → `ICONS` 맵 확인)

### 바로가기 그리드

메인 화면에서 직접 추가(＋)·삭제(우클릭)하거나 **환경설정 → 바로가기** 에서 관리합니다.

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

## localStorage 키 목록

| 키 | 설명 |
|----|------|
| `theme` | `"dark"` 또는 `"light"` |
| `engine` | 마지막으로 선택한 검색 엔진 ID |
| `bookmarks` | 바로가기 그리드 데이터 (JSON 배열) |
| `topBookmarks` | 상단 북마크 데이터 (환경설정에서 적용 시) |
| `faviconCache::{origin}` | 파비콘 URL 캐시 |

---

## 기술 스택

- **Vanilla HTML / CSS / JavaScript** — 프레임워크 없음
- **외부 의존성** (CDN, 선택적):
  - [marked.js](https://marked.js.org/) — Markdown 파싱
  - [highlight.js](https://highlightjs.org/) — 코드 하이라이팅
  - [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) — Markdown 스타일
  - Google S2 Favicon API — 파비콘 로딩

---

## 라이선스

MIT License — 자유롭게 수정·배포하세요.
