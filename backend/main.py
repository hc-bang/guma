"""
GUMA™ FastAPI Backend Application Entry Point
"""

from fastapi import FastAPI, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os

try:
    from app.routers import youtube
except ImportError:
    from backend.app.routers import youtube

app = FastAPI(
    title="GUMA™ API",
    description="GUMA™ 대시보드를 위한 파이썬 백엔드 API 서비스",
    version="1.0.0"
)

# CORS 설정 (GitHub Pages 프론트엔드 및 로컬 테스트 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(youtube.router)

@app.get("/")
def read_root():
    import yt_dlp
    return {
        "status": "online",
        "service": "GUMA™ Backend API",
        "version": "1.0.1",
        "commit": "140cb0f-check",
        "yt_dlp_version": getattr(yt_dlp, '__version__', 'unknown'),
        "message": "FastAPI 백엔드 서버가 성공적으로 가동되었습니다."
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon.png", include_in_schema=False)
@app.get("/apple-touch-icon.png", include_in_schema=False)
def favicon():
    favicon_path = os.path.join("frontend", "favicon.svg")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/svg+xml")
    return Response(status_code=204)

