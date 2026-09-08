"""
GUMA™ FastAPI Backend Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

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

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "GUMA™ Backend API",
        "version": "1.0.0",
        "message": "FastAPI 백엔드 서버가 성공적으로 가동되었습니다."
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
