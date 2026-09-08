# 🦙 Ollama 명령어 완전 정리

> Ollama는 로컬 환경에서 대형 언어 모델(LLM)을 손쉽게 실행할 수 있는 도구입니다.  
> 공식 사이트: https://ollama.com

---

## 📋 목차

- [기본 구조](#기본-구조)
- [serve](#-serve--서버-실행)
- [run](#-run--모델-실행-대화)
- [pull](#-pull--모델-다운로드)
- [push](#-push--모델-업로드)
- [list](#-list--모델-목록-조회)
- [show](#-show--모델-정보-확인)
- [ps](#-ps--실행-중인-모델-확인)
- [cp](#-cp--모델-복사)
- [rm](#-rm--모델-삭제)
- [create](#-create--커스텀-모델-생성)
- [Modelfile 작성법](#-modelfile-작성법)
- [환경변수](#-환경변수)
- [REST API](#-rest-api)
- [실전 활용 예시](#-실전-활용-예시)

---

## 기본 구조

```bash
ollama <명령어> [옵션] [인자]
```

| 명령어 | 설명 |
|--------|------|
| `serve` | Ollama 서버 실행 |
| `run` | 모델 실행 및 대화 시작 |
| `pull` | 모델 다운로드 |
| `push` | 모델 레지스트리에 업로드 |
| `list` | 로컬 모델 목록 조회 |
| `show` | 모델 상세 정보 확인 |
| `ps` | 현재 실행 중인 모델 확인 |
| `cp` | 모델 복사 |
| `rm` | 모델 삭제 |
| `create` | Modelfile로 커스텀 모델 생성 |
| `help` | 도움말 출력 |
| `version` | 버전 정보 출력 |

---

## 🟢 `serve` — 서버 실행

Ollama 백그라운드 서버를 직접 실행합니다.  
(일반적으로 데몬으로 자동 실행되므로 수동 사용은 드뭅니다.)

```bash
ollama serve
```

- 기본 포트: `11434`
- API 엔드포인트: `http://localhost:11434`

> **참고:** 대부분의 OS에서 설치 시 자동으로 서비스로 등록됩니다.

---

## 🟢 `run` — 모델 실행 / 대화

모델을 실행하고 대화형 인터페이스를 시작합니다.  
모델이 없으면 자동으로 다운로드 후 실행합니다.

```bash
ollama run <모델명>
ollama run <모델명>:<태그>
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `--verbose` | 응답 생성 통계 출력 (토큰/초 등) |
| `--nowordwrap` | 자동 줄바꿈 비활성화 |
| `--format json` | JSON 형식으로 응답 출력 |
| `--insecure` | HTTPS 인증서 검증 비활성화 |
| `--keepalive <시간>` | 모델 메모리 유지 시간 설정 (예: `5m`, `1h`) |

### 사용 예시

```bash
# 기본 실행
ollama run llama3.2

# 특정 태그(버전) 지정
ollama run llama3.2:3b
ollama run llama3.2:70b

# 단일 프롬프트 입력 후 종료 (비대화형)
ollama run llama3.2 "하늘은 왜 파란가요?"

# 파이프로 입력
echo "Python으로 피보나치 수열 작성해줘" | ollama run codellama

# 파일 내용을 컨텍스트로 전달
cat README.md | ollama run llama3.2 "이 문서 요약해줘"

# JSON 형식 응답
ollama run llama3.2 --format json "서울의 날씨 정보를 JSON으로 알려줘"

# 통계 포함 출력
ollama run llama3.2 --verbose "안녕하세요"
```

### 대화형 모드 내 특수 명령어

대화 중 슬래시(`/`)로 시작하는 명령어를 사용할 수 있습니다.

| 명령어 | 설명 |
|--------|------|
| `/bye` | 대화 종료 (Ctrl+D 와 동일) |
| `/exit` | 대화 종료 |
| `/clear` | 대화 히스토리 초기화 |
| `/set parameter <키> <값>` | 런타임 파라미터 설정 |
| `/set system <프롬프트>` | 시스템 프롬프트 변경 |
| `/show info` | 현재 모델 정보 출력 |
| `/show license` | 모델 라이선스 출력 |
| `/show modelfile` | 현재 모델의 Modelfile 출력 |
| `/show parameters` | 현재 모델 파라미터 출력 |
| `/show system` | 시스템 프롬프트 출력 |
| `/show template` | 모델 템플릿 출력 |
| `/load <모델명>` | 대화 중 다른 모델로 전환 |
| `/save <세션명>` | 현재 대화 세션 저장 |
| `/help` | 도움말 출력 |

### `/set` 에서 설정 가능한 파라미터

```
/set parameter num_ctx 4096        # 컨텍스트 윈도우 크기
/set parameter temperature 0.7     # 창의성 조절 (0.0 ~ 1.0)
/set parameter top_p 0.9           # 누클리어스 샘플링
/set parameter top_k 40            # Top-K 샘플링
/set parameter repeat_penalty 1.1  # 반복 페널티
/set parameter seed 42             # 랜덤 시드 고정
/set parameter num_predict 128     # 최대 생성 토큰 수
/set parameter stop "###"          # 정지 토큰 설정
```

---

## 🟢 `pull` — 모델 다운로드

Ollama 라이브러리에서 모델을 다운로드합니다.

```bash
ollama pull <모델명>
ollama pull <모델명>:<태그>
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `--insecure` | HTTPS 인증서 검증 비활성화 |

### 사용 예시

```bash
# 최신 버전 다운로드
ollama pull llama3.2

# 특정 크기/버전 지정
ollama pull llama3.2:1b
ollama pull llama3.2:3b
ollama pull mistral:7b
ollama pull gemma3:27b
ollama pull phi4:14b
ollama pull qwen2.5:72b
ollama pull deepseek-r1:8b
ollama pull codellama:13b
ollama pull nomic-embed-text       # 임베딩 모델
```

### 주요 모델 목록

| 모델 | 태그 예시 | 특징 |
|------|----------|------|
| `llama3.2` | `1b`, `3b` | Meta 최신 소형 모델 |
| `llama3.1` | `8b`, `70b`, `405b` | Meta 범용 모델 |
| `mistral` | `7b`, `nemo` | 빠르고 효율적 |
| `gemma3` | `1b`, `4b`, `12b`, `27b` | Google 모델 |
| `phi4` | `14b` | Microsoft 소형 고성능 |
| `qwen2.5` | `7b`, `14b`, `32b`, `72b` | Alibaba 다국어 모델 |
| `deepseek-r1` | `7b`, `8b`, `14b`, `32b` | 추론 특화 |
| `codellama` | `7b`, `13b`, `34b` | 코드 생성 특화 |
| `nomic-embed-text` | latest | 텍스트 임베딩 |
| `mxbai-embed-large` | latest | 임베딩 모델 |
| `llava` | `7b`, `13b` | 멀티모달 (이미지 이해) |

> 전체 모델 목록: https://ollama.com/library

---

## 🟢 `push` — 모델 업로드

커스텀 모델을 Ollama 레지스트리에 업로드합니다.

```bash
ollama push <네임스페이스>/<모델명>
ollama push <네임스페이스>/<모델명>:<태그>
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `--insecure` | HTTPS 인증서 검증 비활성화 |

### 사용 예시

```bash
# 모델 업로드 (ollama.com 계정 필요)
ollama push myusername/my-custom-model
ollama push myusername/my-custom-model:v1.0
```

> **참고:** 업로드 전 `ollama.com`에서 로그인 및 네임스페이스 설정이 필요합니다.

---

## 🟢 `list` — 모델 목록 조회

로컬에 다운로드된 모델 목록을 출력합니다.

```bash
ollama list
# 단축 명령어
ollama ls
```

### 출력 형식

```
NAME                    ID              SIZE    MODIFIED
llama3.2:3b             a80c4f17acd5    2.0 GB  2 days ago
mistral:7b              61e88e884507    4.1 GB  5 days ago
codellama:13b           9f438cb9cd58    7.4 GB  1 week ago
nomic-embed-text:latest 0a109f422b47    274 MB  2 weeks ago
```

| 컬럼 | 설명 |
|------|------|
| `NAME` | 모델명:태그 |
| `ID` | 모델 고유 식별자 (12자리 해시) |
| `SIZE` | 모델 파일 크기 |
| `MODIFIED` | 마지막 수정/다운로드 시간 |

---

## 🟢 `show` — 모델 정보 확인

특정 모델의 상세 정보를 출력합니다.

```bash
ollama show <모델명>
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `--modelfile` | Modelfile 내용 출력 |
| `--parameters` | 모델 파라미터 출력 |
| `--template` | 프롬프트 템플릿 출력 |
| `--system` | 시스템 프롬프트 출력 |
| `--license` | 라이선스 출력 |

### 사용 예시

```bash
# 전체 정보 출력
ollama show llama3.2

# Modelfile만 출력
ollama show llama3.2 --modelfile

# 파라미터만 출력
ollama show llama3.2 --parameters

# 템플릿만 출력
ollama show llama3.2 --template

# 시스템 프롬프트 출력
ollama show llama3.2 --system

# 라이선스 출력
ollama show llama3.2 --license
```

---

## 🟢 `ps` — 실행 중인 모델 확인

현재 메모리에 로드되어 실행 중인 모델 목록을 출력합니다.

```bash
ollama ps
```

### 출력 형식

```
NAME            ID              SIZE    PROCESSOR    UNTIL
llama3.2:3b     a80c4f17acd5    3.3 GB  100% GPU     4 minutes from now
```

| 컬럼 | 설명 |
|------|------|
| `NAME` | 모델명 |
| `ID` | 모델 ID |
| `SIZE` | 메모리 사용량 |
| `PROCESSOR` | CPU/GPU 사용 비율 |
| `UNTIL` | 메모리 유지 만료 시간 |

---

## 🟢 `cp` — 모델 복사

로컬 모델을 다른 이름으로 복사합니다.

```bash
ollama cp <원본모델> <복사모델>
```

### 사용 예시

```bash
# 모델을 새 이름으로 복사
ollama cp llama3.2 my-llama

# 커스터마이징 전 백업
ollama cp mistral:7b mistral-backup

# 네임스페이스 포함 복사
ollama cp llama3.2 myusername/llama3.2-custom
```

---

## 🟢 `rm` — 모델 삭제

로컬에 저장된 모델을 삭제합니다.

```bash
ollama rm <모델명>
ollama rm <모델명>:<태그>
```

### 사용 예시

```bash
# 특정 모델 삭제
ollama rm llama3.2

# 특정 태그만 삭제
ollama rm llama3.2:3b

# 여러 모델 동시 삭제
ollama rm llama3.2 mistral codellama
```

---

## 🟢 `create` — 커스텀 모델 생성

Modelfile을 기반으로 커스텀 모델을 생성합니다.

```bash
ollama create <모델명> -f <Modelfile경로>
ollama create <모델명> --file <Modelfile경로>
```

### 옵션

| 옵션 | 설명 |
|------|------|
| `-f`, `--file` | 사용할 Modelfile 경로 (기본값: `./Modelfile`) |
| `-q`, `--quantize` | 양자화 방식 지정 |

### 양자화 옵션

| 값 | 설명 |
|----|------|
| `q4_0` | 4비트 양자화 (빠름, 낮은 품질) |
| `q4_K_M` | 4비트 K-평균 양자화 (권장) |
| `q5_0` | 5비트 양자화 |
| `q5_K_M` | 5비트 K-평균 양자화 |
| `q8_0` | 8비트 양자화 (높은 품질) |
| `f16` | 16비트 부동소수점 (최고 품질) |

### 사용 예시

```bash
# 기본 사용 (현재 디렉토리의 Modelfile 사용)
ollama create my-model

# Modelfile 경로 지정
ollama create my-model -f ./Modelfile

# 절대 경로 사용
ollama create my-model -f /home/user/models/Modelfile

# 양자화 옵션 적용
ollama create my-model -f Modelfile --quantize q4_K_M
```

---

## 🟢 `version` — 버전 확인

```bash
ollama version
# 또는
ollama --version
```

---

## 🟢 `help` — 도움말

```bash
# 전체 도움말
ollama help

# 특정 명령어 도움말
ollama help run
ollama help pull
ollama run --help
```

---

## 📄 Modelfile 작성법

Modelfile은 커스텀 모델을 정의하는 설정 파일입니다.

### 기본 구조

```dockerfile
# 베이스 모델 지정 (필수)
FROM llama3.2

# 시스템 프롬프트 설정
SYSTEM """
당신은 친절한 한국어 AI 어시스턴트입니다.
항상 존댓말을 사용하고, 명확하고 도움이 되는 답변을 제공합니다.
"""

# 모델 파라미터 설정
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_ctx 4096
PARAMETER repeat_penalty 1.1
PARAMETER num_predict 512
PARAMETER stop "<|end|>"
PARAMETER stop "User:"
PARAMETER stop "Assistant:"

# 프롬프트 템플릿 (선택)
TEMPLATE """
{{ if .System }}<|system|>
{{ .System }}<|end|>
{{ end }}{{ if .Prompt }}<|user|>
{{ .Prompt }}<|end|>
{{ end }}<|assistant|>
{{ .Response }}<|end|>
"""

# 메시지 예시 (few-shot)
MESSAGE user 안녕하세요!
MESSAGE assistant 안녕하세요! 무엇을 도와드릴까요? 😊

# 라이선스 (선택)
LICENSE """
MIT License
"""
```

### Modelfile 명령어 전체 목록

| 명령어 | 필수 | 설명 |
|--------|------|------|
| `FROM` | ✅ | 베이스 모델 지정 (모델명 또는 GGUF 파일 경로) |
| `SYSTEM` | ❌ | 시스템 프롬프트 설정 |
| `PARAMETER` | ❌ | 모델 실행 파라미터 설정 |
| `TEMPLATE` | ❌ | 프롬프트 템플릿 정의 |
| `MESSAGE` | ❌ | Few-shot 예시 메시지 |
| `ADAPTER` | ❌ | LoRA 어댑터 파일 경로 |
| `LICENSE` | ❌ | 모델 라이선스 정보 |

### 로컬 GGUF 파일로 모델 생성

```dockerfile
# 로컬 GGUF 파일 사용
FROM ./my-model.gguf

SYSTEM "당신은 전문 코딩 어시스턴트입니다."
PARAMETER temperature 0.3
```

```bash
ollama create coding-assistant -f Modelfile
```

### PARAMETER 전체 목록

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `temperature` | float | 0.8 | 창의성 (높을수록 다양한 응답) |
| `top_p` | float | 0.9 | 누클리어스 샘플링 확률 |
| `top_k` | int | 40 | 고려할 상위 토큰 수 |
| `num_ctx` | int | 2048 | 컨텍스트 윈도우 크기 |
| `num_predict` | int | 128 | 최대 생성 토큰 수 (-1: 무제한) |
| `repeat_penalty` | float | 1.1 | 반복 억제 강도 |
| `repeat_last_n` | int | 64 | 반복 체크 범위 (토큰 수) |
| `seed` | int | 0 | 랜덤 시드 (0: 랜덤) |
| `stop` | string | - | 생성 중단 토큰 |
| `tfs_z` | float | 1.0 | Tail-free 샘플링 |
| `num_gpu` | int | -1 | GPU 레이어 수 (-1: 자동) |
| `num_thread` | int | - | CPU 스레드 수 |
| `mirostat` | int | 0 | Mirostat 모드 (0/1/2) |
| `mirostat_tau` | float | 5.0 | Mirostat 목표 perplexity |
| `mirostat_eta` | float | 0.1 | Mirostat 학습률 |
| `penalize_newline` | bool | true | 줄바꿈 페널티 여부 |
| `numa` | bool | false | NUMA 최적화 사용 여부 |

---

## ⚙️ 환경변수

Ollama 동작을 환경변수로 제어할 수 있습니다.

### 서버 설정

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `OLLAMA_HOST` | `127.0.0.1:11434` | 서버 바인딩 주소 및 포트 |
| `OLLAMA_ORIGINS` | - | 허용할 CORS 출처 (쉼표 구분) |
| `OLLAMA_MODELS` | `~/.ollama/models` | 모델 저장 경로 |
| `OLLAMA_KEEP_ALIVE` | `5m` | 모델 메모리 유지 시간 |
| `OLLAMA_MAX_LOADED_MODELS` | `3` (GPU) / `1` (CPU) | 동시 로드 가능한 모델 수 |
| `OLLAMA_NUM_PARALLEL` | `4` (GPU) / `1` (CPU) | 병렬 요청 처리 수 |
| `OLLAMA_MAX_QUEUE` | `512` | 최대 요청 큐 크기 |

### GPU / 성능 설정

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `OLLAMA_GPU_OVERHEAD` | `0` | GPU 예약 메모리 (바이트) |
| `CUDA_VISIBLE_DEVICES` | - | 사용할 CUDA GPU 장치 번호 |
| `ROCR_VISIBLE_DEVICES` | - | 사용할 ROCm GPU 장치 번호 |
| `OLLAMA_NUM_GPU` | - | 사용할 GPU 수 |
| `OLLAMA_FLASH_ATTENTION` | `0` | Flash Attention 활성화 |
| `OLLAMA_NOPRUNE` | - | 미사용 레이어 정리 비활성화 |

### 디버깅

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `OLLAMA_DEBUG` | `0` | 디버그 로그 출력 (`1`로 활성화) |
| `OLLAMA_TMPDIR` | - | 임시 파일 저장 경로 |
| `HTTPS_PROXY` | - | HTTPS 프록시 설정 |
| `HTTP_PROXY` | - | HTTP 프록시 설정 |
| `NO_PROXY` | - | 프록시 제외 주소 |

### 환경변수 설정 예시

```bash
# 외부 접속 허용 (모든 IP)
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# 모델 저장 경로 변경
export OLLAMA_MODELS=/mnt/large-disk/ollama-models
ollama serve

# 메모리 유지 시간 변경 (10분)
export OLLAMA_KEEP_ALIVE=10m
ollama serve

# 모델을 즉시 메모리에서 해제
export OLLAMA_KEEP_ALIVE=0
ollama serve

# 디버그 모드
OLLAMA_DEBUG=1 ollama serve

# CORS 허용
export OLLAMA_ORIGINS="http://localhost:3000,https://myapp.com"
ollama serve
```

---

## 🌐 REST API

Ollama는 `http://localhost:11434`에서 REST API를 제공합니다.

### 주요 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/generate` | 텍스트 생성 (스트리밍) |
| `POST` | `/api/chat` | 대화형 채팅 |
| `POST` | `/api/embeddings` | 텍스트 임베딩 생성 |
| `POST` | `/api/pull` | 모델 다운로드 |
| `POST` | `/api/push` | 모델 업로드 |
| `POST` | `/api/create` | 모델 생성 |
| `POST` | `/api/copy` | 모델 복사 |
| `DELETE` | `/api/delete` | 모델 삭제 |
| `GET` | `/api/tags` | 모델 목록 조회 |
| `GET` | `/api/show` | 모델 정보 조회 |
| `GET` | `/api/ps` | 실행 중인 모델 조회 |
| `GET` | `/api/version` | 버전 조회 |
| `HEAD` | `/` | 서버 상태 확인 |

### API 사용 예시

```bash
# 텍스트 생성
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "하늘은 왜 파란가요?",
  "stream": false
}'

# 채팅
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [
    { "role": "user", "content": "안녕하세요!" }
  ]
}'

# 임베딩 생성
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "임베딩할 텍스트"
}'

# 모델 목록
curl http://localhost:11434/api/tags

# 실행 중인 모델
curl http://localhost:11434/api/ps

# 버전 확인
curl http://localhost:11434/api/version
```

---

## 🚀 실전 활용 예시

### 1. 한국어 특화 어시스턴트 만들기

```dockerfile
# Modelfile-korean
FROM llama3.2

SYSTEM """
당신은 전문적인 한국어 AI 어시스턴트입니다.
- 항상 정확하고 자연스러운 한국어로 답변합니다.
- 복잡한 내용은 단계별로 명확하게 설명합니다.
- 사용자에게 친절하고 예의 바른 태도를 유지합니다.
"""

PARAMETER temperature 0.7
PARAMETER num_ctx 8192
```

```bash
ollama create korean-ai -f Modelfile-korean
ollama run korean-ai
```

### 2. 코드 리뷰 봇 만들기

```dockerfile
# Modelfile-codereview
FROM codellama:13b

SYSTEM """
You are an expert code reviewer. Analyze code for:
1. Bugs and logical errors
2. Security vulnerabilities  
3. Performance issues
4. Code style and best practices
Provide specific, actionable feedback.
"""

PARAMETER temperature 0.2
PARAMETER num_ctx 16384
PARAMETER num_predict 2048
```

```bash
ollama create code-reviewer -f Modelfile-codereview
cat my_code.py | ollama run code-reviewer "이 코드를 리뷰해주세요"
```

### 3. 멀티모달 이미지 분석

```bash
# 이미지와 함께 대화 (llava 모델 필요)
ollama pull llava
ollama run llava "이 이미지를 설명해줘" /path/to/image.jpg
```

### 4. 스크립트에서 활용

```bash
#!/bin/bash
# 여러 파일 요약 자동화

for file in *.txt; do
  echo "=== $file 요약 ==="
  cat "$file" | ollama run llama3.2 "이 텍스트를 3줄로 요약해주세요:" --nowordwrap
  echo ""
done
```

### 5. Python에서 활용

```python
import requests
import json

def chat(model: str, message: str) -> str:
    response = requests.post(
        "http://localhost:11434/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": message}],
            "stream": False
        }
    )
    return response.json()["message"]["content"]

result = chat("llama3.2", "파이썬의 장점을 5가지 알려주세요")
print(result)
```

### 6. 모델 성능 비교

```bash
QUESTION="피보나치 수열을 Python으로 구현해줘"

for model in llama3.2 mistral phi4; do
  echo "=== $model ==="
  echo "$QUESTION" | ollama run $model --verbose 2>&1 | tail -5
done
```

---

## 📁 파일 및 디렉토리 구조

```
~/.ollama/
├── models/          # 다운로드된 모델 파일
│   ├── blobs/       # 모델 가중치 (SHA256 해시명)
│   └── manifests/   # 모델 메타데이터
├── logs/            # 서버 로그
└── id_ed25519       # 인증 키 (push용)
```

---

*최종 업데이트: 2025년 | Ollama 공식 문서: https://github.com/ollama/ollama*
