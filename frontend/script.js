'use strict';

/* ── DOM refs ──────────────────────────────────────────── */
const form            = document.getElementById('searchForm');
const input           = document.getElementById('searchInput');
const bookmarksDiv    = document.getElementById('bookmarks');
const topBookmarksDiv = document.getElementById('topBookmarks');

const TOP_BOOKMARKS_KEY = 'topBookmarks';
const FAVICON_CACHE_PFX = 'faviconCache_v2::';

const FALLBACK_FAVICON =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

/* ── Favicon helpers ────────────────────────────────────── */
function getFaviconCacheKey(url) {
  try { return FAVICON_CACHE_PFX + new URL(url).origin; } catch { return ''; }
}
function getCachedFavicon(url) {
  const k = getFaviconCacheKey(url);
  try { return (k && localStorage.getItem(k)) || ''; } catch { return ''; }
}
function setCachedFavicon(url, src) {
  const k = getFaviconCacheKey(url);
  if (!k) return;
  try { localStorage.setItem(k, src); } catch {}
}
const ROUTER_FAVICON =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>';

function applyFavicon(imgEl, url, size = 32) {
  let hostname = '';
  try {
    const u = new URL(url);
    hostname = u.hostname;
  } catch {
    imgEl.src = FALLBACK_FAVICON;
    return;
  }

  imgEl.loading = 'lazy';

  // 1. 사설 IP (공유기, 확장기 등)는 네트워크 연결 시도 시 타임아웃(수초 지연)을 유발하므로 즉시 라우터 아이콘 적용
  const isPrivate = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url);
  if (isPrivate) {
    imgEl.src = ROUTER_FAVICON;
    return;
  }

  // 2. 이미 캐시된 파비콘이 있다면 네트워크 요청 없이 0ms 즉시 렌더링
  const cached = getCachedFavicon(url);
  if (cached) {
    imgEl.src = cached;
    return;
  }

  // 3. 캐시가 없는 일반 도메인은 구글 파비콘 API를 1차로 로드
  const google     = `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;
  const duckduckgo = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  const candidates = [google, duckduckgo, FALLBACK_FAVICON];

  imgEl.onload = () => {
    if (imgEl.naturalWidth > 0 && imgEl.src && !imgEl.src.startsWith('data:')) {
      setCachedFavicon(url, imgEl.src);
    }
  };

  let idx = 0;
  function tryNext() {
    const src = candidates[idx++];
    if (!src) { imgEl.src = FALLBACK_FAVICON; imgEl.onerror = null; return; }
    imgEl.onerror = tryNext;
    imgEl.src = src;
  }
  tryNext();
}

/* ── Cache Helpers (Stale-While-Revalidate) ──────────────── */
function getProfileCacheKey(type) {
  const profile = (window.GumaCore && window.GumaCore.getActiveProfile()) || localStorage.getItem('guma_active_profile') || 'default';
  return `guma_cache_${type}_${profile}`;
}

function getCachedConfig(type) {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(type));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedConfig(type, data) {
  try {
    if (data !== null && data !== undefined) {
      localStorage.setItem(getProfileCacheKey(type), JSON.stringify(data));
    }
  } catch {}
}

/* ── Search engines ─────────────────────────────────────── */
let engines = {}; // 동적 로드될 객체
const SEARCH_ENGINES_KEY = 'searchEngines';

const engineBtn   = document.getElementById('engineBtn');
const engineIcon  = document.getElementById('engineIcon');
const engineMenu  = document.getElementById('engineMenu');
let engineItems   = []; // 동적 생성 후 채워짐

function applyEngine(key) {
  const e = engines[key];
  if (!e) return;
  
  localStorage.setItem('engine', key);
  engineIcon.src = `https://www.google.com/s2/favicons?domain=${e.domain}&sz=64`;
  engineIcon.alt = e.label;
  
  // 메뉴 아이템 활성화 상태 업데이트
  document.querySelectorAll('.engine-item').forEach(it => {
    it.classList.toggle('active', it.dataset.engine === key);
  });
}

