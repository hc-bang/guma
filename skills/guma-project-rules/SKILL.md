---
name: Guma Project Rules
description: GUMA™ 프로젝트 작업 시 적용되는 언어, 디자인, CSS, 테스트 규칙 모음. UI/스타일 수정이나 신규 코드 작성 시 이 스킬을 자동으로 참조합니다.
---

# Guma Project Rules

GUMA™는 서버/빌드 도구 없이 Vanilla HTML/CSS/JS만으로 구성된 개인 브라우저 시작 페이지 프로젝트입니다.
이 스킬은 프로젝트의 일관성을 유지하기 위한 규칙을 정의합니다.

---

## 1. 언어 규칙

- **응답 및 설명**: 모든 AI 응답과 설명은 **한국어**로 작성합니다.
- **코드 주석**: 새로 작성하거나 수정하는 코드의 주석은 **한국어**로 작성합니다.
- **변수/함수/클래스 명명**: 코드 식별자(변수, 함수, 클래스 등)는 **영어**로 의미 있게 작성합니다.
- **수정 이유 설명**: 코드 수정 시 왜 그렇게 수정했는지 이유를 간략히 한국어로 설명합니다.
- **에러 해결**: 원인을 먼저 한국어로 분석한 뒤 해결책을 제시합니다.

---

## 2. 디자인 및 CSS 규칙

UI, 컴포넌트, 스타일을 수정하거나 새로운 마크업을 추가할 때는 아래 규칙을 반드시 따릅니다.

### CSS 변수 사용 (하드코딩 금지)

`style.css`의 `:root` / `body.dark` 변수를 항상 사용합니다:

| 용도 | 변수 |
|------|------|
| 기본 배경 | `var(--bg)` |
| 반투명 배경 | `var(--bg-glass)` |
| 기본 텍스트 | `var(--text)` |
| 보조 텍스트 | `var(--text-muted)` |
| 카드/패널 배경 | `var(--card)`, `var(--panel)` |
| 테두리 | `var(--border)`, `var(--border-s)` |
| 버튼 | `var(--btn)`, `var(--btn-hover)` |
| 포인트 색상 | `var(--accent)`, `var(--accent-rgb)` |
| 입력폼 배경 | `var(--input-bg)` |

### 디자인 토큰

| 용도 | 변수 |
|------|------|
| 그림자 | `var(--shadow-sm)`, `var(--shadow-md)`, `var(--shadow-lg)` |
| 둥근 모서리 | `var(--radius)` (12px), `var(--radius-s)` (8px) |
| 트랜지션 | `var(--trans)` (0.18s ease) |

### 타이포그래피

기본 폰트 스택: `"Noto Sans KR", ui-sans-serif, system-ui, -apple-system, sans-serif`

### UI 컴포넌트 클래스 재사용

새로운 CSS 클래스를 무분별하게 추가하지 않고, 기존 클래스를 재사용합니다:

- **버튼**: `.btn` (기본), `.btn.icon-btn` (아이콘 전용 정사각형 버튼)
- **아이콘**: `.icon-svg` 래퍼 안에 인라인 SVG 배치
- **모달**: `.modal-overlay > .modal` 구조, `.modal-input`, `.modal-btn` (`.cancel`, `.confirm`)

---

## 3. 테스트 규칙

- 코드 수정 후 테스트(로컬 서버 구동 등)는 **사용자가 직접** 진행합니다.
- AI는 변경사항 요약과 확인 방법 안내만 제공하고, 임의로 테스트를 실행하지 않습니다.

---

## 참고 파일

- 디자인 가이드 상세: [`css-design-guide.md`](../css-design-guide.md)
- 프로젝트 구조 및 데이터 관리: [`README.md`](../../README.md)
