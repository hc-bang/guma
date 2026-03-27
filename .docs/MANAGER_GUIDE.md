# MANAGER_GUIDE (관리자 가이드)

GUMA™ 프로젝트의 유지보수 및 확장을 위한 관리자 기술 가이드입니다.

---

## 🛠️ 기술 스택 및 환경
- **Core:** Vanilla HTML, CSS, JavaScript (Frameworkless)
- **Dependencies (CDN):**
    - [marked.js](https://marked.js.org/): Markdown 파싱
    - [highlight.js](https://highlightjs.org/): 코드 구문 강조
    - [github-markdown-css](https://github.com/sindresorhus/github-markdown-css): Markdown 스타일
- **Server:** 정적 파일 호스팅 (GitHub Pages, Vercel, Netlify 등)

---

## 🚀 배포 및 로컬 실행

### 로컬 실행
브라우저의 `fetch()` 보안 정책으로 인해 로컬 서버 환경이 필요합니다.
```powershell
# Python 3 이용
python -m http.server 80

# Node.js (npx) 이용
npx serve . -l 80
```

### GitHub Pages 배포
1. 저장소를 GitHub에 푸시합니다.
2. `Settings` > `Pages` > `Build and deployment` > `Source`를 `Deploy from a branch`로 설정합니다.
3. `main` 브랜치의 `/ (root)` 폴더를 선택하고 저장합니다.

---

## ⚙️ 구성 (Configuration) 관리

모든 구성은 `config/` 디렉토리의 JSON 파일을 통해 관리됩니다.

### 1. 북마크 (`config/bookmarks.json`)
상단 메뉴바의 링크와 폴더를 정의합니다.
- **링크:** `{ "name": "이름", "url": "https://..." }`
- **폴더:** `{ "name": "폴더명", "items": [...] }`

### 2. 바로가기 그리드 (`config/shortcuts.json`)
메인 화면의 아이콘 그리드 기본값을 정의합니다. 최대 15개까지 권장됩니다.

### 3. 슬라이드 메뉴 (`menu.json`)
전체 페이지 공통 네비게이션 메뉴를 정의합니다. 아이콘은 `settings`, `document`, `tool`, `home` 등을 지원합니다.

---

## 📝 콘텐츠 추가 방법

### 문서(Post) 추가
1. `posts/{카테고리}/{파일명}.md` 파일을 생성합니다.
2. `posts/index.json`의 `files` 배열에 경로와 표시 이름을 추가합니다.
   ```json
   { "group": "카테고리", "file": "카테고리/파일.md", "display": "제목" }
   ```

### 도구(Tool) 추가
1. `tools/{도구명}/index.html`을 생성합니다.
2. `tools/index.json`에 정보를 등록합니다.

### 자료실(Resource) 추가
1. `resources/index.json`에 파일 정보(그룹, 경로/URL, 이름, 설명)를 추가합니다.

---

## 🧪 권장 유지보수 절차
- 새로운 기능을 추가할 때는 `shared/` 하위의 공통 모듈을 최대한 활용하십시오.
- UI 수정 시 `style.css`의 CSS 변수(`:root`)를 사용하여 다크/라이트 모드 대응을 유지하십시오.
