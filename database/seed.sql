-- GUMA™ Neon PostgreSQL Seed Data
-- Initial data insertion for notes, bookmarks, and shortcuts

-- 1. Initial Notes
INSERT INTO notes (title, content, tags) VALUES
('GUMA™ 3-Tier 안내', '프론트엔드(GitHub Pages), 백엔드(FastAPI), 데이터베이스(Neon Postgres) 구조로 전환되었습니다.', ARRAY['공지', '시스템']),
('개발 메모', 'Neon PostgreSQL 데이터베이스 연동 테스트용 데이터입니다.', ARRAY['개발', '테스트']);

-- 2. Initial Bookmarks
INSERT INTO bookmarks (title, url, category, icon_url) VALUES
('Fast.com 인터넷 속도측정', 'https://fast.com', '유틸리티', 'https://www.google.com/s2/favicons?domain=fast.com&sz=64'),
('GitHub Workspace', 'https://github.com', '개발', 'https://www.google.com/s2/favicons?domain=github.com&sz=64');

-- 3. Initial Shortcuts
INSERT INTO shortcuts (name, key_combination, description, category) VALUES
('퀵 서치', 'Ctrl + K', '통합 메뉴 및 즐겨찾기 빠르게 검색', '네비게이션'),
('다크 모드 토글', 'Alt + T', '테마 색상 모드 전환', 'UI 설정');
