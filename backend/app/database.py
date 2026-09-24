"""
GUMA™ Neon PostgreSQL Database Module
- Serverless Postgres 연동 및 연결 풀링
- profiles, profile_configs 테이블 자동 초기화 및 헬퍼 함수 제공
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from dotenv import load_dotenv
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

# .env 로드 (프로젝트 루트 및 backend 디렉터리 모두 지원)
load_dotenv()
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_root_dir = os.path.dirname(_backend_dir)
for _p in [os.path.join(_root_dir, ".env"), os.path.join(_backend_dir, ".env")]:
    if os.path.isfile(_p):
        load_dotenv(_p, override=False)

logger = logging.getLogger("guma.database")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

_connection_pool: Optional[pool.SimpleConnectionPool] = None

def get_connection_pool() -> Optional[pool.SimpleConnectionPool]:
    global _connection_pool
    if not DATABASE_URL:
        return None
    if _connection_pool is None or _connection_pool.closed:
        try:
            # Neon DB는 SSL 연결 필수 (sslmode=require)
            _connection_pool = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=DATABASE_URL
            )
            logger.info("[DB] Neon PostgreSQL 커넥션 풀 초기화 완료")
        except Exception as e:
            logger.warning(f"[DB] Neon PostgreSQL 연결 실패: {e}")
            _connection_pool = None
    return _connection_pool

def is_db_available() -> bool:
    """Neon DB 연결이 가능한지 여부를 반환합니다."""
    if not DATABASE_URL:
        return False
    pool_obj = get_connection_pool()
    return pool_obj is not None

def init_db():
    """데이터베이스 테이블 자동 생성 및 기본 프로필 시드 데이터를 구성합니다."""
    pool_obj = get_connection_pool()
    if not pool_obj:
        logger.info("[DB] DATABASE_URL이 설정되지 않아 데이터베이스 초기화를 건너뜁니다.")
        return

    conn = None
    try:
        conn = pool_obj.getconn()
        with conn.cursor() as cur:
            # 1. profiles 테이블 (기기별/개인별 프로필)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS profiles (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    is_default BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # 2. profile_configs 테이블 (프로필별 북마크/채널 JSON 데이터)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS profile_configs (
                    profile_id VARCHAR(50) REFERENCES profiles(id) ON DELETE CASCADE,
                    config_type VARCHAR(50) NOT NULL,
                    config_data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(profile_id, config_type)
                );
            """)

            # 3. torrent_trackers 테이블 (오직 100% 정상 작동하는 활성 트래커만 영구 관리)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS torrent_trackers (
                    url VARCHAR(500) PRIMARY KEY,
                    source VARCHAR(50) DEFAULT 'seed',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE torrent_trackers DROP COLUMN IF EXISTS is_active;
            """)

            # 불필요한 work(업무용) 프로필 삭제
            cur.execute("DELETE FROM profiles WHERE id = 'work';")

            # 기본 프로필 (default, mobile) 등록 및 갱신
            cur.execute("""
                INSERT INTO profiles (id, name, is_default) VALUES
                ('default', '기본 (PC)', TRUE),
                ('mobile', '모바일', FALSE)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_default = EXCLUDED.is_default;
            """)

            # 신규 설치 시(설정 데이터가 없을 때) database/seed.sql을 실행하여 초기 시드 주입
            cur.execute("SELECT COUNT(*) FROM profile_configs;")
            cfg_count = cur.fetchone()[0]
            if cfg_count == 0:
                seed_path = os.path.join(_root_dir, "database", "seed.sql")
                if os.path.isfile(seed_path):
                    try:
                        with open(seed_path, "r", encoding="utf-8") as sf:
                            cur.execute(sf.read())
                        logger.info("[DB] database/seed.sql 초기 시드 데이터 주입 완료")
                    except Exception as se:
                        logger.warning(f"[DB] seed.sql 실행 실패: {se}")

            conn.commit()
            logger.info("[DB] Neon PostgreSQL 테이블 점검, default 및 mobile 프로필 데이터 동기화 완료")
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"[DB] 데이터베이스 초기화 중 오류: {e}")
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)

# ==========================================
# 헬퍼 함수: profiles & profile_configs
# ==========================================

def list_profiles() -> List[Dict[str, Any]]:
    pool_obj = get_connection_pool()
    if not pool_obj:
        return [
            {"id": "default", "name": "기본 (로컬)", "is_default": True}
        ]
    conn = None
    try:
        conn = pool_obj.getconn()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, name, is_default, updated_at FROM profiles ORDER BY is_default DESC, created_at ASC;")
            return cur.fetchall()
    except Exception as e:
        logger.error(f"[DB] list_profiles 실패: {e}")
        return []
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)

def get_profile_config(profile_id: str, config_type: str) -> Optional[Any]:
    pool_obj = get_connection_pool()
    if not pool_obj:
        return None
    conn = None
    try:
        conn = pool_obj.getconn()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT config_data FROM profile_configs 
                WHERE profile_id = %s AND config_type = %s;
            """, (profile_id, config_type))
            row = cur.fetchone()
            return row[0] if row else None
    except Exception as e:
        logger.error(f"[DB] get_profile_config 실패 ({profile_id}, {config_type}): {e}")
        return None
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)

