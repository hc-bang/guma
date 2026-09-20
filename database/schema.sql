-- GUMA™ Neon PostgreSQL Database Schema
-- Version: 2.0.0 (Cloud Single Source of Truth Architecture)

-- 1. system_config 테이블 (Cloudflare 터널 주소, 시스템 전역 설정)
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. profiles 테이블 (기기별/환경별 프로필: 기본(PC), 모바일 등)
CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. profile_configs 테이블 (프로필별 설정 데이터: 북마크, 바로가기, 채널, 검색엔진)
CREATE TABLE IF NOT EXISTS profile_configs (
    profile_id VARCHAR(50) REFERENCES profiles(id) ON DELETE CASCADE,
    config_type VARCHAR(50) NOT NULL,
    config_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(profile_id, config_type)
);

-- 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_profile_configs_type ON profile_configs(config_type);
