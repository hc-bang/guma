# MANAGER_GUIDE (개발자 관리 가이드)

GUMA™ 프로젝트의 로컬 실행, 배포, 구성 관리 및 콘텐츠 확장을 위한 기술 가이드입니다.

---

## 🛠️ 기술 스택 및 환경

- **Core:** Vanilla HTML5, CSS3, JavaScript (ES6+) — 프레임워크 없음
- **외부 의존성 (CDN):**
  - [marked.js](https://marked.js.org/): Markdown 파싱
  - [highlight.js](https://highlightjs.org/): 코드 구문 강조
  - [github-markdown-css](https://github.com/sindresorhus/github-markdown-css): Markdown 스타일
  - Google S2 Favicon API: 파비콘 자동 로딩
- **Server:** 정적 파일 호스팅 (GitHub Pages, Vercel, Netlify 등)

---

## 🚀 로컬 실행

브라우저의 `fetch()` 보안 정책으로 인해 반드시 로컬 HTTP 서버 환경이 필요합니다.

```powershell
# Python 3 이용 (프로젝트 루트에서 실행)
python -m http.server 80

# Node.js (npx) 이용
npx serve . -l 80
```

> [!NOTE]
> `file://` 프로토콜(파일 직접 실행)에서는 JSON 파일 로드, 뉴스 파싱 등 대부분의 기능이 제한됩니다.

---

## 🌐 GitHub Pages 배포

1. 저장소를 GitHub에 푸시합니다.
2. `Settings` > `Pages` > `Build and deployment` > `Source`를 `Deploy from a branch`로 설정합니다.
3. `main` 브랜치의 `/ (root)` 폴더를 선택하고 저장합니다.
4. 잠시 후 `https://{사용자명}.github.io/{저장소명}/` 형태의 URL로 접속 가능합니다.

> [!TIP]
> 루트에 `.nojekyll` 파일이 있어야 `_` 로 시작하는 폴더가 정상적으로 서빙됩니다. (이미 포함되어 있음)

---

## ⚙️ 구성(Configuration) 파일 관리

모든 기본 구성 데이터는 `config/` 디렉토리의 JSON 파일에 정의됩니다.  
사용자가 환경설정 페이지에서 변경한 값은 `localStorage`에 저장되어 JSON 파일을 덮어씁니다.

| 파일 | 역할 |
|------|------|
| `config/bookmarks.json` | 상단 북마크 바의 기본 링크 및 폴더 구조 |
| `config/shortcuts.json` | 메인 화면 바로가기 그리드 기본 데이터 (최대 15개 권장) |
| `config/engines.json` | 검색창에서 선택 가능한 검색 엔진 목록 |

### 북마크 JSON 형식 (`config/bookmarks.json`)

```json
[
  { "name": "이름", "url": "https://..." },
  { "name": "폴더명", "items": [
      { "name": "하위 링크", "url": "https://..." }
  ]}
]
```

### 검색 엔진 JSON 형식 (`config/engines.json`)

```json
{
  "engines": [
    {
      "id": "google",
      "label": "Google",
      "url": "https://www.google.com/search?q=",
      "favicon": "https://www.google.com/favicon.ico"
    }
  ]
}
```

---

## 📝 콘텐츠 추가 방법

### 문서(Post) 추가

1. `posts/files/{카테고리}/{파일명}.md` 파일을 생성합니다.
2. `posts/index.json`의 `files` 배열에 항목을 추가합니다:
   ```json
   { "group": "카테고리", "file": "파일명.md", "display": "화면에 표시할 제목" }
   ```

### 도구(Tool) 추가

1. `tools/files/{도구명}.html` 파일을 생성합니다.
   - `<link rel="stylesheet" href="../tool.css" />` 로 공통 스타일 적용
   - 스크립트에 아래 테마 연동 코드 삽입:
     ```js
     // 테마 초기값 적용 (로드 시)
     if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
     // 다른 탭에서 테마 변경 시 연동
     window.addEventListener('storage', e => e.key === 'theme' && document.body.classList.toggle('dark', e.newValue === 'dark'));
     // 부모 프레임에서 postMessage로 테마 변경 신호를 받을 경우 연동
     window.addEventListener('message', e => e.data?.type === 'themeChange' && document.body.classList.toggle('dark', e.data.theme === 'dark'));
     ```
2. `tools/index.json`의 `files` 배열에 정보를 등록합니다:
   ```json
   { "group": "그룹명", "file": "files/도구명.html", "display": "화면에 표시할 이름" }
   ```

### 자료실(Resource) 추가

`resources/index.json`의 `files` 배열에 항목을 추가합니다:

```json
{
  "group": "카테고리/하위그룹",
  "file": "files/example.zip",
  "display": "화면에 표시할 이름",
  "desc": "파일에 대한 간단한 설명"
}
```

> [!TIP]
> `file` 값에 `https://` 형태의 절대 URL을 사용하면, 외부 호스팅(GitHub Releases 등)에서 직접 파일을 다운로드하도록 연결할 수 있습니다.

---

## 🧩 공통 모듈 (`shared/`)

새로운 기능 추가 시 `shared/` 하위의 공통 모듈을 최대한 활용하세요.

| 파일 | 역할 |
|------|------|
| `shared/topbar.js` | 상단 북마크 바 렌더링 및 사이드바 메뉴 로딩 (`menu.json` 의존) |
| `shared/theme-effects.js` | 다크/라이트 테마 전환 및 Embers 파티클 시각 효과 |
| `shared/tree.js` | 트리 구조 데이터를 재귀적으로 렌더링하는 유틸 |
| `shared/tree.css` | 트리 구조 스타일 |

각 페이지에서 `shared/topbar.js`를 사용하려면 페이지 로딩 전 `window.GUMA` 객체를 설정해야 합니다:

```html
<!-- 루트에서 실행 시 -->
<script>window.GUMA = { root: './', page: '' };</script>
<script src="./shared/topbar.js"></script>

<!-- 하위 디렉토리에서 실행 시 (예: tools/) -->
<script>window.GUMA = { root: '../', page: 'tools' };</script>
<script src="../shared/topbar.js"></script>
```

---

## 🔑 localStorage 키 목록

| 키 | 설명 |
|----|------|
| `theme` | `"dark"` 또는 `"light"` |
| `engine` | 마지막으로 선택한 검색 엔진 ID |
| `bookmarks` | 바로가기 그리드 데이터 (JSON 배열) |
| `topBookmarks` | 상단 북마크 데이터 (환경설정에서 적용 시) |
| `newsCache` | 뉴스 기사 캐시 (`{ timestamp, articles }` JSON, 30분 유효) |
| `faviconCache::{origin}` | 파비콘 URL 캐시 |

---

## 🎨 UI 커스터마이징

### 색상 테마 변경

`style.css` 최상단의 CSS 변수를 수정합니다:

```css
:root {
  --accent:  #1a73e8;  /* 강조 색상 */
  --bg:      #ffffff;  /* 배경 색상 */
  --panel:   #ffffff;  /* 카드/패널 배경 */
}

body.dark {
  --accent:  #60a5fa;
  --bg:      #0f172a;
  --panel:   #1e293b;
}
```

### 검색 엔진 추가

`config/engines.json`에 엔진 정보를 추가하면 환경설정 없이도 검색창에서 선택할 수 있습니다.

---

## 🧪 권장 유지보수 절차

- 새로운 기능 추가 시 `shared/` 하위 공통 모듈을 우선 활용하여 중복 코드를 방지하세요.
- UI 수정 시 `style.css`의 CSS 변수(`:root`, `body.dark`)를 사용하여 다크/라이트 모드 대응을 동시에 유지하세요.
- `menu.json`을 수정하면 모든 페이지의 사이드바 메뉴가 자동 반영됩니다.
