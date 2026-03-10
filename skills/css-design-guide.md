# Guma Design & CSS Guide

## 1. CSS Variables (테마 및 색상)
Guma 프로젝트는 `style.css`의 `:root`와 `body.dark`를 통해 라이트/다크모드를 지원합니다. 색상값을 직접 하드코딩하지 않고, 반드시 아래의 CSS 변수를 사용해야 합니다.

- **배경색**: `var(--bg)` (기본 배경), `var(--bg-glass)` (반투명 배경)
- **텍스트**: `var(--text)` (기본 텍스트), `var(--text-muted)` (보조 텍스트)
- **요소 배경**: `var(--card)`, `var(--panel)`
- **테두리**: `var(--border)`, `var(--border-s)` (연한 테두리)
- **버튼**: `var(--btn)`, `var(--btn-hover)` (호버 상태)
- **포인트 색상**: `var(--accent)`, `var(--accent-rgb)`
- **입력폼 배경**: `var(--input-bg)`

## 2. 디자인 토큰 (Design Tokens)
간격이나 그림자, 애니메이션 모션 등도 변수로 관리됩니다. 일관된 UI를 위해 아래 토큰을 준수하세요.

- **그림자 (Shadow)**: `var(--shadow-sm)`, `var(--shadow-md)`, `var(--shadow-lg)`
- **둥근 모서리 (Border Radius)**: `var(--radius)` (12px), `var(--radius-s)` (8px)
- **트랜지션 (Transition)**: `var(--trans)` (0.18s ease) - 요소의 호버 액션이나 색상 변경 애니메이션에 사용합니다.

## 3. 타이포그래피 (Typography)
- Guma의 기본 폰트 스택은 `"Noto Sans KR", ui-sans-serif, system-ui, -apple-system, sans-serif` 를 따릅니다.

## 4. UI 컴포넌트 클래스 명세
자주 사용되는 UI 컴포넌트들은 다음과 같은 클래스 구조를 재사용해야 합니다.

### 버튼 (`.btn`)
- 모든 버튼 요소는 기본적으로 `.btn` 클래스를 가집니다.
- 아이콘만 들어가는 정사각형 버튼의 경우 `.btn.icon-btn` 클래스를 함께 사용합니다.

### 아이콘 (`.icon-svg`)
- 인라인 SVG 아이콘을 사용할 때는 `.icon-svg` 래퍼 내부에 배치합니다.
- `<svg>` 태그에는 별도의 스타일 대신 `stroke: currentColor`, `fill: none` 속성이 CSS 레벨에서 기본 적용됩니다.

### 모달 (`.modal-overlay`, `.modal`)
- 모달 창은 배경 오버레이 `.modal-overlay` 안에 `.modal` 컨테이너 구조로 렌더링됩니다.
- 입력창은 `.modal-input`, 액션 버튼은 `.modal-btn` (`.cancel`, `.confirm` 서브클래스)을 사용합니다.