def set_profile_config(profile_id: str, config_type: str, data: Any) -> bool:
    pool_obj = get_connection_pool()
    if not pool_obj:
        return False
    conn = None
    try:
        conn = pool_obj.getconn()
        with conn.cursor() as cur:
            # 프로필 존재 여부 보장
            cur.execute("SELECT 1 FROM profiles WHERE id = %s;", (profile_id,))
            if not cur.fetchone():
                cur.execute("INSERT INTO profiles (id, name) VALUES (%s, %s);", (profile_id, profile_id.capitalize()))

            cur.execute("""
                INSERT INTO profile_configs (profile_id, config_type, config_data, updated_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (profile_id, config_type) DO UPDATE
                SET config_data = EXCLUDED.config_data, updated_at = CURRENT_TIMESTAMP;
            """, (profile_id, config_type, json.dumps(data)))
            conn.commit()
            return True
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"[DB] set_profile_config 실패 ({profile_id}, {config_type}): {e}")
        return False
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)


# ==============================================================================
# 토렌트 트래커 (torrent_trackers) 관리 함수
# ==============================================================================

def get_db_trackers() -> List[str]:
    """Neon DB에서 정상 활성 토렌트 트래커 URL 목록을 조회합니다."""
    pool_obj = get_connection_pool()
    if not pool_obj:
        return []
    conn = None
    try:
        conn = pool_obj.getconn()
        with conn.cursor() as cur:
            cur.execute("SELECT url FROM torrent_trackers ORDER BY created_at DESC;")
            rows = cur.fetchall()
            return [r[0] for r in rows if r and r[0]]
    except Exception as e:
        logger.error(f"[DB] get_db_trackers 실패: {e}")
        return []
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)


def save_db_trackers(urls: List[str], source: str = "harvest") -> int:
    """살아있는 정상 트래커 목록을 DB에 일괄 저장(중복 자동 무시)하고 추가된 개수를 반환합니다."""
    if not urls:
        return 0
    pool_obj = get_connection_pool()
    if not pool_obj:
        return 0
    conn = None
    added_count = 0
    try:
        conn = pool_obj.getconn()
        with conn.cursor() as cur:
            clean_urls = []
            for u in urls:
                c = u.strip()
                if c and (c.startswith("udp://") or c.startswith("http://") or c.startswith("https://") or c.startswith("wss://")):
                    clean_urls.append(c)

            if clean_urls:
                from psycopg2.extras import execute_values
                query = """
                    INSERT INTO torrent_trackers (url, source)
                    VALUES %s
                    ON CONFLICT (url) DO NOTHING;
                """
                tuples = [(u, source) for u in clean_urls]
                execute_values(cur, query, tuples)
                added_count = cur.rowcount
                conn.commit()
        return added_count
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"[DB] save_db_trackers 실패: {e}")
        return 0
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)


def delete_db_trackers(urls: List[str]) -> int:
    """응답이 없거나 죽어 있는 트래커 목록을 DB에서 영구 완전 삭제합니다."""
    if not urls:
        return 0
    pool_obj = get_connection_pool()
    if not pool_obj:
        return 0
    conn = None
    deleted_count = 0
    try:
        conn = pool_obj.getconn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM torrent_trackers WHERE url = ANY(%s);", (urls,))
            deleted_count = cur.rowcount
            conn.commit()
        return deleted_count
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"[DB] delete_db_trackers 실패: {e}")
        return 0
    finally:
        if conn and pool_obj:
            pool_obj.putconn(conn)

