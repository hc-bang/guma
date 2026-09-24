"""
GUMA™ FastAPI Backend Application Entry Point
프론트엔드 정적 파일과 백엔드 API를 단일 서버에서 동시에 서빙하는 통합 서버
"""

import os
from fastapi import FastAPI, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

try:
    from app.routers import youtube, config_hub, torrent, cueuny
    from app.database import init_db
    from app.services import aria2_service
    from app.services.cueuny_scheduler import start_cueuny_scheduler, stop_cueuny_scheduler
except ImportError:
    from backend.app.routers import youtube, config_hub, torrent, cueuny
    from backend.app.database import init_db
    from backend.app.services import aria2_service
    from backend.app.services.cueuny_scheduler import start_cueuny_scheduler, stop_cueuny_scheduler

app = FastAPI(
    title="GUMA™ Unified Server",
    description="GUMA™ 프론트엔드 및 파이썬 백엔드 통합 서비스",
    version="1.3.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

@app.on_event("startup")
def on_startup():
    print("[Server Startup] 1. 데이터베이스 초기화 진행...")
    try:
        init_db()
        print("[Server Startup] 1. 데이터베이스 초기화 완료")
    except Exception as e:
        print(f"[DB] 시작 시 초기화 예외: {e}")

    print("[Server Startup] 2. README 문서 동기화...")
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        root_readme = os.path.join(base_dir, "README.md")
        fe_readme = os.path.join(base_dir, "frontend", "README.md")
        if os.path.isfile(root_readme):
            import shutil
            shutil.copy2(root_readme, fe_readme)
        print("[Server Startup] 2. README 문서 동기화 완료")
    except Exception as e:
        print(f"[README] 동기화 실패: {e}")

    print("[Server Startup] 3. 가비지 임시 파일 정리...")
    try:
        aria2_service.cleanup_startup_garbage()
        print("[Server Startup] 3. 가비지 임시 파일 정리 완료")
    except Exception as e:
        print(f"[Garbage Cleanup] 시작 시 정리 예외: {e}")

    print("[Server Startup] 4. aria2c 다운로드 엔진 비동기 기동...")
    try:
        # FastAPI 포트 80 바인딩을 지연시키지 않도록 백그라운드 스레드로 안전 기동
        import threading
        threading.Thread(target=aria2_service.start_daemon, daemon=True, name="aria2-starter").start()
        print("[Server Startup] 4. aria2c 엔진 백그라운드 기동 시작")
    except Exception as e:
        print(f"[aria2] 시작 시 데몬 기동 안내: {e}")

    print("[Server Startup] 5. 큐스코 큐니(CUEUNY) 크론 스케줄러 기동...")
    try:
        start_cueuny_scheduler()
        print("[Server Startup] 5. 큐스코 큐니 스케줄러 기동 완료")
    except Exception as e:
        print(f"[CUEUNY] 스케줄러 기동 예외: {e}")

    print("[Server Startup] [OK] 모든 초기화 완료! 포트 80 웹 서버 가동 준비 완료.")

@app.on_event("shutdown")
def on_shutdown():
    try:
        aria2_service.stop_daemon()
    except Exception as e:
        print(f"[aria2] 종료 중 예외: {e}")
    try:
        stop_cueuny_scheduler()
    except Exception as e:
        print(f"[CUEUNY] 스케줄러 정지 예외: {e}")

# CORS 설정 (동일 출처 통합 시 기본 허용, 외부 도메인 및 클라우드 호환성 유지)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# 1. 백엔드 API 라우터 등록
app.include_router(youtube.router)
app.include_router(config_hub.router)
app.include_router(torrent.router)
app.include_router(cueuny.router)

@app.get("/api")
@app.get("/api/status")
def read_root():
    import yt_dlp
    return {
        "status": "online",
        "service": "GUMA™ Unified Backend API",
        "version": "1.1.0",
        "yt_dlp_version": getattr(yt_dlp, '__version__', 'unknown'),
        "message": "GUMA™ 단일 통합 서버가 성공적으로 가동되었습니다."
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon.png", include_in_schema=False)
@app.get("/apple-touch-icon.png", include_in_schema=False)
def favicon():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    favicon_path = os.path.join(base_dir, "frontend", "favicon.svg")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/svg+xml")
    return Response(status_code=204)

@app.get("/README.md", include_in_schema=False)
@app.get("/readme.md", include_in_schema=False)
def get_readme():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root_readme = os.path.join(base_dir, "README.md")
    if os.path.exists(root_readme):
        return FileResponse(root_readme, media_type="text/markdown; charset=utf-8")
    return Response(status_code=404)

# 2. 프론트엔드 정적 파일 서빙 마운트 (API 라우터보다 반드시 뒤에 위치)
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_dir = os.path.join(base_dir, "frontend")
if not os.path.exists(frontend_dir):
    frontend_dir = os.path.join(os.getcwd(), "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
