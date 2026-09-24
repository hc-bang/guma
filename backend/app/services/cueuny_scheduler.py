"""
GUMA™ 큐스코 큐니(CUEUNY) 크론 스케줄러 모듈
- croniter 기반 표준 크론 표현식(CUEUNY_SCHEDULE_CRON) 파케줄링
- 백그라운드 데몬 스레드로 주기적 자동 수집 및 다운로드 실행
"""

import os
import time
import logging
import threading
from datetime import datetime
from croniter import croniter
from dotenv import load_dotenv

try:
    from app.services.cueuny_service import (
        fetch_and_sync_replays,
        get_cueuny_status
    )
except ImportError:
    from backend.app.services.cueuny_service import (
        fetch_and_sync_replays,
        get_cueuny_status
    )

logger = logging.getLogger("guma.cueuny.scheduler")

_scheduler_thread: threading.Thread = None
_stop_event = threading.Event()
_next_run_time: datetime = None


def get_current_cron_expression() -> str:
    """환경변수에서 최신 CUEUNY_SCHEDULE_CRON 읽기 (기본값: 0 4 * * *)"""
    load_dotenv()
    return os.getenv("CUEUNY_SCHEDULE_CRON", "0 4 * * *").strip() or "0 4 * * *"


def get_next_run_time() -> str:
    """다음 스케줄 실행 시각 ISO 문자열 반환"""
    global _next_run_time
    if _next_run_time:
        return _next_run_time.isoformat()
    return ""


def _scheduler_loop():
    """백그라운드 스케줄러 루프"""
    global _next_run_time

    logger.info("[CUEUNY-SCHEDULER] 스케줄러 데몬 시작")

    # 서버 시작 직후 1회 초기 목록 동기화 시도 (세션이 설정되어 있는 경우)
    try:
        session = os.getenv("CUEUNY_SESSION", "").strip()
        login_id = os.getenv("CUEUNY_LOGIN_ID", "").strip()
        if session and login_id:
            logger.info("[CUEUNY-SCHEDULER] 서버 초기 기동 시 큐니 리플레이 1회 초기 동기화 시작")
            fetch_and_sync_replays()
    except Exception as e:
        logger.error(f"[CUEUNY-SCHEDULER] 초기 동기화 오류: {e}")

    while not _stop_event.is_set():
        cron_expr = get_current_cron_expression()
        now = datetime.now()

        try:
            itr = croniter(cron_expr, now)
            _next_run_time = itr.get_next(datetime)
            logger.info(f"[CUEUNY-SCHEDULER] 현재 크론 설정: '{cron_expr}' | 다음 실행 시각: {_next_run_time}")
        except Exception as e:
            logger.error(f"[CUEUNY-SCHEDULER] 크론 표현식 '{cron_expr}' 파싱 실패: {e}")
            # 파싱 실패 시 10분 후 재시도
            time.sleep(600)
            continue

        # 다음 실행 시각까지 10초 단위로 체크하며 대기 (_stop_event 반응성 확보)
        while not _stop_event.is_set():
            current_now = datetime.now()
            if current_now >= _next_run_time:
                break
            # 크론 표현식이 도중에 변경되었는지 감지
            new_cron = get_current_cron_expression()
            if new_cron != cron_expr:
                logger.info(f"[CUEUNY-SCHEDULER] 크론 설정 변경 감지: {cron_expr} -> {new_cron}")
                break
            time.sleep(5)

        if _stop_event.is_set():
            break

        # 실행 시각 도달 시 동기화 수행
        if datetime.now() >= _next_run_time:
            logger.info("[CUEUNY-SCHEDULER] ⏰ 정기 스케줄 실행: 큐스코 큐니 리플레이 수집 및 다운로드 시작")
            try:
                result = fetch_and_sync_replays()
                logger.info(f"[CUEUNY-SCHEDULER] 정기 수집 완료: {result.get('synced_count', 0)}건 동기화됨")
            except Exception as e:
                logger.error(f"[CUEUNY-SCHEDULER] 정기 수집 중 예외 발생: {e}")

    logger.info("[CUEUNY-SCHEDULER] 스케줄러 데몬 안전 종료")


def start_cueuny_scheduler():
    """큐니 크론 스케줄러 시작"""
    global _scheduler_thread, _stop_event

    if _scheduler_thread and _scheduler_thread.is_alive():
        logger.info("[CUEUNY-SCHEDULER] 스케줄러가 이미 실행 중입니다.")
        return

    _stop_event.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="cueuny-cron-scheduler")
    _scheduler_thread.start()
    logger.info("[CUEUNY-SCHEDULER] 큐스코 큐니 백그라운드 스케줄러가 성공적으로 시작되었습니다.")


def stop_cueuny_scheduler():
    """큐니 크론 스케줄러 정지"""
    global _scheduler_thread, _stop_event
    _stop_event.set()
    if _scheduler_thread and _scheduler_thread.is_alive():
        _scheduler_thread.join(timeout=3)
        logger.info("[CUEUNY-SCHEDULER] 스케줄러가 정상적으로 정지되었습니다.")
