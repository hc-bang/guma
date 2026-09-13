FROM python:3.10-slim

# ffmpeg 및 시스템 도구 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 표준 비루트 유저(UID 1000) 설정
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR $HOME/app

# 파이썬 의존성 설치
COPY --chown=user backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --upgrade -r backend/requirements.txt

# 애플리케이션 소스 복사
COPY --chown=user backend ./backend
COPY --chown=user frontend/favicon.svg ./frontend/

# 기본 포트(8000) 노출
EXPOSE 8000

# FastAPI 백엔드 실행 (PORT 환경변수 지원)
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