function renderEngineMenu() {
  if (!engineMenu) return;
  engineMenu.innerHTML = '';
  
  const keys = Object.keys(engines || {});
  if (keys.length === 0) {
    if (engineIcon) {
      engineIcon.src = '';
      engineIcon.alt = '';
    }
    return;
  }

  keys.forEach(key => {
    const e = engines[key];
    const btn = document.createElement('button');
    btn.className = 'engine-item';
    btn.dataset.engine = key;
    btn.setAttribute('role', 'option');
    
    const img = document.createElement('img');
    img.src = `https://www.google.com/s2/favicons?domain=${e.domain}&sz=32`;
    img.className = 'engine-item-icon';
    img.alt = '';
    
    btn.appendChild(img);
    btn.append(e.label);
    
    btn.onclick = (ev) => {
      ev.stopPropagation();
      applyEngine(key);
      engineMenu.classList.add('hidden');
      input.focus();
    };
    
    engineMenu.appendChild(btn);
  });
  
  // 현재 선택된 엔진 적용
  const saved = localStorage.getItem('engine');
  const currentEngine = (saved && engines[saved]) ? saved : keys[0];
  applyEngine(currentEngine);
}

// 1. 브라우저 캐시에서 즉시 복원 (0ms 렌더링)
function initEnginesFromCache() {
  const cached = getCachedConfig('engines');
  if (cached && cached.engines && Object.keys(cached.engines).length > 0) {
    engines = cached.engines;
    renderEngineMenu();
    return true;
  }
  const oldStored = localStorage.getItem(SEARCH_ENGINES_KEY);
  if (oldStored) {
    try {
      const data = JSON.parse(oldStored);
      if (data && data.engines && Object.keys(data.engines).length > 0) {
        engines = data.engines;
        renderEngineMenu();
        return true;
      }
    } catch {}
  }
  return false;
}

// 2. 백엔드 DB 최신화 및 캐시 갱신
async function loadEnginesJson() {
  try {
    if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
      const dbData = await window.GumaCore.fetchProfileConfig('engines');
      if (dbData && dbData.engines && typeof dbData.engines === 'object' && Object.keys(dbData.engines).length > 0) {
        engines = dbData.engines;
        setCachedConfig('engines', dbData);
        renderEngineMenu();
        return;
      }
    }
  } catch (e) {
    console.warn('[GUMA] 검색엔진 최신화 건너뜀 (캐시 유지):', e);
  }

  // DB에 데이터가 없고 기존 캐시도 비어있는 경우에만 빈 상태 적용
  if (!engines || Object.keys(engines).length === 0) {
    engines = {};
    renderEngineMenu();
  }
}

engineBtn.onclick = e => { e.stopPropagation(); engineMenu.classList.toggle('hidden'); };
document.addEventListener('click', () => engineMenu.classList.add('hidden'));

form.addEventListener('submit', e => {
  e.preventDefault();
  const q = input.value.trim();
  const currentKey = localStorage.getItem('engine') || Object.keys(engines)[0];
  if (q && engines[currentKey]) {
    location.href = engines[currentKey].urlPattern + encodeURIComponent(q);
  }
});

/* ── Bookmarks ──────────────────────────────────────────── */
let bookmarks = null;

async function saveBookmarks() {
  setCachedConfig('bookmarks', { shortcuts: bookmarks || [] });
  if (window.GumaCore && window.GumaCore.saveProfileConfig) {
    await window.GumaCore.saveProfileConfig('bookmarks', { shortcuts: bookmarks || [] });
  }
  render();
}

