"""
GUMA™ Config Hub Router
- 기기별/개인별 프로필 및 북마크/채널/엔진 클라우드 동기화 API
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

try:
    from app.database import (
        list_profiles, get_profile_config, set_profile_config,
        is_db_available
    )
except ImportError:
    from backend.app.database import (
        list_profiles, get_profile_config, set_profile_config,
        is_db_available
    )

router = APIRouter(prefix="/api", tags=["ConfigHub"])

# ==========================================
# 기기별/개인별 프로필 (설정 그룹)
# ==========================================

class CreateProfileRequest(BaseModel):
    id: str = Field(..., description="영문/숫자 식별자 (예: mobile, work, pc)")
    name: str = Field(..., description="프로필 화면 표시 명칭 (예: 모바일, 업무용)")

class SaveConfigRequest(BaseModel):
    data: Any

@router.get("/profiles")
def get_profiles():
    """등록된 프로필 목록을 반환합니다."""
    profiles = list_profiles()
    return {
        "success": True,
        "db_available": is_db_available(),
        "profiles": profiles
    }

@router.get("/profiles/{profile_id}/config/{config_type}")
def load_profile_config(profile_id: str, config_type: str):
    """특정 프로필의 북마크(bookmarks) 또는 유튜브 채널(youtube_channels) 설정을 조회합니다."""
    data = get_profile_config(profile_id, config_type)
    if data is None:
        return {"success": False, "data": None, "message": "해당 프로필에 저장된 설정이 없습니다."}
    return {"success": True, "data": data}

@router.post("/profiles/{profile_id}/config/{config_type}")
def save_profile_config(profile_id: str, config_type: str, req: SaveConfigRequest):
    """특정 프로필의 설정을 Neon DB에 클라우드 저장합니다."""
    if not is_db_available():
        raise HTTPException(status_code=503, detail="Neon DB에 연결할 수 없습니다. .env의 DATABASE_URL을 확인하세요.")
    success = set_profile_config(profile_id, config_type, req.data)
    if not success:
        raise HTTPException(status_code=500, detail="프로필 설정 저장에 실패했습니다.")
    return {"success": True, "message": f"[{profile_id}] 프로필의 {config_type} 설정이 저장되었습니다."}
