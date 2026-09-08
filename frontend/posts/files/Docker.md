# Docker & Docker Compose 실무 가이드 (정리본)

Docker와 Docker Compose(Compose v2)를 **처음부터 실무 운영 수준까지** 이해할 수 있도록 개념/명령어/예제/트러블슈팅/베스트 프랙티스를 정리했습니다.

> 이 문서는 **복붙 가능한 예제**와, 초보자가 자주 막히는 포인트(ready 상태, 볼륨, 네트워크, 권한 등)를 중심으로 구성했습니다.

---

## 목차

- [Docker \& Docker Compose 실무 가이드 (정리본)](#docker--docker-compose-실무-가이드-정리본)
  - [목차](#목차)
  - [1) 컨테이너 기술 개념](#1-컨테이너-기술-개념)
    - [VM vs Container](#vm-vs-container)
    - [핵심 기술](#핵심-기술)
  - [2) Docker 아키텍처 내부 구조](#2-docker-아키텍처-내부-구조)
  - [3) 설치/환경 확인 \& 권한](#3-설치환경-확인--권한)
    - [설치 확인](#설치-확인)
    - [Linux에서 권한 문제(권장)](#linux에서-권한-문제권장)
  - [4) Docker CLI 핵심 명령어](#4-docker-cli-핵심-명령어)
    - [이미지](#이미지)
    - [컨테이너](#컨테이너)
    - [리소스 확인](#리소스-확인)
    - [시스템 정리(주의)](#시스템-정리주의)
  - [5) Dockerfile 실무 패턴](#5-dockerfile-실무-패턴)
    - [Node.js 예시(기본형)](#nodejs-예시기본형)
      - [캐시 최적화 포인트](#캐시-최적화-포인트)
  - [6) 이미지 최적화(멀티 스테이지)](#6-이미지-최적화멀티-스테이지)
  - [7) Volume / Bind Mount 실무](#7-volume--bind-mount-실무)
    - [차이](#차이)
    - [Named Volume](#named-volume)
    - [Bind Mount(예: nginx 정적 파일)](#bind-mount예-nginx-정적-파일)
  - [8) Network 실무](#8-network-실무)
    - [기본](#기본)
    - [확인](#확인)
  - [9) Docker Compose(Compose v2) 완전 정리](#9-docker-composecompose-v2-완전-정리)
    - [9.1 파일명](#91-파일명)
    - [9.2 기본 구조 예시](#92-기본-구조-예시)
    - [9.3 자주 쓰는 명령어](#93-자주-쓰는-명령어)
    - [9.4 depends\_on 오해 정리(중요)](#94-depends_on-오해-정리중요)
    - [9.5 환경변수(.env) 패턴](#95-환경변수env-패턴)
  - [10) 실전 예제: Node + MongoDB](#10-실전-예제-node--mongodb)
  - [11) 실전 예제: Nginx Reverse Proxy](#11-실전-예제-nginx-reverse-proxy)
  - [12) 운영 베스트 프랙티스](#12-운영-베스트-프랙티스)
  - [13) 보안 가이드(필수 체크)](#13-보안-가이드필수-체크)
  - [14) 성능 최적화](#14-성능-최적화)
  - [15) 디버깅 \& 트러블슈팅](#15-디버깅--트러블슈팅)
    - [컨테이너가 바로 종료됨](#컨테이너가-바로-종료됨)
    - [포트 충돌](#포트-충돌)
    - [네트워크 확인](#네트워크-확인)
  - [16) CI/CD 연동 개요](#16-cicd-연동-개요)
  - [17) Production 아키텍처 패턴](#17-production-아키텍처-패턴)
  - [18) 자주 발생하는 실수 TOP 20](#18-자주-발생하는-실수-top-20)
  - [19) 학습 로드맵](#19-학습-로드맵)
  - [참고 링크](#참고-링크)

---

## 1) 컨테이너 기술 개념

### VM vs Container
- **VM**: OS까지 포함(무거움), 부팅 느림
- **Container**: Host OS 커널 공유(가벼움), 실행 빠름

### 핵심 기술
- **namespaces**: 프로세스를 격리(프로세스/네트워크/마운트 등)
- **cgroups**: CPU/메모리/IO 리소스 제한
- **union filesystem**: 레이어 기반 이미지(overlay2 등)

---

## 2) Docker 아키텍처 내부 구조

구성 요소:
- Docker Client (`docker` CLI)
- Docker Daemon (`dockerd`)
- Container runtime (`containerd` → `runc`)
- Image registry (Docker Hub, GHCR 등)

흐름(개략):

```
CLI → REST API → dockerd → containerd → runc → container process
```

---

## 3) 설치/환경 확인 & 권한

### 설치 확인

```bash
docker --version
docker compose version
docker info
```

### Linux에서 권한 문제(권장)

```bash
sudo usermod -aG docker $USER
# 적용을 위해 재로그인 필요
```

> Windows/macOS(Docker Desktop)는 일반적으로 위 권한 작업이 필요 없습니다.

---

## 4) Docker CLI 핵심 명령어

### 이미지

```bash
# 이미지 받기
docker pull nginx:alpine

# 이미지 목록
docker images

# 이미지 빌드
docker build -t myapp:1.0 .

# 이미지 삭제
docker rmi myapp:1.0
```

### 컨테이너

```bash
# 실행(포트 매핑)
docker run -d --name web -p 8080:80 nginx:alpine

# 실행 중 컨테이너
docker ps

# 종료된 것 포함
docker ps -a

# 로그
docker logs web
# 실시간 로그
docker logs -f web

# 내부 접속(Alpine에는 bash가 없을 수 있어 sh 권장)
docker exec -it web sh

# 중지/삭제
docker stop web
docker rm web
```

### 리소스 확인

```bash
docker stats
```

### 시스템 정리(주의)

```bash
# 안 쓰는 리소스 정리(확인 후 신중히)
docker system prune

# 이미지까지 포함(더 강력)
docker system prune -a

# 볼륨까지 삭제(데이터 삭제!)
docker system prune --volumes
```

---

## 5) Dockerfile 실무 패턴

### Node.js 예시(기본형)

```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
EXPOSE 3000
CMD [\"npm\", \"start\"]
```

#### 캐시 최적화 포인트
- `package*.json` 먼저 `COPY`하고 `npm ci`를 먼저 실행 → 코드 변경 시 의존성 레이어 재사용 가능

---

## 6) 이미지 최적화(멀티 스테이지)

빌드/런타임을 분리하여 이미지 크기와 공격면을 줄입니다.

```dockerfile
# 1) build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) runtime stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD [\"node\", \"dist/server.js\"]
```

> 프로젝트 구조에 맞게 `dist/` 경로는 조정하세요.

---

## 7) Volume / Bind Mount 실무

### 차이
- **Named Volume**: Docker가 관리(영속 데이터에 적합)
- **Bind Mount**: Host 디렉터리를 그대로 연결(개발 시 코드 마운트에 적합)

### Named Volume

```bash
docker volume create app_data
```

```bash
docker run -d --name db -v app_data:/var/lib/postgresql/data postgres:16
```

### Bind Mount(예: nginx 정적 파일)

macOS/Linux:
```bash
docker run -d --name web -p 8080:80 -v \"$(pwd)\":/usr/share/nginx/html:ro nginx:alpine
```

Windows CMD:
```bat
docker run -d --name web -p 8080:80 -v %cd%:/usr/share/nginx/html:ro nginx:alpine
```

PowerShell:
```powershell
docker run -d --name web -p 8080:80 -v ${PWD}:/usr/share/nginx/html:ro nginx:alpine
```

---

## 8) Network 실무

### 기본
- Compose를 쓰면 기본적으로 프로젝트 단위의 네트워크가 만들어지고, 서비스명으로 DNS가 잡힙니다.
  - 예: `app` 서비스에서 `mongo:27017`로 접속 가능

### 확인

```bash
docker network ls
docker network inspect <NETWORK>
```

> `host` 네트워크는 Linux에서 주로 사용하며, Windows/macOS Docker Desktop에서는 제약이 있을 수 있습니다.

---

## 9) Docker Compose(Compose v2) 완전 정리

### 9.1 파일명
- 기본: `compose.yaml` (또는 `docker-compose.yml`도 동작)

### 9.2 기본 구조 예시

> Compose v2에서는 `version:`을 생략하는 형태가 일반적입니다(써도 동작하지만 권장 흐름은 생략).

```yaml
services:
  app:
    build: .
    ports:
      - \"3000:3000\"
    environment:
      NODE_ENV: production
```

### 9.3 자주 쓰는 명령어

```bash
# 올리기(백그라운드)
docker compose up -d

# 내리기(컨테이너/네트워크 제거)
docker compose down

# 상태
docker compose ps

# 로그
docker compose logs
# tail + follow
docker compose logs -f --tail=200

# 특정 서비스 내부 접속
# (alpine 기반이면 sh 권장)
docker compose exec app sh
```

### 9.4 depends_on 오해 정리(중요)
- `depends_on`은 **컨테이너 시작 순서**만 보장합니다.
- DB가 “ready” 상태가 되는 것까지는 보장하지 않습니다.

실무 대응:
- 앱에서 DB 연결 retry/backoff 구현
- 또는 `healthcheck`를 추가하고(가능한 범위에서) 상태 기반으로 운영

### 9.5 환경변수(.env) 패턴

- `compose.yaml`과 같은 폴더에 `.env`를 두면 자동 로드되는 패턴이 흔합니다.

```yaml
services:
  app:
    image: myapp:1.0
    env_file:
      - .env
```

---

## 10) 실전 예제: Node + MongoDB

`compose.yaml`

```yaml
services:
  app:
    build: .
    ports:
      - \"3000:3000\"
    environment:
      MONGO_URL: mongodb://mongo:27017/mydb
    depends_on:
      - mongo

  mongo:
    image: mongo:7
    ports:
      - \"27017:27017\"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

실행:

```bash
docker compose up -d --build
```

---

## 11) 실전 예제: Nginx Reverse Proxy

`compose.yaml`

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - \"80:80\"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
```

---

## 12) 운영 베스트 프랙티스

- 가능한 한 **공식 이미지 + 고정 태그(버전)** 사용 (`postgres:16`, `nginx:1.25-alpine` 등)
- `restart: unless-stopped` 등 재시작 정책 명시
- DB/영속 데이터는 **반드시 volume 분리**
- 로그는 `docker compose logs`로 보되, 운영에서는 수집/보관 정책(ELK/Cloud Logging 등) 고려
- 개발/운영 Compose 분리
  - 예: `compose.yaml` + `compose.override.yaml`(개발용 bind mount)

---

## 13) 보안 가이드(필수 체크)

- 컨테이너를 **root로 실행하지 않기**(가능하면)
  - 이미지가 지원하면 `USER` 지정
- 비밀값(토큰/키)은 코드/이미지에 넣지 말고
  - `.env` + 배포 환경의 Secret Manager 등 사용
- 불필요한 포트 외부 노출 금지
- 이미지 취약점 스캔은 환경/도구 정책에 따라 다름
  - `docker scan`은 환경에 따라 동작하지 않을 수 있음(별도 도구(Trivy 등) 권장)

---

## 14) 성능 최적화

- 레이어 최소화(불필요한 RUN 분리 줄이기)
- 캐시 활용(`package.json` 먼저 COPY)
- 작은 base image 사용(alpine 등, 단 glibc 필요 앱은 예외)
- `.dockerignore` 적극 활용

예:

```gitignore
node_modules
.git
.env
.DS_Store
```

---

## 15) 디버깅 & 트러블슈팅

### 컨테이너가 바로 종료됨

```bash
docker logs <CONTAINER>
```

### 포트 충돌
- 에러: `bind: address already in use`

```bash
docker ps
# 또는 다른 포트로 매핑
# -p 8081:80
```

### 네트워크 확인

```bash
docker inspect <CONTAINER>
docker network inspect <NETWORK>
```

---

## 16) CI/CD 연동 개요

일반적인 흐름:

```
Git Push → CI Build/Test → Docker Build → Registry Push → Deploy
```

---

## 17) Production 아키텍처 패턴

가장 흔한 구성 예:
- Reverse Proxy(Nginx)
- App
- DB
- Cache(Redis)
- Worker/Queue

운영에서는 DB를 컨테이너로 둘지(로컬) / 매니지드로 둘지(RDS 등) 선택이 중요합니다.

---

## 18) 자주 발생하는 실수 TOP 20

1. `down -v`로 볼륨 삭제(데이터 날아감)
2. 포트 충돌
3. 환경변수 누락
4. `depends_on`을 “ready 보장”으로 오해
5. 캐시 때문에 변경이 반영 안 된다고 오해(실제로는 이전 이미지 실행 중)
6. root 권한 실행
7. 이미지 태그를 `latest`만 사용
8. `.env`/시크릿을 이미지에 COPY
9. 로컬 bind mount로 운영 배포
10. 로그/모니터링 없이 운영

(나머지는 프로젝트 성격에 따라 확장)

---

## 19) 학습 로드맵

1. `docker run`로 단일 컨테이너 실행
2. Dockerfile 작성/빌드
3. Compose로 멀티 서비스 구성
4. Volume/Network 이해
5. 운영 배포(재시작 정책/로그/모니터링)
6. CI/CD 연결
7. Kubernetes(필요 시)

---

## 참고 링크

- Docker Docs: https://docs.docker.com/
- Compose Docs: https://docs.docker.com/compose/
