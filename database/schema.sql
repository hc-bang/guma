-- GUMA™ Neon PostgreSQL Database Schema
-- Version: 1.0.0

-- 1. Notes Table (메모/노트)
CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bookmarks Table (즐겨찾기/북마크)
CREATE TABLE IF NOT EXISTS bookmarks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    category VARCHAR(100) DEFAULT '일반',
    icon_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Shortcuts Table (단축키/바로가기)
CREATE TABLE IF NOT EXISTS shortcuts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    key_combination VARCHAR(50) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT '시스템'
);
