# 프로젝트 상태 (PROJECT_STATUS.md)

## 현재 프로젝트 목표 및 진행 단계
- **목표:** 사이드바 메뉴 확장 및 게임 전용 페이지 구축
- **단계:** 작업 완료

## 핵심 로직 및 작업 내용
- `menu.json`: '게임' 메뉴(gamepad 아이콘)를 '자료실'과 '환경설정' 사이에 추가
- `games/index.json`: 게임 리스트를 트리 구조로 관리 (기본: 테트리스 추가)
- `games/index.html`: `tools/index.html` 기반의 게임 전용 UI/UX 구현
- `games/tetris/index.html`: 게임 리스트와 연동하여 Iframe으로 로딩 확인

## 직면한 에러 및 To-Do 리스트
- [x] 사이드바 메뉴 구성 및 경로 연결
- [x] 게임 리스트 관리용 JSON 정의
- [x] 도구 페이지와 동일한 형태의 게임 메인 페이지 생성
- [x] 다크 모드 및 테마 연동 확인
