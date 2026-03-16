'use strict';

/* ── DOM refs ──────────────────────────────────────────── */
const form            = document.getElementById('searchForm');
const input           = document.getElementById('searchInput');
const bookmarksDiv    = document.getElementById('bookmarks');
const topBookmarksDiv = document.getElementById('topBookmarks');

const TOP_BOOKMARKS_KEY = 'topBookmarks';
const FAVICON_CACHE_PFX = 'faviconCache::';
const NEWS_CACHE_KEY    = 'newsCache';          // 뉴스 캐시 localStorage 키
const NEWS_CACHE_TTL    = 30 * 60 * 1000;       // 캐시 유효 시간: 30분 (밀리초)

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
function applyFavicon(imgEl, url, size = 32) {
  let hostname = '', originUrl = '';
  try {
    const u = new URL(url);
    hostname = u.hostname;
    originUrl = u.origin;
  } catch {
    imgEl.src = FALLBACK_FAVICON;
    return;
  }

  const isPrivate = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url);
  const cached = getCachedFavicon(url);
  
  // 파비콘 다중 획득 소스 (우선순위를 두어 실패 시 Fallback 구성)
  // 1. Origin 직접 탐색 (브라우저 탭 아이콘과 동일하게 맞추기 위해 고해상도 포맷 우선)
  const originSvg   = `${originUrl}/favicon.svg`;
  const originPng   = `${originUrl}/favicon.png`;
  const originIco   = `${originUrl}/favicon.ico`;
  const originApple = `${originUrl}/apple-touch-icon.png`;
  const originLogo  = `${originUrl}/logo.png`;
  // 2. 외부 API (Clearbit - 로고 화질이 높으나 종종 구형일 수 있음)
  const clearbit = `https://logo.clearbit.com/${hostname}`;
  // 3. 외부 API (DuckDuckGo - 범용성이 높음)
  const duckduckgo = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  // 4. Google API (가장 마지막 Fallback)
  const google = `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;

  // 내부망(사설)일 경우 외부 API를 무시하고, 사이트 루트부터 직접 탐색
  const origins = [originSvg, originPng, originIco, originApple, originLogo];
  const base = isPrivate ? [...origins, google] : [...origins, clearbit, duckduckgo, google];
  const candidates = [...new Set([cached, ...base, FALLBACK_FAVICON].filter(Boolean))];

  imgEl.onload = () => { if (imgEl.src && !imgEl.src.startsWith('data:')) setCachedFavicon(url, imgEl.src); };
  let idx = 0;
  function tryNext() {
    const src = candidates[idx++];
    if (!src) { imgEl.src = FALLBACK_FAVICON; imgEl.onerror = null; return; }
    imgEl.onerror = tryNext;
    imgEl.src = src;
  }
  tryNext();
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
  
  Object.keys(engines).forEach(key => {
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
  const currentEngine = (saved && engines[saved]) ? saved : Object.keys(engines)[0];
  applyEngine(currentEngine);
}

async function loadEnginesJson() {
  try {
    // 1. localStorage 확인
    const stored = localStorage.getItem(SEARCH_ENGINES_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data && data.engines) {
        engines = data.engines;
        renderEngineMenu();
        return;
      }
    }
    
    // 2. config/engines.json 확인
    const res = await fetch('./config/engines.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    engines = data.engines || {};
  } catch (e) {
    // Fallback: 기존 하드코딩된 값 일부 유지
    engines = {
      naver: { label: '네이버', domain: 'naver.com', urlPattern: 'https://search.naver.com/search.naver?query=' },
      google: { label: '구글', domain: 'google.com', urlPattern: 'https://www.google.com/search?q=' }
    };
  }
  renderEngineMenu();
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
let bookmarks = (() => { try { return JSON.parse(localStorage.getItem('bookmarks') || 'null'); } catch { return null; } })();

function saveBookmarks() { localStorage.setItem('bookmarks', JSON.stringify(bookmarks || [])); render(); }

function render() {
  bookmarksDiv.innerHTML = '';
  bookmarks.forEach((b, i) => {
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

async function loadShortcutsJson() {
  if (bookmarks !== null) { render(); return; }
  try {
    const res = await fetch('./config/shortcuts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    bookmarks = (Array.isArray(data.shortcuts) ? data.shortcuts : []).slice(0, 15);
  } catch {
    bookmarks = []; // fallback empty
  }
  render();
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
    // 호버 이벤트 구동 중 클릭 시 toggle 되어 하위 메뉴가 접히는 버그 방지 (강제 유지)
    document.querySelectorAll('.top-folder-submenu').forEach(el => el !== sub && el.classList.add('hidden'));
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
  try { const d = JSON.parse(localStorage.getItem(TOP_BOOKMARKS_KEY) || 'null'); return (d && Array.isArray(d.top)) ? d : null; } catch { return null; }
}

async function loadBookmarksJson() {
  try {
    const stored = getTopFromLocalStorage();
    if (stored) { renderTopFolders(stored); return; }
    const res = await fetch('./config/bookmarks.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderTopFolders(await res.json());
  } catch { if (topBookmarksDiv) topBookmarksDiv.innerHTML = ''; }
}

/* ── Google News Widget (RSS) ───────────────────────────── */

/**
 * 뉴스 기사 배열을 받아 카드 UI로 렌더링한다.
 * loadGoogleNews()에서 캐시 경로와 fetch 경로 모두 이 함수로 렌더링한다.
 */
function renderNewsArticles(articles, newsSection, newsContainer) {
  newsContainer.innerHTML = '';
  articles.forEach(item => {
    const a = document.createElement('a');
    a.className = 'news-card';
    a.href = item.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    // 썸네일 이미지 동적 파싱
    let thumbUrl = item.thumbnail || '';
    if (!thumbUrl && item.description) {
      const m = item.description.match(/<img[^>]+src="([^">]+)"/i);
      if (m) thumbUrl = m[1];
    }
    if (!thumbUrl && item.content) {
      const m = item.content.match(/<img[^>]+src="([^">]+)"/i);
      if (m) thumbUrl = m[1];
    }
    if (thumbUrl) {
      const imgEl = document.createElement('img');
      imgEl.className = 'news-card-img';
      imgEl.src = thumbUrl;
      imgEl.alt = '뉴스 이미지';
      imgEl.onerror = () => { imgEl.style.display = 'none'; };
      a.appendChild(imgEl);
    }

    const titleEl = document.createElement('h3');
    titleEl.className = 'news-card-title';
    titleEl.textContent = item.title;

    const metaEl = document.createElement('div');
    metaEl.className = 'news-card-meta';
    const pDate = new Date(item.pubDate);
    const dateStr = pDate.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' +
                    pDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    let source = item.author || '';
    if (!source && item.title.lastIndexOf(' - ') !== -1) {
      source = item.title.substring(item.title.lastIndexOf(' - ') + 3);
    }
    metaEl.innerHTML = `<span>${source}</span><span>${dateStr}</span>`;

    a.appendChild(titleEl);
    a.appendChild(metaEl);
    newsContainer.appendChild(a);
  });

  newsSection.classList.remove('hidden');
}

/**
 * Google 뉴스 RSS를 가져와 렌더링한다.
 * 30분 단위로 localStorage에 캐싱하여 불필요한 API 호출을 방지한다.
 * - 캐시 유효(30분 이내): 캐시 데이터로 즉시 렌더링
 * - 캐시 만료 또는 없음: API 호출 후 캐시 저장 → 렌더링
 */
async function loadGoogleNews() {
  const newsSection = document.getElementById('news-section');
  const newsContainer = document.getElementById('news-container');
  if (!newsSection || !newsContainer) return;

  // 캐시 확인: 유효한 캐시가 있으면 API 호출 없이 바로 렌더링
  try {
    const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || 'null');
    if (cached && Array.isArray(cached.articles) && cached.articles.length > 0) {
      if (Date.now() - cached.timestamp < NEWS_CACHE_TTL) {
        renderNewsArticles(cached.articles, newsSection, newsContainer);
        return;
      }
    }
  } catch { /* 캐시 읽기 실패 시 무시, API 호출로 진행 */ }

  const rssUrl = "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko";
  let articles = [];

  // 방법 1: rss2json.com API (무료 플랜)
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'ok' && data.items && data.items.length > 0) {
        articles = data.items.slice(0, 5);
      }
    }
  } catch (e) {
    console.warn("rss2json 호출 실패, 대체 프록시 시도", e);
  }

  // 방법 2: allorigins 프록시를 통한 XML 직접 파싱 (rss2json 실패 시)
  if (articles.length === 0) {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'text/xml');
        const items = xml.querySelectorAll('item');
        items.forEach((item, i) => {
          if (i >= 5) return;
          articles.push({
            title: item.querySelector('title')?.textContent || '',
            link: item.querySelector('link')?.textContent || '',
            pubDate: item.querySelector('pubDate')?.textContent || '',
            author: item.querySelector('source')?.textContent || '',
            thumbnail: '',
            description: item.querySelector('description')?.textContent || '',
          });
        });
      }
    } catch (e2) {
      console.warn("대체 프록시(allorigins)도 실패", e2);
    }
  }

  // 기사가 없으면 섹션을 표시하지 않음
  if (articles.length === 0) return;

  // 새로 가져온 기사를 캐시에 저장 (타임스탬프 기록)
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), articles }));
  } catch { /* localStorage 저장 실패 시 무시 */ }

  renderNewsArticles(articles, newsSection, newsContainer);
}

document.addEventListener('click', () => document.querySelectorAll('.engine-menu, .top-folder-menu').forEach(el => el.classList.add('hidden')));

loadEnginesJson();
loadShortcutsJson();
loadBookmarksJson();
loadGoogleNews();
input.focus();