function render() {
  bookmarksDiv.innerHTML = '';
  (bookmarks || []).forEach((b, i) => {
    const div = document.createElement('div');
    div.className = 'bookmark';
    div.title = `${b.name || ''}\n${b.url || ''}`;
    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon-wrap';
    const img = document.createElement('img');
    img.className = 'bookmark-favicon';
    img.alt = b.name || '';
    applyFavicon(img, b.url, 64);
    iconWrap.appendChild(img);
    const label = document.createElement('div');
    label.textContent = b.name;
    div.appendChild(iconWrap);
    div.appendChild(label);
    div.onclick = () => location.href = b.url;
    div.oncontextmenu = e => {
      e.preventDefault();
      if (confirm(`"${b.name}" 바로가기를 삭제할까요?`)) { bookmarks.splice(i, 1); saveBookmarks(); }
    };
    bookmarksDiv.appendChild(div);
  });
  if (bookmarks && bookmarks.length < 15) {
    const wrap = document.createElement('div');
    wrap.className = 'add-wrap';
    const btn = document.createElement('button');
    btn.className = 'add';
    btn.innerHTML = '＋';
    btn.onclick = () => openModal();
    const lbl = document.createElement('div');
    lbl.textContent = '추가';
    wrap.appendChild(btn); wrap.appendChild(lbl);
    bookmarksDiv.appendChild(wrap);
  }
}

// 1. 브라우저 캐시에서 바로가기 즉시 복원 (0ms 렌더링)
function initShortcutsFromCache() {
  const cached = getCachedConfig('bookmarks');
  if (cached) {
    const list = Array.isArray(cached.shortcuts) ? cached.shortcuts : (Array.isArray(cached) ? cached : null);
    if (list && list.length > 0) {
      bookmarks = list.slice(0, 15);
      render();
      return true;
    }
  }
  return false;
}

// 2. 백엔드 DB 최신화 및 캐시 갱신
async function loadShortcutsJson() {
  let loaded = false;
  if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
    try {
      const dbData = await window.GumaCore.fetchProfileConfig('bookmarks');
      if (dbData) {
        const list = Array.isArray(dbData.shortcuts) ? dbData.shortcuts : (Array.isArray(dbData) ? dbData : []);
        bookmarks = list.slice(0, 15);
        setCachedConfig('bookmarks', { shortcuts: bookmarks });
        loaded = true;
        render();
      }
    } catch (e) {
      console.warn('[GUMA] 바로가기 최신화 건너뜀 (캐시 유지):', e);
    }
  }

  // DB 조회가 실패했고 캐시된 바로가기도 아직 없는 경우에만 빈 상태 적용
  if (!loaded && (!bookmarks || bookmarks.length === 0)) {
    bookmarks = [];
    render();
  }
}

/* ── Modal ──────────────────────────────────────────────── */
const modalOverlay = document.getElementById('modalOverlay');
const modalName    = document.getElementById('modalName');
const modalUrl     = document.getElementById('modalUrl');

function openModal()  { modalName.value = ''; modalUrl.value = ''; modalOverlay.classList.remove('hidden'); modalName.focus(); }
function closeModal() { modalOverlay.classList.add('hidden'); }

