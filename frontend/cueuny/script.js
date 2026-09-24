/**
 * GUMA™ 큐스코 큐니(CUEUNY) 리플레이 UI 스크립트
 * - 리플레이 영상 10건씩 최신순 페이징 및 유튜브 스타일 무한 스크롤(Scroll-down)
 * - 스토리지 파일 기반 자립형 메타데이터 렌더링 및 비디오 재생
 */

(function () {
  'use strict';

  // API 기본 주소 해석 및 동적 터널 감지 (GitHub Pages 등 외부 연동 지원)
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
      if (base) {
        API_BASE = base.replace(/\/$/, '');
        if (cachedMasterReplays.length === 0) {
          loadStatus();
          loadMoreReplays(true);
        }
      }
    }).catch(e => console.warn('[CUEUNY] 터널 주소 자동 감지 대기:', e));
  }

  // DOM 요소 참조
  const sessionAlertBanner = document.getElementById('sessionAlertBanner');
  const sessionAlertTitle = document.getElementById('sessionAlertTitle');
  const sessionAlertDesc = document.getElementById('sessionAlertDesc');

  const btnSync = document.getElementById('btnSync');
  const replayGrid = document.getElementById('replayGrid');
  const replayLoader = document.getElementById('replayLoader');
  const replayLoaderText = document.getElementById('replayLoaderText');

  // 모달 요소
  const videoModal = document.getElementById('videoModal');
  const btnModalClose = document.getElementById('btnModalClose');
  const cueunyVideoPlayer = document.getElementById('cueunyVideoPlayer');
  const modalClubName = document.getElementById('modalClubName');
  const modalMatchMeta = document.getElementById('modalMatchMeta');
  const modalInningBadge = document.getElementById('modalInningBadge');
  const modalScoreboard = document.getElementById('modalScoreboard');

  // 상세 필터 모달 요소
  const btnOpenFilter = document.getElementById('btnOpenFilter');
  const headerFilterBadge = document.getElementById('headerFilterBadge');
  const filterModal = document.getElementById('filterModal');
  const btnFilterModalClose = document.getElementById('btnFilterModalClose');
  const btnModalFilterReset = document.getElementById('btnModalFilterReset');
  const btnModalFilterCancel = document.getElementById('btnModalFilterCancel');
  const btnModalFilterApply = document.getElementById('btnModalFilterApply');

  // 다차원 검색/필터 폼 요소
  const filterSearchInput = document.getElementById('filterSearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const filterYearSelect = document.getElementById('filterYearSelect');
  const filterMonthSelect = document.getElementById('filterMonthSelect');
  const filterResultSelect = document.getElementById('filterResultSelect');

  const inputMinAvg = document.getElementById('inputMinAvg');
  const inputMaxAvg = document.getElementById('inputMaxAvg');
  const inputMinHr = document.getElementById('inputMinHr');
  const inputMinDuration = document.getElementById('inputMinDuration');
  const inputMaxDuration = document.getElementById('inputMaxDuration');
  const inputMinInnings = document.getElementById('inputMinInnings');
  const inputMaxInnings = document.getElementById('inputMaxInnings');

  // 활성 필터 요약 바 요소
  const filterSummaryBar = document.getElementById('filterSummaryBar');
  const filterTotalCount = document.getElementById('filterTotalCount');
  const filterTagContainer = document.getElementById('filterTagContainer');
  const btnResetSummary = document.getElementById('btnResetSummary');

  // 페이징 및 상태 관리 변수 (10건씩 로드)
  const PAGE_LIMIT = 10;
  let offset = 0;
  let isLoading = false;
  let hasMore = true;
  let currentReplays = [];
  const renderedSeqs = new Set();
  let searchDebounceTimer = null;
  let hasPopulatedYears = false;
  let cachedMasterReplays = []; // 마스터 인덱스 클라이언트 캐시 (즉각 반응성 보장)

  // 다차원 필터 상태 객체
  const filterState = {
    q: '',
    year: 'all',
    month: 'all',
    result: 'all',
    min_avg: null,
    max_avg: null,
    min_hr: null,
    min_duration: null,
    max_duration: null,
    min_innings: null,
    max_innings: null
  };

  // ── 클라이언트 사이드 즉각 필터링 검증 ────────────────────────────────────
  function hasActiveFilters(state) {
    return Boolean(
      (state.q && state.q.trim()) ||
      (state.year && state.year !== 'all') ||
      (state.month && state.month !== 'all') ||
      (state.result && state.result !== 'all') ||
      state.min_avg !== null ||
      state.max_avg !== null ||
      state.min_hr !== null ||
      state.min_duration !== null ||
      state.max_duration !== null ||
      state.min_innings !== null ||
      state.max_innings !== null
    );
  }

  function matchesFilter(item, state) {
    if (!item) return false;
    const pa = item.player_a || {};
    const pb = item.player_b || {};

    // 1. 통합 검색어 (상대 선수명, 구장명, 날짜 등)
    if (state.q && state.q.trim()) {
      const term = state.q.trim().toLowerCase();
      const club = String(item.club_name || '').toLowerCase();
      const nameB = String(pb.name || '').toLowerCase();
      const nameA = String(pa.name || '').toLowerCase();
      const date = String(item.match_date || '').toLowerCase();
      if (!club.includes(term) && !nameB.includes(term) && !nameA.includes(term) && !date.includes(term)) {
        return false;
      }
    }

    // 2. 연도 필터
    if (state.year && state.year !== 'all') {
      const y = String(item.match_date || '').slice(0, 4);
      if (y !== String(state.year)) return false;
    }

    // 3. 월 필터
    if (state.month && state.month !== 'all') {
      const m = String(item.match_date || '').slice(5, 7);
      const targetM = String(state.month).padStart(2, '0');
      if (m !== targetM) return false;
    }

    // 4. 결과 필터 (win, lose)
    if (state.result && state.result !== 'all') {
      const isWin = Boolean(pa.is_winner);
      if (state.result === 'win' && !isWin) return false;
      if (state.result === 'lose' && isWin) return false;
    }

    // 5. 에버리지
    const paAvg = parseFloat(pa.avg) || 0;
    if (state.min_avg !== null && !isNaN(state.min_avg) && paAvg < state.min_avg) return false;
    if (state.max_avg !== null && !isNaN(state.max_avg) && paAvg > state.max_avg) return false;

    // 6. 하이런
    const paHr = parseInt(pa.hr, 10) || 0;
    if (state.min_hr !== null && !isNaN(state.min_hr) && paHr < state.min_hr) return false;

    // 7. 경기 시간
    const durMatch = String(item.duration || '').match(/\d+/);
    const durMin = durMatch ? parseInt(durMatch[0], 10) : 0;
    if (state.min_duration !== null && !isNaN(state.min_duration) && durMin < state.min_duration) return false;
    if (state.max_duration !== null && !isNaN(state.max_duration) && durMin > state.max_duration) return false;

    // 8. 이닝
    const inn = parseInt(item.innings, 10) || 0;
    if (state.min_innings !== null && !isNaN(state.min_innings) && inn < state.min_innings) return false;
    if (state.max_innings !== null && !isNaN(state.max_innings) && inn > state.max_innings) return false;

    return true;
  }


  // ── 포맷팅 유틸 ──────────────────────────────────────────────────────────
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanPlayerName(p, fallback) {
    if (!p) return fallback;
    let name = String(p.name || fallback).trim();
    const target = String(p.target_score || '').trim();
    if (target && name.endsWith(`(${target})`)) {
      name = name.slice(0, -(`(${target})`.length)).trim();
    }
    name = name.replace(/\s*\(\d+\)$/, '').trim();
    return name || fallback;
  }

  function getDownloadFilename(item) {
    if (!item) return 'cueuny_replay.mp4';
    const dateDigits = (item.match_date || '').replace(/\D/g, '');
    let dateStr = '';
    if (dateDigits.length >= 12) {
      dateStr = `[${dateDigits.slice(0, 8)}_${dateDigits.slice(8, 12)}] `;
    } else if (dateDigits.length >= 8) {
      dateStr = `[${dateDigits.slice(0, 8)}] `;
    }
    const club = (item.club_name || '당구장').trim();

    function cleanPlayerLabel(p, fallback) {
      let name = (p.name || fallback).trim();
      const target = String(p.target_score || '').trim();
      const score = String(p.score || '').trim();
      if (target && name.endsWith(`(${target})`)) {
        name = name.slice(0, -(`(${target})`.length)).trim();
      }
      return score ? `${name}(${score})` : name;
    }


    const pa = item.player_a || {};
    const pb = item.player_b || {};
    const labelA = cleanPlayerLabel(pa, '물주');
    const labelB = cleanPlayerLabel(pb, '상대선수');

    const safeTitle = `${dateStr}${club} - ${labelA} vs ${labelB}`
      .replace(/[\\/*?:"<>|]/g, '_');
    return `${safeTitle}.mp4`;
  }


  // ── 상태 및 대시보드 로드 ───────────────────────────────────────────────
  async function loadStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/cueuny/status`);
      if (!res.ok) return;
      const data = await res.json();

      // 세션 상태 배너 제어
      if (sessionAlertBanner) {
        if (data.is_configured === false) {
          sessionAlertBanner.style.display = 'flex';
          sessionAlertTitle.textContent = '큐니 인증 정보 미설정';
          sessionAlertDesc.textContent = '.env 파일에 CUEUNY_SESSION 및 CUEUNY_LOGIN_ID를 입력해 주세요.';
        } else if (data.session_valid === false) {
          sessionAlertBanner.style.display = 'flex';
          sessionAlertTitle.textContent = '큐스코 큐니 세션 만료됨';
          sessionAlertDesc.textContent = data.last_error || '큐니 세션이 만료되었습니다. 새 CUEUNY_SESSION 쿠키를 .env에 등록해주세요.';
        } else {
          sessionAlertBanner.style.display = 'none';
        }
      }

      return data;
    } catch (err) {
      console.warn('[CUEUNY] 상태 조회 실패:', err);
    }
  }

  // ── 필터 쿼리 스트링 빌더 ────────────────────────────────────────────────
  function buildFilterQueryString() {
    const params = new URLSearchParams();
    if (filterState.q && filterState.q.trim()) params.append('q', filterState.q.trim());
    if (filterState.year && filterState.year !== 'all') params.append('year', filterState.year);
    if (filterState.month && filterState.month !== 'all') params.append('month', filterState.month);
    if (filterState.result && filterState.result !== 'all') params.append('result', filterState.result);
    if (filterState.min_avg !== null && !isNaN(filterState.min_avg)) params.append('min_avg', filterState.min_avg);
    if (filterState.max_avg !== null && !isNaN(filterState.max_avg)) params.append('max_avg', filterState.max_avg);
    if (filterState.min_hr !== null && !isNaN(filterState.min_hr)) params.append('min_hr', filterState.min_hr);
    if (filterState.min_duration !== null && !isNaN(filterState.min_duration)) params.append('min_duration', filterState.min_duration);
    if (filterState.max_duration !== null && !isNaN(filterState.max_duration)) params.append('max_duration', filterState.max_duration);
    if (filterState.min_innings !== null && !isNaN(filterState.min_innings)) params.append('min_innings', filterState.min_innings);
    if (filterState.max_innings !== null && !isNaN(filterState.max_innings)) params.append('max_innings', filterState.max_innings);
    return params.toString();
  }

  // ── 필터 연도 옵션 동적 채우기 ───────────────────────────────────────────
  function populateYearOptions(years) {
    if (!filterYearSelect || !Array.isArray(years) || years.length === 0) return;
    const currentVal = filterYearSelect.value;
    filterYearSelect.innerHTML = '<option value="all">전체 연도</option>';
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y}년`;
      if (y === currentVal) opt.selected = true;
      filterYearSelect.appendChild(opt);
    });
    hasPopulatedYears = true;
  }

  // ── 활성 필터 요약 바 및 태그 칩 렌더링 ──────────────────────────────────
  function updateActiveFilterUI(totalCount) {
    if (!filterSummaryBar || !filterTagContainer) return;

    let activeFilterCount = 0;
    let advancedCount = 0;
    const tags = [];

    // 검색어
    if (filterState.q) {
      activeFilterCount++;
      tags.push({ key: 'q', label: `검색: "${filterState.q}"` });
    }
    // 연도
    if (filterState.year !== 'all') {
      activeFilterCount++;
      tags.push({ key: 'year', label: `${filterState.year}년` });
    }
    // 월
    if (filterState.month !== 'all') {
      activeFilterCount++;
      tags.push({ key: 'month', label: `${filterState.month}월` });
    }
    // 결과
    if (filterState.result !== 'all') {
      activeFilterCount++;
      tags.push({ key: 'result', label: filterState.result === 'win' ? '승리만' : '패배만' });
    }
    // 에버리지
    if (filterState.min_avg !== null || filterState.max_avg !== null) {
      activeFilterCount++;
      advancedCount++;
      const minStr = filterState.min_avg !== null ? `${filterState.min_avg}` : '0';
      const maxStr = filterState.max_avg !== null ? `${filterState.max_avg}` : '최대';
      tags.push({ key: 'avg', label: `에버 ${minStr}~${maxStr}` });
    }
    // 하이런
    if (filterState.min_hr !== null) {
      activeFilterCount++;
      advancedCount++;
      tags.push({ key: 'min_hr', label: `HR ${filterState.min_hr}점+` });
    }
    // 경기 시간
    if (filterState.min_duration !== null || filterState.max_duration !== null) {
      activeFilterCount++;
      advancedCount++;
      const minD = filterState.min_duration !== null ? `${filterState.min_duration}` : '0';
      const maxD = filterState.max_duration !== null ? `${filterState.max_duration}` : '∞';
      tags.push({ key: 'duration', label: `시간 ${minD}~${maxD}분` });
    }
    // 이닝 수
    if (filterState.min_innings !== null || filterState.max_innings !== null) {
      activeFilterCount++;
      advancedCount++;
      const minI = filterState.min_innings !== null ? `${filterState.min_innings}` : '0';
      const maxI = filterState.max_innings !== null ? `${filterState.max_innings}` : '∞';
      tags.push({ key: 'innings', label: `이닝 ${minI}~${maxI}INN` });
    }

    // 헤더 상세필터 버튼 뱃지 및 활성 스타일
    if (headerFilterBadge) {
      if (activeFilterCount > 0) {
        headerFilterBadge.textContent = String(activeFilterCount);
        headerFilterBadge.style.display = 'inline-flex';
        if (btnOpenFilter) btnOpenFilter.classList.add('active');
      } else {
        headerFilterBadge.style.display = 'none';
        if (btnOpenFilter) btnOpenFilter.classList.remove('active');
      }
    }

    // 요약 바 제어
    if (activeFilterCount > 0) {
      filterSummaryBar.style.display = 'flex';
      if (filterTotalCount) filterTotalCount.textContent = totalCount !== undefined ? totalCount : currentReplays.length;

      filterTagContainer.innerHTML = '';
      tags.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'filter-tag-chip';
        chip.innerHTML = `${escapeHtml(t.label)} <span class="filter-tag-remove" data-key="${t.key}" aria-label="필터 해제">&times;</span>`;
        filterTagContainer.appendChild(chip);
      });
    } else {
      filterSummaryBar.style.display = 'none';
      filterTagContainer.innerHTML = '';
    }
  }

  // ── 10건씩 페이징 로드 (스마트 캐시 & 실시간 다차원 필터링) ───────────
  async function loadMoreReplays(reset = false, refresh = false) {
    if (isLoading) return;
    if (!hasMore && !reset) return;

    if (reset) {
      offset = 0;
      hasMore = true;
      currentReplays = [];
      renderedSeqs.clear();
      replayGrid.innerHTML = '';
    }

    isLoading = true;

    // 로더 UI 활성화
    if (replayLoader) {
      replayLoader.style.display = 'flex';
      const spinner = replayLoader.querySelector('.replay-loader-spinner');
      if (spinner) spinner.style.display = 'block';
      if (replayLoaderText) replayLoaderText.textContent = '영상을 불러오는 중...';
    }

    try {
      // 1. 전체 마스터 인덱스 캐시 확보 (최초 1회 또는 새로고침 요청 시)
      if (cachedMasterReplays.length === 0 || refresh) {
        const refreshParam = refresh ? '&refresh=true' : '';
        const fetchAllUrl = `${API_BASE}/api/cueuny/list?limit=1000&offset=0${refreshParam}`;
        const resAll = await fetch(fetchAllUrl);
        if (resAll.ok) {
          const allData = await resAll.json();
          if (Array.isArray(allData.items)) {
            cachedMasterReplays = allData.items;
          }
          if (!hasPopulatedYears && Array.isArray(allData.available_years) && allData.available_years.length > 0) {
            populateYearOptions(allData.available_years);
          }
        }
      }

      // 2. 클라이언트 사이드 즉각 필터링 수행
      const isFiltered = hasActiveFilters(filterState);
      let targetList = isFiltered
        ? cachedMasterReplays.filter(it => matchesFilter(it, filterState))
        : cachedMasterReplays;

      const totalMatched = targetList.length;
      const pagedItems = targetList.slice(offset, offset + PAGE_LIMIT);

      hasMore = (offset + PAGE_LIMIT) < totalMatched;
      offset += pagedItems.length;

      // 3. 카드 렌더링
      if (pagedItems.length > 0 || currentReplays.length > 0) {
        appendReplayCards(pagedItems);
      } else {
        // 검색 결과 0건
        if (isFiltered) {
          replayGrid.innerHTML = `
            <div class="empty-state">
              <p class="empty-text">검색 조건과 일치하는 경기 영상이 없습니다.</p>
              <p class="empty-text" style="font-size:11px; margin-top:4px;">검색어를 확인하거나 필터 조건을 초기화해 보세요.</p>
            </div>
          `;
        } else {
          replayGrid.innerHTML = `
            <div class="empty-state">
              <p class="empty-text">보관된 영상이 없습니다.</p>
              <p class="empty-text" style="font-size:11px; margin-top:4px;">상단의 '영상 수집' 버튼을 눌러 최신 영상을 가져오세요.</p>
            </div>
          `;
        }
      }

      // 4. 필터 요약 UI 업데이트 (실제 필터링된 건수 기준)
      updateActiveFilterUI(totalMatched);

      // 5. 로더 UI 상태 갱신
      if (replayLoader) {
        const spinner = replayLoader.querySelector('.replay-loader-spinner');
        if (!hasMore) {
          if (currentReplays.length >= PAGE_LIMIT) {
            if (spinner) spinner.style.display = 'none';
            if (replayLoaderText) replayLoaderText.textContent = '모든 보관 영상을 불러왔습니다.';
            replayLoader.style.display = 'flex';
          } else {
            replayLoader.style.display = 'none';
          }
        } else {
          replayLoader.style.display = 'flex';
        }
      }
    } catch (err) {
      console.error('[CUEUNY] 목록 로드 오류:', err);
      if (offset === 0) {
        replayGrid.innerHTML = `
          <div class="empty-state">
            <p class="empty-text">리플레이 영상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          </div>
        `;
      }
      if (replayLoader) replayLoader.style.display = 'none';
    } finally {
      isLoading = false;
    }
  }

  // ── 카드 생성 및 추가 (기존 목록 뒤에 append) ───────────────────────────
  function appendReplayCards(items) {
    if ((!items || items.length === 0) && currentReplays.length === 0) {
      if (hasActiveFilters(filterState)) {
        replayGrid.innerHTML = `
          <div class="empty-state">
            <p class="empty-text">검색 조건과 일치하는 경기 영상이 없습니다.</p>
            <p class="empty-text" style="font-size:11px; margin-top:4px;">검색어를 확인하거나 필터 조건을 초기화해 보세요.</p>
          </div>
        `;
      } else {
        replayGrid.innerHTML = `
          <div class="empty-state">
            <p class="empty-text">보관된 영상이 없습니다.</p>
            <p class="empty-text" style="font-size:11px; margin-top:4px;">상단의 '영상 수집' 버튼을 눌러 최신 영상을 가져오세요.</p>
          </div>
        `;
      }
      return;
    }

    items.forEach(item => {
      const seq = item.replay_seq || item.record_folder;
      if (!seq || renderedSeqs.has(seq)) return; // 중복 렌더링 차단

      renderedSeqs.add(seq);
      currentReplays.push(item);

      const pa = item.player_a || {};
      const pb = item.player_b || {};

      const aWon = pa.is_winner || false;
      const bWon = pb.is_winner || false;

      const sizeStr = item.file_size ? formatBytes(item.file_size) : '';
      const statusBadge = sizeStr ? `<span class="storage-status-badge completed">${sizeStr}</span>` : '';
      const friendlyFilename = getDownloadFilename(item);

      const article = document.createElement('article');
      article.className = 'replay-card';
      article.setAttribute('data-seq', seq);

      article.innerHTML = `
        <div>
          <div class="card-header">
            <div class="club-info">
              <span class="club-name">${escapeHtml(item.club_name || '당구장')}</span>
              <div class="match-meta-line">
                <span>${escapeHtml(item.match_date || '')}</span>
                ${item.duration ? `<span>(${escapeHtml(item.duration)})</span>` : ''}
              </div>
            </div>
            ${item.innings ? `
              <div class="inning-badge" title="총 이닝">
                <span>INN</span>${escapeHtml(item.innings)}
              </div>
            ` : ''}
          </div>

          <div class="match-scoreboard">
            <!-- 선수 A (물주 항상 좌측) -->
            <div class="player-box ${aWon ? 'winner' : ''}">
              ${aWon ? '<span class="win-crown">👑</span>' : ''}
              <div class="player-name">${escapeHtml(cleanPlayerName(pa, '물주'))}</div>
              <div class="player-score-row">
                <span class="player-score">${escapeHtml(pa.score || '0')}</span>
                ${pa.target_score ? `<span class="player-target">/${escapeHtml(pa.target_score)}</span>` : ''}
              </div>
              <div class="player-stats">
                ${pa.avg ? `<span class="stat-pill">Avg ${escapeHtml(pa.avg)}</span>` : ''}
                ${pa.hr ? `<span class="stat-pill">HR ${escapeHtml(pa.hr)}</span>` : ''}
              </div>
            </div>

            <div class="vs-divider">VS</div>

            <!-- 선수 B (상대방 항상 우측) -->
            <div class="player-box ${bWon ? 'winner' : ''}">
              ${bWon ? '<span class="win-crown">👑</span>' : ''}
              <div class="player-name">${escapeHtml(cleanPlayerName(pb, '상대선수'))}</div>
              <div class="player-score-row">
                <span class="player-score">${escapeHtml(pb.score || '0')}</span>
                ${pb.target_score ? `<span class="player-target">/${escapeHtml(pb.target_score)}</span>` : ''}
              </div>
              <div class="player-stats">
                ${pb.avg ? `<span class="stat-pill">Avg ${escapeHtml(pb.avg)}</span>` : ''}
                ${pb.hr ? `<span class="stat-pill">HR ${escapeHtml(pb.hr)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="card-footer">
          ${statusBadge}
          <div class="card-actions">
            <button class="btn-card-action primary" type="button" data-play-seq="${seq}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              시청
            </button>
            <a class="btn-card-action" href="${API_BASE}/api/cueuny/file/${seq}" target="_blank" download="${escapeHtml(friendlyFilename)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              저장
            </a>
          </div>
        </div>
      `;

      // 재생 버튼 이벤트 바인딩
      const playBtn = article.querySelector('button[data-play-seq]');
      if (playBtn) {
        playBtn.addEventListener('click', () => {
          openVideoModal(item);
        });
      }

      replayGrid.appendChild(article);
    });
  }

  // ── 스크롤 다운 무한 로딩 감지 (유튜브와 동일) ───────────────────────────
  function initInfiniteScroll() {
    // 1. 윈도우 스크롤 이벤트 감지
    window.addEventListener('scroll', () => {
      if (isLoading || !hasMore) return;
      const scrollY = window.scrollY || window.pageYOffset;
      const viewportHeight = window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight;

      // 하단 300px 이내 접근 시 자동으로 다음 10건 로드
      if (scrollY + viewportHeight >= totalHeight - 300) {
        loadMoreReplays(false);
      }
    }, { passive: true });

    // 2. 모던 IntersectionObserver 감지 (이중 안전장치)
    if ('IntersectionObserver' in window && replayLoader) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          loadMoreReplays(false);
        }
      }, { rootMargin: '200px' });
      observer.observe(replayLoader);
    }
  }

  // ── 비디오 모달 제어 ───────────────────────────────────────────────────
  function openVideoModal(item) {
    const pa = item.player_a || {};
    const pb = item.player_b || {};
    const aWon = Boolean(pa.is_winner);
    const bWon = Boolean(pb.is_winner);

    const nameA = cleanPlayerName(pa, '물주');
    const nameB = cleanPlayerName(pb, '상대선수');

    // 1. 모달 타이틀: 구장명은 굵게, 날짜/시간/이닝은 카드 헤더와 동일한 형식(얇고 옅은 색상)으로 렌더링
    if (modalClubName) {
      modalClubName.textContent = item.club_name || '당구클럽';
    }

    if (modalMatchMeta) {
      const dateStr = item.match_date || '';
      const durStr = item.duration ? `(${item.duration})` : '';
      modalMatchMeta.textContent = `${dateStr} ${durStr}`.trim();
    }

    if (modalInningBadge) {
      if (item.innings) {
        modalInningBadge.innerHTML = `<span>INN</span>${escapeHtml(item.innings)}`;
        modalInningBadge.style.display = 'inline-flex';
      } else {
        modalInningBadge.style.display = 'none';
      }
    }

    // 4. 하단 스코어보드 (몇 대 몇, 승패, 에버, 하이런)
    if (modalScoreboard) {
      const scoreA = pa.score || '0';
      const targetA = pa.target_score ? `/${pa.target_score}` : '';
      const avgA = pa.avg || '-';
      const hrA = pa.hr || '-';

      const scoreB = pb.score || '0';
      const targetB = pb.target_score ? `/${pb.target_score}` : '';
      const avgB = pb.avg || '-';
      const hrB = pb.hr || '-';

      const resultText = aWon ? '승리' : (bWon ? '패배' : '종료');
      const resultClass = aWon ? 'win' : (bWon ? 'lose' : '');

      modalScoreboard.innerHTML = `
        <div class="modal-player-box ${aWon ? 'winner' : ''}">
          <div class="modal-player-info">
            <span class="modal-player-name">${aWon ? '👑 ' : ''}${escapeHtml(nameA)}</span>
            <div class="modal-player-stats">
              <span>Avg ${escapeHtml(avgA)}</span>
              <span>·</span>
              <span>HR ${escapeHtml(hrA)}</span>
            </div>
          </div>
          <span class="modal-player-score-badge">${escapeHtml(scoreA)}<small style="font-size:11px;opacity:0.7;">${escapeHtml(targetA)}</small></span>
        </div>

        <div class="modal-vs-badge">
          <span class="modal-vs-text">VS</span>
          <span class="modal-result-pill ${resultClass}">${resultText}</span>
        </div>

        <div class="modal-player-box right ${bWon ? 'winner' : ''}">
          <div class="modal-player-info">
            <span class="modal-player-name">${bWon ? '👑 ' : ''}${escapeHtml(nameB)}</span>
            <div class="modal-player-stats">
              <span>Avg ${escapeHtml(avgB)}</span>
              <span>·</span>
              <span>HR ${escapeHtml(hrB)}</span>
            </div>
          </div>
          <span class="modal-player-score-badge">${escapeHtml(scoreB)}<small style="font-size:11px;opacity:0.7;">${escapeHtml(targetB)}</small></span>
        </div>
      `;
    }

    // 비디오 소스 연결
    const seq = item.replay_seq || item.record_folder;
    cueunyVideoPlayer.src = `${API_BASE}/api/cueuny/video/${seq}`;
    videoModal.style.display = 'flex';
    cueunyVideoPlayer.play().catch(e => {
      console.log('자동 재생 대기:', e);
    });
  }

  function closeVideoModal() {
    cueunyVideoPlayer.pause();
    cueunyVideoPlayer.src = '';
    videoModal.style.display = 'none';
  }

  btnModalClose.addEventListener('click', closeVideoModal);
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeVideoModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (filterModal && filterModal.style.display !== 'none') {
        closeFilterModal();
      } else if (videoModal && videoModal.style.display !== 'none') {
        closeVideoModal();
      }
    }
  });



  // ── 수동 영상 수집 액션 (누르면 최신 영상 확인 및 백그라운드 다운로드 진행) ──
  btnSync.addEventListener('click', async () => {
    btnSync.disabled = true;
    const origHtml = btnSync.innerHTML;
    btnSync.innerHTML = '<span class="progress-spinner"></span> 수집 중...';

    try {
      const res = await fetch(`${API_BASE}/api/cueuny/sync`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || '영상 수집 중 오류가 발생했습니다.');
      } else {
        await loadStatus();
        await loadMoreReplays(true); // 최신 10건부터 새로고침
      }
    } catch (err) {
      alert('서버 요청 실패: ' + err.message);
    } finally {
      btnSync.disabled = false;
      btnSync.innerHTML = origHtml;
    }
  });

  // ── 상세 필터 모달 제어 ──────────────────────────────────────────────
  function openFilterModal() {
    // 1. 현재 filterState 값들을 모달 폼 필드에 동기화
    if (filterSearchInput) {
      filterSearchInput.value = filterState.q || '';
      if (btnClearSearch) btnClearSearch.style.display = filterSearchInput.value ? 'block' : 'none';
    }
    if (filterYearSelect) filterYearSelect.value = filterState.year || 'all';
    if (filterMonthSelect) filterMonthSelect.value = filterState.month || 'all';
    if (filterResultSelect) filterResultSelect.value = filterState.result || 'all';

    if (inputMinAvg) inputMinAvg.value = filterState.min_avg !== null ? filterState.min_avg : '';
    if (inputMaxAvg) inputMaxAvg.value = filterState.max_avg !== null ? filterState.max_avg : '';
    if (inputMinHr) inputMinHr.value = filterState.min_hr !== null ? filterState.min_hr : '';
    if (inputMinDuration) inputMinDuration.value = filterState.min_duration !== null ? filterState.min_duration : '';
    if (inputMaxDuration) inputMaxDuration.value = filterState.max_duration !== null ? filterState.max_duration : '';
    if (inputMinInnings) inputMinInnings.value = filterState.min_innings !== null ? filterState.min_innings : '';
    if (inputMaxInnings) inputMaxInnings.value = filterState.max_innings !== null ? filterState.max_innings : '';

    if (filterModal) filterModal.style.display = 'flex';
  }

  function closeFilterModal() {
    if (filterModal) filterModal.style.display = 'none';
  }

  // 모달 폼 필드값 -> filterState에 커밋 적용
  function applyFiltersFromModal() {
    const pFloat = (el) => (el && el.value.trim() !== '' ? parseFloat(el.value.trim()) : null);
    const pInt = (el) => (el && el.value.trim() !== '' ? parseInt(el.value.trim(), 10) : null);

    filterState.q = filterSearchInput ? filterSearchInput.value.trim() : '';
    filterState.year = filterYearSelect ? filterYearSelect.value : 'all';
    filterState.month = filterMonthSelect ? filterMonthSelect.value : 'all';
    filterState.result = filterResultSelect ? filterResultSelect.value : 'all';

    filterState.min_avg = pFloat(inputMinAvg);
    filterState.max_avg = pFloat(inputMaxAvg);
    filterState.min_hr = pInt(inputMinHr);
    filterState.min_duration = pInt(inputMinDuration);
    filterState.max_duration = pInt(inputMaxDuration);
    filterState.min_innings = pInt(inputMinInnings);
    filterState.max_innings = pInt(inputMaxInnings);

    closeFilterModal();
    loadMoreReplays(true);
  }

  // 모달 내 입력 필드만 초기화 (화면 적용 전 폼 리셋)
  function resetFilterModalForm() {
    if (filterSearchInput) filterSearchInput.value = '';
    if (btnClearSearch) btnClearSearch.style.display = 'none';
    if (filterYearSelect) filterYearSelect.value = 'all';
    if (filterMonthSelect) filterMonthSelect.value = 'all';
    if (filterResultSelect) filterResultSelect.value = 'all';

    if (inputMinAvg) inputMinAvg.value = '';
    if (inputMaxAvg) inputMaxAvg.value = '';
    if (inputMinHr) inputMinHr.value = '';
    if (inputMinDuration) inputMinDuration.value = '';
    if (inputMaxDuration) inputMaxDuration.value = '';
    if (inputMinInnings) inputMinInnings.value = '';
    if (inputMaxInnings) inputMaxInnings.value = '';
  }

  // 필터 전체 초기화 및 즉시 조회 (전체 해제 버튼)
  function resetAllFilters() {
    filterState.q = '';
    filterState.year = 'all';
    filterState.month = 'all';
    filterState.result = 'all';
    filterState.min_avg = null;
    filterState.max_avg = null;
    filterState.min_hr = null;
    filterState.min_duration = null;
    filterState.max_duration = null;
    filterState.min_innings = null;
    filterState.max_innings = null;

    resetFilterModalForm();
    closeFilterModal();
    loadMoreReplays(true);
  }

  // ── 상세 필터 모달 이벤트 리스너 ─────────────────────────────────────
  if (btnOpenFilter) {
    btnOpenFilter.addEventListener('click', openFilterModal);
  }

  if (btnFilterModalClose) {
    btnFilterModalClose.addEventListener('click', closeFilterModal);
  }

  if (btnModalFilterCancel) {
    btnModalFilterCancel.addEventListener('click', closeFilterModal);
  }

  if (btnModalFilterReset) {
    btnModalFilterReset.addEventListener('click', resetFilterModalForm);
  }

  if (btnModalFilterApply) {
    btnModalFilterApply.addEventListener('click', applyFiltersFromModal);
  }

  if (btnResetSummary) {
    btnResetSummary.addEventListener('click', resetAllFilters);
  }

  if (filterModal) {
    filterModal.addEventListener('click', (e) => {
      if (e.target === filterModal) closeFilterModal();
    });
  }

  // 검색창 입력 및 엔터 감지
  if (filterSearchInput) {
    filterSearchInput.addEventListener('input', () => {
      if (btnClearSearch) {
        btnClearSearch.style.display = filterSearchInput.value.trim() ? 'block' : 'none';
      }
    });

    filterSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyFiltersFromModal();
      }
    });
  }

  // 검색어 지우기 (X)
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      filterSearchInput.value = '';
      btnClearSearch.style.display = 'none';
      filterSearchInput.focus();
    });
  }

  // ── 개별 필터 태그 칩 삭제 (&times;) ─────────────────────────────────
  if (filterTagContainer) {
    filterTagContainer.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.filter-tag-remove');
      if (!removeBtn) return;
      const key = removeBtn.getAttribute('data-key');

      if (key === 'q') filterState.q = '';
      else if (key === 'year') filterState.year = 'all';
      else if (key === 'month') filterState.month = 'all';
      else if (key === 'result') filterState.result = 'all';
      else if (key === 'avg') { filterState.min_avg = null; filterState.max_avg = null; }
      else if (key === 'min_hr') filterState.min_hr = null;
      else if (key === 'duration') { filterState.min_duration = null; filterState.max_duration = null; }
      else if (key === 'innings') { filterState.min_innings = null; filterState.max_innings = null; }

      loadMoreReplays(true);
    });
  }

  // ── 초기화 실행 ────────────────────────────────────────────────────────
  async function init() {
    if (window.GumaCore && typeof window.GumaCore.ensureApiBase === 'function') {
      try {
        const base = await window.GumaCore.ensureApiBase();
        if (base) API_BASE = base.replace(/\/$/, '');
      } catch (e) {
        console.warn('[CUEUNY] 터널 감지 예외:', e);
      }
    }
    await loadStatus();
    initInfiniteScroll();
    await loadMoreReplays(true); // 최초 10건 로드 (자동 폴링 없음)
  }

  document.addEventListener('DOMContentLoaded', init);
})();


