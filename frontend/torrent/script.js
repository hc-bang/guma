/**
 * GUMA™ Torrent Downloader Frontend Controller
 * YouTube 감성의 미니멀 & 세련된 대시보드
 * - 마그넷 링크(magnet:?xt=...) 및 .torrent 파일 직접 선택 지원
 * - 다운로드 진행 중에만 온디맨드 1.5초 스마트 폴링 (유휴/완료/백그라운드시 데이터 0 소모)
 * - 완료 후 디스크 원본 파일 영구 삭제 및 브라우저 다운로드 연동
 */

(function () {
  'use strict';

  // API 기본 주소 해석 및 동적 터널 감지
  function getApiBase() {
    if (window.GumaCore && typeof window.GumaCore.getApiBase === 'function') {
      const base = window.GumaCore.getApiBase();
      if (base) return base.replace(/\/$/, '');
    }
    return '';
  }

  let API_BASE = getApiBase();

  // GitHub Pages 등 외부 접속 시 Cloudflare 터널 주소 자동 비동기 감지
  if (window.GumaCore && typeof window.GumaCore.ensureApiBase === 'function') {
    window.GumaCore.ensureApiBase().then(base => {
      if (base) API_BASE = base.replace(/\/$/, '');
    }).catch(e => console.warn('[Torrent] 터널 주소 자동 감지 대기:', e));
  }

  function getEffectiveApiBase() {
    if (API_BASE && (!window.GumaCore || window.GumaCore.isLocal() || API_BASE !== window.location.origin)) {
      return API_BASE;
    }
    return getApiBase();
  }

  function isBackendAvailable() {
    if (window.GumaCore && !window.GumaCore.isLocal()) {
      const base = getEffectiveApiBase();
      if (!base || base === window.location.origin) {
        return false;
      }
    }
    return true;
  }

  // DOM 요소 참조
  const btnChooseFile = document.getElementById('btn-choose-file');
  const fileInput = document.getElementById('torrent-file-input');
  const torrentList = document.getElementById('torrent-list');
  const emptyState = document.getElementById('empty-state');

  // 모달 DOM 요소 참조
  const torrentModal = document.getElementById('torrent-modal');
  const torrentModalClose = document.getElementById('torrent-modal-close');
  const modalTaskName = document.getElementById('modal-task-name');
  const modalStatusPill = document.getElementById('modal-status-pill');
  const modalProgressText = document.getElementById('modal-progress-text');
  const modalProgressBar = document.getElementById('modal-progress-bar');
  const modalStatSize = document.getElementById('modal-stat-size');
  const modalStatSpeed = document.getElementById('modal-stat-speed');
  const modalStatPeers = document.getElementById('modal-stat-peers');
  const modalStatEta = document.getElementById('modal-stat-eta');
  const modalFilesCount = document.getElementById('modal-files-count');
  const modalFilesList = document.getElementById('modal-files-list');
  const modalFooterActions = document.getElementById('modal-footer-actions');

  // 작업 상태 캐시 (GID -> 카드 DOM 요소 / GID -> 원본 Task 데이터)
  let tasksMap = new Map();
  let tasksDataMap = new Map();
  const actionStatusMap = new Map(); // GID -> 'cancelling' | 'deleting' | 'downloading'
  const deletedGids = new Set();     // 최근 취소/삭제 완료된 GID (폴링 시 유령 카드 부활 방지)
  const downloadingGids = new Set(); // 브라우저 다운로드 스트리밍 중인 GID
  let activeModalGid = null;
  let pollingTimer = null;

  /* ── 1. .torrent 파일 선택 및 업로드 제어 (연속 & 다중 등록 완벽 지원) ── */
  if (btnChooseFile && fileInput) {
    btnChooseFile.addEventListener('click', () => {
      fileInput.click(); // 언제나 자유롭게 연속 클릭 가능!
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        // 선택된 모든 파일(1개 또는 여러 개)을 병렬로 큐에 등록!
        Array.from(fileInput.files).forEach(file => {
          handleFileSelect(file);
        });
        fileInput.value = ''; // 다음 선택을 위해 즉시 초기화
      }
    });
  }

  const SPINNER_SVG = `<svg class="spin-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  const FOLDER_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  async function handleFileSelect(file) {
    if (!file.name.toLowerCase().endsWith('.torrent')) {
      alert(`'${file.name}'은 지원하지 않는 파일 형식입니다. .torrent 파일만 업로드할 수 있습니다.`);
      return;
    }

    if (!isBackendAvailable()) {
      alert("현재 GitHub Pages 정적 웹사이트(hc-bang.github.io)로 접속되어 있습니다.\n\n토렌트 다운로더 백엔드를 이용하시려면:\n1. 서버 IP(예: http://서버IP/torrent/)로 직접 접속하시거나\n2. 서버 manage.sh에서 11번(Cloudflare 터널)을 가동해 주세요.");
      return;
    }

    // [0ms 즉각 반응] 파일마다 개별 낙관적(Optimistic) 카드 즉시 생성!
    if (emptyState) emptyState.style.display = 'none';
    const tempCardEl = document.createElement('div');
    tempCardEl.className = 'torrent-card optimistic-card';
    tempCardEl.innerHTML = `
      <div class="card-status-box waiting">
        <span class="status-box-icon">${SPINNER_SVG}</span>
        <span class="status-box-label">등록중</span>
      </div>

      <div class="card-body">
        <div class="card-header-line">
          <span class="card-filename" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        </div>

        <div class="progress-track">
          <div class="progress-bar progress-indeterminate" style="width: 100%;"></div>
        </div>

        <div class="card-meta-line">
          <div class="meta-tags">
            <span>엔진에 작업을 등록하고 있습니다...</span>
          </div>
        </div>
      </div>

      <div class="card-actions">
        <button class="btn-cancel-card" disabled style="opacity: 0.5; cursor: default;">
          <span>등록중</span>
        </button>
      </div>
    `;
    torrentList.prepend(tempCardEl);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const base = getEffectiveApiBase();
      const resp = await fetch(`${base}/api/torrent/upload`, {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        if (resp.status === 405) {
          throw new Error('정적 사이트(GitHub Pages)에서는 백엔드 API를 지원하지 않습니다. 서버 IP(http://서버IP/torrent/)로 접속하거나 manage.sh 11번(Cloudflare 터널)을 가동해 주세요.');
        }
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || `업로드 실패 (HTTP ${resp.status})`);
      }

      const res = await resp.json();
      if (res.is_duplicate) {
        alert(`이미 목록에 존재하는 토렌트입니다: ${res.filename}`);
      }

      const task = res.task || {
        gid: res.gid,
        name: file.name,
        status: 'waiting',
        progress: 0,
        total_length_str: '계산 중...',
        completed_length_str: '0 B',
        download_speed_str: '0 B/s'
      };

      if (task && task.gid) {
        tasksDataMap.set(task.gid, task);

        // 이미 기존 카드가 있다면 해당 카드 갱신 및 임시 카드 제거
        let existingCard = tasksMap.get(task.gid);
        if (existingCard) {
          updateCardElement(existingCard, task);
          if (tempCardEl && tempCardEl.parentNode) {
            tempCardEl.remove();
          }
        } else {
          // [핵심] 임시 카드가 있던 바로 그 위치에서 실제 카드로 In-place 교체 (순간 삭제/깜빡임 0%)
          const realCardEl = createCardElement(task);
          updateCardElement(realCardEl, task);
          tasksMap.set(task.gid, realCardEl);

          if (tempCardEl && tempCardEl.parentNode) {
            tempCardEl.replaceWith(realCardEl);
          } else {
            torrentList.prepend(realCardEl);
          }
        }

        setTimeout(() => highlightCard(task.gid), 100);
      } else {
        if (tempCardEl && tempCardEl.parentNode) {
          tempCardEl.remove();
        }
      }

      // 백그라운드 상태 동기화 (전체 목록 갱신)
      fetchStatus();
    } catch (err) {
      if (tempCardEl && tempCardEl.parentNode) {
        tempCardEl.remove();
      }
      alert(`'${file.name}' 업로드 실패: ${err.message}`);
      fetchStatus();
    }
  }

  function highlightCard(gid) {
    const card = document.querySelector(`.torrent-card[data-gid="${gid}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('duplicate-highlight');
      setTimeout(() => {
        card.classList.remove('duplicate-highlight');
      }, 3600);
    }
  }

  /* ── 2. 온디맨드(On-Demand) 스마트 폴링 및 UI 렌더링 ────────────────── */
  function scheduleNextPoll(delayMs) {
    if (pollingTimer) clearTimeout(pollingTimer);
    if (document.hidden) return; // 화면 꺼짐 / 백그라운드 전환 시 예약 금지 (0 소모)
    pollingTimer = setTimeout(fetchStatus, delayMs);
  }

  let isFetchingStatus = false;

  async function fetchStatus() {
    if (document.hidden) return;
    if (isFetchingStatus) return; // 이전 조회가 진행 중이면 중복 호출 방지
    if (!isBackendAvailable()) {
      scheduleNextPoll(5000);
      return;
    }
    isFetchingStatus = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const base = getEffectiveApiBase();
      const resp = await fetch(`${base}/api/torrent/status`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!resp.ok) {
        scheduleNextPoll(3000);
        return;
      }

      const data = await resp.json();
      renderStatus(data);

      // 진행 중인 작업 존재 여부에 따른 조건부 폴링 제어 (스마트 절전)
      const tasks = data.tasks || [];
      const hasActive = tasks.some(t => t.status === 'active' || t.status === 'waiting');

      if (hasActive) {
        // 실제 다운로드 진행 중: 1.5초 고속 갱신
        scheduleNextPoll(1500);
      } else {
        // 유휴 상태 / 다운로드 완료: 폴링 타이머 완전 해제 (모바일 데이터 0 소모)
        if (pollingTimer) {
          clearTimeout(pollingTimer);
          pollingTimer = null;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      scheduleNextPoll(2500);
    } finally {
      isFetchingStatus = false;
    }
  }

  function renderStatus(data) {
    const tasks = (data.tasks || []).filter(t => {
      if (!t || !t.gid) return false;
      if (deletedGids.has(t.gid)) return false;
      if (t.status === 'removed') return false;
      if (t.name && t.name.startsWith('[METADATA]')) return false;
      return true;
    });
    const hasOptimistic = !!torrentList.querySelector('.optimistic-card');

    // 카드 목록 갱신
    if (tasks.length === 0) {
      if (!hasOptimistic) {
        if (emptyState) emptyState.style.display = 'block';
        const cards = torrentList.querySelectorAll('.torrent-card:not(.optimistic-card)');
        cards.forEach(c => c.remove());
        tasksMap.clear();
        tasksDataMap.clear();
        if (activeModalGid) closeDetailModal();
      } else {
        if (emptyState) emptyState.style.display = 'none';
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const incomingGids = new Set(tasks.map(t => t.gid));

    // 없어진 카드 제거 (서버 백그라운드 작업 완료 시 부드러운 소멸)
    for (const [gid, cardEl] of tasksMap.entries()) {
      if (!incomingGids.has(gid)) {
        cardEl.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
        cardEl.style.opacity = '0';
        cardEl.style.transform = 'scale(0.96)';
        setTimeout(() => {
          cardEl.remove();
          tasksMap.delete(gid);
          tasksDataMap.delete(gid);
          actionStatusMap.delete(gid);
          if (tasksMap.size === 0 && emptyState) {
            emptyState.style.display = 'block';
          }
        }, 220);
      }
    }

    // 카드 생성 또는 갱신
    tasks.forEach(task => {
      if (task.status === 'removed') {
        const existing = tasksMap.get(task.gid);
        if (existing) {
          existing.remove();
          tasksMap.delete(task.gid);
          tasksDataMap.delete(task.gid);
        }
        return;
      }
      tasksDataMap.set(task.gid, task);

      let cardEl = tasksMap.get(task.gid);
      if (!cardEl) {
        cardEl = createCardElement(task);
        torrentList.appendChild(cardEl);
        tasksMap.set(task.gid, cardEl);
      }
      updateCardElement(cardEl, task);
    });

    // 상세 모달이 열려 있다면 내용 실시간 동기화
    if (activeModalGid) {
      if (tasksDataMap.has(activeModalGid)) {
        updateModalContent(activeModalGid);
      } else {
        closeDetailModal();
      }
    }
  }

  /* ── 3. 상태 통합 카드 렌더링 ─────────────────────────────────────── */
  function getStatusMeta(status, gid) {
    if (gid && actionStatusMap.has(gid)) {
      const act = actionStatusMap.get(gid);
      if (act === 'cancelling') {
        return { iconSvg: SPINNER_SVG, label: '취소중', cls: 'waiting' };
      }
      if (act === 'deleting') {
        return { iconSvg: SPINNER_SVG, label: '삭제중', cls: 'waiting' };
      }
      if (act === 'downloading') {
        return { iconSvg: SPINNER_SVG, label: '전송중', cls: 'active' };
      }
    }
    switch (status) {
      case 'cancelling':
        return { iconSvg: SPINNER_SVG, label: '취소중', cls: 'waiting' };
      case 'deleting':
        return { iconSvg: SPINNER_SVG, label: '삭제중', cls: 'waiting' };
      case 'active':
        return {
          iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="m6 10 6 6 6-6"/></svg>`,
          label: '받는중',
          cls: 'active'
        };
      case 'complete':
        return {
          iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
          label: '완료',
          cls: 'complete'
        };
      case 'waiting':
        return {
          iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
          label: '대기',
          cls: 'waiting'
        };
      case 'paused':
        return {
          iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
          label: '정지',
          cls: 'paused'
        };
      case 'error':
        return {
          iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
          label: '오류',
          cls: 'error'
        };
      default:
        return {
          iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>`,
          label: status || '준비',
          cls: 'waiting'
        };
    }
  }

  function buildMetaHtml(task) {
    const parts = [];
    parts.push(`<strong class="meta-progress-text">${task.progress}%</strong>`);
    parts.push(`<span>${task.completed_length_str} / ${task.total_length_str}</span>`);
    if (task.status === 'active' && task.download_speed_str) {
      parts.push(`<span class="meta-tag speed-down">${task.download_speed_str}</span>`);
    }
    if (task.status === 'active' && task.num_peers !== undefined) {
      parts.push(`<span>피어 ${task.num_peers}</span>`);
    }
    if (task.status === 'active' && task.eta_seconds > 0) {
      parts.push(`<span class="meta-tag eta">${formatEta(task.eta_seconds)}</span>`);
    }
    return parts.join(' · ');
  }

  function createCardElement(task) {
    const card = document.createElement('div');
    card.className = 'torrent-card';
    card.setAttribute('data-gid', task.gid);

    const st = getStatusMeta(task.status, task.gid);

    card.innerHTML = `
      <div class="card-status-box ${st.cls}" title="클릭하여 상세 정보 보기">
        <span class="status-box-icon">${st.iconSvg}</span>
        <span class="status-box-label">${st.label}</span>
      </div>

      <div class="card-body" title="클릭하여 상세 정보 보기">
        <div class="card-header-line">
          <span class="card-filename" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
        </div>

        <div class="progress-track">
          <div class="progress-bar ${task.status}" style="width: ${task.progress}%"></div>
        </div>

        <div class="card-meta-line">
          <div class="meta-tags">
            ${buildMetaHtml(task)}
          </div>
        </div>
      </div>

      <div class="card-actions">
        <!-- 버튼 동적 주입 -->
      </div>
    `;

    // 카드 본문 및 좌측 상태 클릭 시 상세 정보 모달 팝업 열기
    const openModal = () => openDetailModal(task.gid);
    const statusBox = card.querySelector('.card-status-box');
    const cardBody = card.querySelector('.card-body');
    if (statusBox) statusBox.onclick = openModal;
    if (cardBody) cardBody.onclick = openModal;

    return card;
  }

  function updateCardElement(card, task) {
    // 1. 좌측 현재 상태 통합 뱃지 갱신
    const st = getStatusMeta(task.status, task.gid);
    const statusBox = card.querySelector('.card-status-box');
    if (statusBox) {
      statusBox.className = `card-status-box ${st.cls}`;
      const iconEl = statusBox.querySelector('.status-box-icon');
      const labelEl = statusBox.querySelector('.status-box-label');
      if (iconEl && iconEl.innerHTML !== st.iconSvg) iconEl.innerHTML = st.iconSvg;
      if (labelEl && labelEl.textContent !== st.label) labelEl.textContent = st.label;
    }

    // 2. 파일명
    const filenameEl = card.querySelector('.card-filename');
    if (filenameEl && task.name && filenameEl.textContent !== task.name) {
      filenameEl.textContent = task.name;
      filenameEl.title = task.name;
    }

    // 3. 프로그레스 바
    const bar = card.querySelector('.progress-bar');
    if (bar) {
      bar.className = `progress-bar ${task.status}`;
      bar.style.width = `${task.progress}%`;
    }

    // 4. 메타데이터 (유튜브 톤앤매너의 깔끔한 텍스트 구분)
    const metaTags = card.querySelector('.meta-tags');
    if (metaTags) {
      metaTags.innerHTML = buildMetaHtml(task);
    }

    // 5. 액션 버튼 영역 (취소/취소중, 삭제/삭제중 명확한 구분 및 비활성화)
    const actions = card.querySelector('.card-actions');
    if (actions) {
      const isDir = task.is_directory || (task.file_count && task.file_count > 1);
      const actionType = actionStatusMap.get(task.gid);
      const isDownloading = actionType === 'downloading' || downloadingGids.has(task.gid);
      const isCancelling = (actionType === 'cancelling') || (task.status === 'cancelling');
      const isDeleting = (actionType === 'deleting') || (task.status === 'deleting');
      const isBusy = isDownloading || isCancelling || isDeleting;

      // 카드 전체 흐림 효과 (처리 중일 때 비활성화 상태임을 직관적으로 전달)
      card.style.opacity = (isCancelling || isDeleting) ? '0.65' : '';

      if (task.status === 'complete' || isDeleting) {
        if (isDeleting) {
          actions.innerHTML = `
            <button class="btn-download-now" disabled style="opacity: 0.35; pointer-events: none; cursor: not-allowed;">
              <span>${isDir ? '폴더 ZIP' : '내려받기'}</span>
            </button>
            <button class="btn-delete-card" disabled style="opacity: 0.8; pointer-events: none; cursor: not-allowed;">
              <span style="display:inline-flex; align-items:center; gap:4px;">${SPINNER_SVG}삭제중...</span>
            </button>
          `;
        } else if (isDownloading) {
          actions.innerHTML = `
            <button class="btn-download-now" disabled style="opacity: 0.8; pointer-events: none; cursor: not-allowed;">
              <span style="display:inline-flex; align-items:center; gap:4px;">${SPINNER_SVG}내려받는 중...</span>
            </button>
            <button class="btn-delete-card" disabled style="opacity: 0.35; pointer-events: none; cursor: not-allowed;">
              <span>삭제</span>
            </button>
          `;
        } else {
          actions.innerHTML = `
            <button class="btn-download-now" data-gid="${task.gid}">
              <span>${isDir ? '폴더 ZIP' : '내려받기'}</span>
            </button>
            <button class="btn-delete-card" data-gid="${task.gid}" title="완료 목록 및 서버 원본 파일 즉시 삭제">
              <span>삭제</span>
            </button>
          `;
        }
      } else {
        if (isCancelling) {
          actions.innerHTML = `
            <button class="btn-cancel-card" disabled style="opacity: 0.8; pointer-events: none; cursor: not-allowed;">
              <span style="display:inline-flex; align-items:center; gap:4px;">${SPINNER_SVG}취소중...</span>
            </button>
          `;
        } else {
          actions.innerHTML = `
            <button class="btn-cancel-card" data-gid="${task.gid}">
              <span>취소</span>
            </button>
          `;
        }
      }

      // 이벤트 바인딩 (유휴 상태일 때만)
      if (!isBusy) {
        const dlBtn = actions.querySelector('.btn-download-now');
        if (dlBtn) {
          dlBtn.onclick = (e) => {
            e.stopPropagation();
            triggerDownload(task.gid, task.name);
          };
        }
        const delBtn = actions.querySelector('.btn-delete-card');
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            removeCompletedTask(task.gid, task.name);
          };
        }
        const cancelBtn = actions.querySelector('.btn-cancel-card');
        if (cancelBtn) {
          cancelBtn.onclick = (e) => {
            e.stopPropagation();
            cancelActiveTask(task.gid, task.name);
          };
        }
      }
    }
  }

  // ── 이중 동작 방지 및 상태 잠금 ──
  function lockCardActions(gid, actionType) {
    actionStatusMap.set(gid, actionType);
    const card = tasksMap.get(gid);
    const task = tasksDataMap.get(gid);
    if (card && task) {
      updateCardElement(card, task);
    }
    if (activeModalGid === gid) {
      updateModalContent(gid);
    }
  }

  function unlockCardActions(gid) {
    actionStatusMap.delete(gid);
    downloadingGids.delete(gid);
    const card = tasksMap.get(gid);
    const task = tasksDataMap.get(gid);
    if (card && task) {
      updateCardElement(card, task);
    }
    if (activeModalGid === gid) {
      updateModalContent(gid);
    }
  }

  /* ── 4. 브라우저 다운로드 & 파일/작업 영구 삭제 ──────────────────── */
  function triggerDownload(gid, name) {
    if (downloadingGids.has(gid) || actionStatusMap.has(gid)) return; // 이중 다운로드 완벽 차단

    downloadingGids.add(gid);
    lockCardActions(gid, 'downloading');

    const base = getEffectiveApiBase();
    const downloadUrl = `${base}/api/torrent/download/${gid}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 다운로드 시작 후 빠른 확인을 위해 폴링 가속
    scheduleNextPoll(2000);

    // 안전 가드: 혹시 10분 이상 비정상 지연될 경우에만 예외적으로 잠금 해제
    setTimeout(() => {
      if (downloadingGids.has(gid)) {
        downloadingGids.delete(gid);
        unlockCardActions(gid);
      }
    }, 600000);
  }

  async function removeCompletedTask(gid, name) {
    if (actionStatusMap.has(gid)) return; // 이미 처리 중이면 차단

    if (!confirm(`'${name || gid}' 완료된 항목을 목록에서 지우고,\n서버에 저장된 원본 파일도 완전히 삭제하시겠습니까?`)) {
      return;
    }

    lockCardActions(gid, 'deleting');
    executeDelete(gid, 'deleting');
  }

  async function cancelActiveTask(gid, name) {
    if (actionStatusMap.has(gid)) return; // 이미 처리 중이면 차단

    if (!confirm(`'${name || gid}' 다운로드 작업을 취소하고\n임시 다운로드 파일을 삭제하시겠습니까?`)) {
      return;
    }

    lockCardActions(gid, 'cancelling');
    executeDelete(gid, 'cancelling');
  }

  async function executeDelete(gid, actionType) {
    try {
      if (activeModalGid === gid) {
        closeDetailModal();
      }

      // 서버에 취소/삭제 비동기 처리 요청 (서버에서 0ms만에 'cancelling' / 'deleting' 상태 등록 및 백그라운드 스레드 기동)
      const base = getEffectiveApiBase();
      const resp = await fetch(`${base}/api/torrent/cancel/${gid}`, {
        method: 'POST'
      });
      if (!resp.ok) {
        throw new Error('요청 처리에 실패했습니다.');
      }

      // 서버의 상태 오버라이드를 화면에 즉시 동기화하기 위해 빠른 폴링 예약
      scheduleNextPoll(300);
    } catch (err) {
      unlockCardActions(gid);
      alert(`${actionType === 'cancelling' ? '취소' : '삭제'} 요청 실패: ${err.message}`);
    }
  }

  /* ── 5. 토렌트 상세 정보 모달 제어 (YouTube 1:1 스타일) ───────────── */
  function openDetailModal(gid) {
    activeModalGid = gid;
    updateModalContent(gid);
    if (torrentModal) {
      torrentModal.classList.add('open');
      torrentModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeDetailModal() {
    activeModalGid = null;
    if (torrentModal) {
      torrentModal.classList.remove('open');
      torrentModal.setAttribute('aria-hidden', 'true');
    }
  }

  function updateModalContent(gid) {
    const task = tasksDataMap.get(gid);
    if (!task) return;

    if (modalTaskName) modalTaskName.textContent = task.name || '상세 정보';
    if (modalStatusPill) {
      modalStatusPill.className = `modal-status-pill ${task.status}`;
      modalStatusPill.textContent = formatStatusName(task.status);
    }
    if (modalProgressText) modalProgressText.textContent = `${task.progress}%`;
    if (modalProgressBar) {
      modalProgressBar.className = `progress-bar ${task.status}`;
      modalProgressBar.style.width = `${task.progress}%`;
    }

    if (modalStatSize) modalStatSize.textContent = `${task.completed_length_str} / ${task.total_length_str}`;
    if (modalStatSpeed) {
      modalStatSpeed.textContent = task.download_speed_str ? `↓ ${task.download_speed_str}` : '-';
    }
    if (modalStatPeers) {
      modalStatPeers.textContent = `${task.num_peers}명 (시더 ${task.num_seeders || 0})`;
    }
    if (modalStatEta) {
      modalStatEta.textContent = task.eta_seconds > 0 ? formatEta(task.eta_seconds) : (task.status === 'complete' ? '완료' : '-');
    }

    // 포함된 파일 목록 렌더링 (최소 1개 이상 정확한 카운팅 보장)
    const files = (task.files_detail && task.files_detail.length > 0)
      ? task.files_detail
      : [{ name: task.name, length_str: task.total_length_str, progress: task.progress }];

    if (modalFilesCount) modalFilesCount.textContent = files.length;
    if (modalFilesList) {
      modalFilesList.innerHTML = files.map(f => `
        <div class="modal-file-item">
          <div class="file-name-wrap" title="${escapeHtml(f.name)}">
            <span class="file-name-text">${escapeHtml(f.name)}</span>
          </div>
          <div class="file-meta-wrap">
            <span>${f.length_str}</span>
            <span class="file-prog-badge ${f.progress >= 100 ? 'complete' : ''}">${f.progress}%</span>
          </div>
        </div>
      `).join('');
    }

    // 하단 액션 버튼 주입 (취소/취소중, 삭제/삭제중 명확한 구분)
    if (modalFooterActions) {
      const isDir = task.is_directory || (task.file_count && task.file_count > 1);
      const actionType = actionStatusMap.get(task.gid);
      const isDownloading = actionType === 'downloading' || downloadingGids.has(task.gid);
      const isCancelling = (actionType === 'cancelling') || (task.status === 'cancelling');
      const isDeleting = (actionType === 'deleting') || (task.status === 'deleting');
      const isBusy = isDownloading || isCancelling || isDeleting;

      if (task.status === 'complete' || isDeleting) {
        if (isDeleting) {
          modalFooterActions.innerHTML = `
            <button class="btn-delete-card" disabled style="opacity: 0.8; pointer-events: none; cursor: not-allowed;">
              <span style="display:inline-flex; align-items:center; gap:4px;">${SPINNER_SVG}삭제중...</span>
            </button>
            <button class="btn-download-now" disabled style="opacity: 0.35; pointer-events: none; cursor: not-allowed;">
              <span>${isDir ? '폴더 ZIP' : '내려받기'}</span>
            </button>
          `;
        } else if (isDownloading) {
          modalFooterActions.innerHTML = `
            <button class="btn-delete-card" disabled style="opacity: 0.35; pointer-events: none; cursor: not-allowed;">
              <span>삭제</span>
            </button>
            <button class="btn-download-now" disabled style="opacity: 0.8; pointer-events: none; cursor: not-allowed;">
              <span style="display:inline-flex; align-items:center; gap:4px;">${SPINNER_SVG}내려받는 중...</span>
            </button>
          `;
        } else {
          modalFooterActions.innerHTML = `
            <button class="btn-delete-card" data-gid="${task.gid}">
              <span>삭제</span>
            </button>
            <button class="btn-download-now" data-gid="${task.gid}">
              <span>${isDir ? '폴더 ZIP' : '내려받기'}</span>
            </button>
          `;
        }
      } else {
        if (isCancelling) {
          modalFooterActions.innerHTML = `
            <button class="btn-cancel-card" disabled style="opacity: 0.8; pointer-events: none; cursor: not-allowed;">
              <span style="display:inline-flex; align-items:center; gap:4px;">${SPINNER_SVG}취소중...</span>
            </button>
          `;
        } else {
          modalFooterActions.innerHTML = `
            <button class="btn-cancel-card" data-gid="${task.gid}">
              <span>취소</span>
            </button>
          `;
        }
      }

      // 이벤트 바인딩 (유휴 상태일 때만)
      if (!isBusy) {
        const dlBtn = modalFooterActions.querySelector('.btn-download-now');
        if (dlBtn) dlBtn.onclick = () => { triggerDownload(task.gid, task.name); };
        const delBtn = modalFooterActions.querySelector('.btn-delete-card');
        if (delBtn) delBtn.onclick = () => { removeCompletedTask(task.gid, task.name); };
        const cancelBtn = modalFooterActions.querySelector('.btn-cancel-card');
        if (cancelBtn) cancelBtn.onclick = () => { cancelActiveTask(task.gid, task.name); };
      }
    }
  }

  // 모달 닫기 이벤트 등록
  if (torrentModalClose) torrentModalClose.onclick = closeDetailModal;
  if (torrentModal) {
    torrentModal.addEventListener('click', (e) => {
      if (e.target === torrentModal) closeDetailModal();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModalGid) closeDetailModal();
  });

  /* ── 6. 유틸리티 함수 ────────────────────────────────────────────── */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatStatusName(status) {
    switch (status) {
      case 'active': return '다운로드 중';
      case 'waiting': return '대기 중';
      case 'complete': return '완료됨';
      case 'error': return '오류 발생';
      case 'paused': return '일시 중지';
      case 'removed': return '취소/삭제됨';
      default: return status || '준비';
    }
  }

  function formatEta(seconds) {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${seconds}초`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}분 ${s}초`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}시간 ${remM}분`;
  }

  /* ── 6. 스마트 라이프사이클 (모바일 데이터 절약) ─────────────────────── */
  // 1. 페이지 로드 시 즉시 1회 실행
  fetchStatus();

  // 2. 화면 가시성 제어: 화면 꺼짐/백그라운드 전환 시 타이머 강제 해제, 복귀 시 즉시 1회 최신화
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
      }
    } else {
      fetchStatus();
    }
  });

  // 3. 페이지 이탈 시 타이머 메모리 해제
  window.addEventListener('beforeunload', () => {
    if (pollingTimer) clearTimeout(pollingTimer);
  });

})();