document.getElementById('modalCancel').onclick = closeModal;
modalOverlay.onclick = e => { if (e.target === modalOverlay) closeModal(); };
document.getElementById('modalConfirm').onclick = confirmModal;
modalUrl.addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function confirmModal() {
  const name = modalName.value.trim();
  let url = modalUrl.value.trim();
  if (!name || !url) { alert('이름과 URL을 모두 입력해주세요.'); return; }
  if (bookmarks.length >= 15) { alert('바로가기는 최대 15개까지 추가할 수 있습니다.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  bookmarks.push({ name, url });
  saveBookmarks();
  closeModal();
}

/* ── Top Bookmarks / Folders ────────────────────────────── */
function createLinkItem(b, cls) {
  const a = document.createElement('a');
  a.className = cls; a.href = b.url; a.rel = 'noopener noreferrer';
  a.title = `${b.name || ''}\n${b.url}`;
  const icon = document.createElement('img');
  icon.className = 'top-folder-item-icon'; icon.alt = '';
  applyFavicon(icon, b.url, 32);
  const label = document.createElement('span');
  label.textContent = b.name || new URL(b.url).hostname;
  a.appendChild(icon); a.appendChild(label);
  return a;
}

function createFolderItem(folder) {
  const wrap = document.createElement('div');
  wrap.className = 'top-folder-sub';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'top-folder-item top-folder-item-folder';
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:9px;"><span class="top-folder-item-folder-icon" aria-hidden="true"></span><span class="top-folder-item-folder-label"></span></span><svg style="margin-left:auto;opacity:0.4;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  btn.querySelector('.top-folder-item-folder-label').textContent = folder.name;
  const sub = document.createElement('div');
  sub.className = 'top-folder-submenu hidden';
  (Array.isArray(folder.items) ? folder.items : []).forEach(it => {
    if (!it?.name) return;
    const el = it.url ? createLinkItem(it, 'top-folder-item') : (Array.isArray(it.items) ? createFolderItem(it) : null);
    if (el) sub.appendChild(el);
  });
  let ot = null, ct = null;
  const openSub  = () => { ct && (clearTimeout(ct), ct=null); ot || (ot = setTimeout(() => { sub.classList.remove('hidden'); ot=null; }, 450)); };
  const closeSub = () => { ot && (clearTimeout(ot), ot=null); ct || (ct = setTimeout(() => { sub.classList.add('hidden');    ct=null; }, 450)); };
  btn.onclick = e => {
    e.stopPropagation();
    e.preventDefault();
    document.querySelectorAll('.top-folder-submenu').forEach(el => {
      if (el !== sub && !el.contains(sub)) el.classList.add('hidden');
    });
    sub.classList.remove('hidden');
  };
  wrap.addEventListener('mouseenter', openSub);
  wrap.addEventListener('mouseleave', closeSub);
  document.addEventListener('focusin', e => { if (!wrap.contains(e.target)) sub.classList.add('hidden'); });
  wrap.appendChild(btn); wrap.appendChild(sub);
  return wrap;
}

function renderTopFolders(data) {
  if (!topBookmarksDiv) return;
  topBookmarksDiv.innerHTML = '';
  (Array.isArray(data?.top) ? data.top : []).forEach(it => {
    if (!it?.name) return;
    if (it.url) {
      const a = document.createElement('a');
      a.className = 'top-link-pill'; a.href = it.url; a.rel = 'noopener noreferrer';
      a.title = `${it.name}\n${it.url}`;
      const icon = document.createElement('img');
      icon.className = 'top-link-pill-icon'; icon.alt = '';
      applyFavicon(icon, it.url, 32);
      const label = document.createElement('span');
      label.className = 'top-link-pill-label'; label.textContent = it.name;
      a.appendChild(icon); a.appendChild(label);
      topBookmarksDiv.appendChild(a);
      return;
    }
    if (!Array.isArray(it.items)) return;
    const wrap = document.createElement('div');
    wrap.className = 'top-folder';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'top-folder-btn';
    btn.innerHTML = `<span class="top-folder-icon" aria-hidden="true"></span><span class="top-folder-label"></span>`;
    btn.querySelector('.top-folder-label').textContent = it.name;
    const menu = document.createElement('div');
    menu.className = 'top-folder-menu hidden';
    it.items.forEach(child => {
      if (!child?.name) return;
      const el = child.url ? createLinkItem(child, 'top-folder-item') : (Array.isArray(child.items) ? createFolderItem(child) : null);
      if (el) menu.appendChild(el);
    });
    let ot = null, ct = null;
    const openMenu  = () => { ct && (clearTimeout(ct), ct=null); ot || (ot = setTimeout(() => { document.querySelectorAll('.top-folder-menu').forEach(el => el !== menu && el.classList.add('hidden')); menu.classList.remove('hidden'); ot=null; }, 450)); };
    const closeMenu = () => { ot && (clearTimeout(ot), ot=null); ct || (ct = setTimeout(() => { menu.classList.add('hidden'); ct=null; }, 450)); };
    btn.onclick = e => {
      e.stopPropagation();
      e.preventDefault();
      // 호버 중복 시 접힘 방지
      document.querySelectorAll('.top-folder-menu').forEach(el => el !== menu && el.classList.add('hidden'));
      menu.classList.remove('hidden');
    };
    wrap.addEventListener('mouseenter', openMenu);
    wrap.addEventListener('mouseleave', closeMenu);
    document.addEventListener('focusin', e => { if (!wrap.contains(e.target)) menu.classList.add('hidden'); });
    wrap.appendChild(btn); wrap.appendChild(menu);
    topBookmarksDiv.appendChild(wrap);
  });
}

// 터치 기기 등에서 외부 빈 공간 클릭 시 모든 메뉴 닫기 규정
document.addEventListener('click', e => {
  if (!e.target.closest('.top-folder')) {
    document.querySelectorAll('.top-folder-menu, .top-folder-submenu').forEach(el => el.classList.add('hidden'));
  }
});

function getTopFromLocalStorage() {
  try {
    const curProfile = (window.GumaCore && window.GumaCore.getActiveProfile()) || localStorage.getItem('guma_active_profile') || 'default';
    const profileKey = (curProfile === 'default') ? TOP_BOOKMARKS_KEY : `${TOP_BOOKMARKS_KEY}_${curProfile}`;
    const d = JSON.parse(localStorage.getItem(profileKey) || 'null');
    return (d && Array.isArray(d.top)) ? d : null;
  } catch {
    return null;
  }
}

// 1. 브라우저 캐시에서 상단 북마크/폴더 즉시 복원 (0ms 렌더링)
function initTopBookmarksFromCache() {
  const cached = getCachedConfig('topBookmarks');
  if (cached && (Array.isArray(cached.top) || Array.isArray(cached))) {
    const topObj = Array.isArray(cached.top) ? cached : { top: cached };
    if (topObj.top.length > 0) {
      renderTopFolders(topObj);
      return true;
    }
  }
  const oldTop = getTopFromLocalStorage();
  if (oldTop && Array.isArray(oldTop.top) && oldTop.top.length > 0) {
    renderTopFolders(oldTop);
    return true;
  }
  return false;
}

// 2. 백엔드 DB 최신화 및 캐시 갱신
async function loadBookmarksJson() {
  let loaded = false;
  if (window.GumaCore && window.GumaCore.fetchProfileConfig) {
    try {
      const dbData = await window.GumaCore.fetchProfileConfig('topBookmarks');
      if (dbData && (Array.isArray(dbData.top) || Array.isArray(dbData))) {
        const topObj = Array.isArray(dbData.top) ? dbData : { top: dbData };
        renderTopFolders(topObj);
        setCachedConfig('topBookmarks', topObj);
        loaded = true;
      }
    } catch (e) {
      console.warn('[GUMA] 상단 북마크 최신화 건너뜀 (캐시 유지):', e);
    }
  }

  // DB 조회가 실패했고 캐시된 요소도 전혀 없을 때만 빈 상태 적용
  if (!loaded && topBookmarksDiv && !topBookmarksDiv.hasChildNodes()) {
    topBookmarksDiv.innerHTML = '';
  }
}

document.addEventListener('click', () => document.querySelectorAll('.engine-menu, .top-folder-menu').forEach(el => el.classList.add('hidden')));

async function initApp() {
  // 1단계 (0ms): 브라우저 로컬 캐시로부터 즉시 렌더링 (깜빡임 및 빈 화면 100% 방지)
  initEnginesFromCache();
  initShortcutsFromCache();
  initTopBookmarksFromCache();

  // 2단계: 백엔드 터널 감지 확인
  if (window.GumaCore && window.GumaCore.discoverActiveTunnel) {
    try { await window.GumaCore.discoverActiveTunnel(); } catch {}
  }

  // 3단계: 백그라운드에서 최신 DB 데이터 동기화
  await Promise.allSettled([
    loadEnginesJson(),
    loadShortcutsJson(),
    loadBookmarksJson()
  ]);

  if (input) input.focus();
}
initApp();
