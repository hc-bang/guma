'use strict';

/* ── DOM refs ──────────────────────────────────────────── */
const form            = document.getElementById('searchForm');
const input           = document.getElementById('searchInput');
const bookmarksDiv    = document.getElementById('bookmarks');
const topBookmarksDiv = document.getElementById('topBookmarks');

const TOP_BOOKMARKS_KEY = 'topBookmarks';
const FAVICON_CACHE_PFX = 'faviconCache::';

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
function getFaviconUrl(url, size = 64) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=${size}`; }
  catch { return ''; }
}
function getOriginFaviconUrl(url) {
  try { return `${new URL(url).origin}/favicon.ico`; } catch { return ''; }
}
function applyFavicon(imgEl, url, size = 32) {
  const isPrivate = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url);
  const google = getFaviconUrl(url, size);
  const origin = getOriginFaviconUrl(url);
  const cached = getCachedFavicon(url);
  const base = isPrivate ? [origin, google] : [google, origin];
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
const engines = {
  naver:   { label: '네이버',  domain: 'naver.com',     url: q => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}` },
  daum:    { label: '다음',    domain: 'daum.net',      url: q => `https://search.daum.net/search?q=${encodeURIComponent(q)}` },
  google:  { label: '구글',    domain: 'google.com',    url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing:    { label: '빙',      domain: 'bing.com',      url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  youtube: { label: '유튜브',  domain: 'youtube.com',   url: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  github:  { label: 'GitHub',  domain: 'github.com',    url: q => `https://github.com/search?q=${encodeURIComponent(q)}` },
  wiki:    { label: '위키백과', domain: 'wikipedia.org', url: q => `https://ko.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
};

let currentEngine = localStorage.getItem('engine') || 'naver';
const engineBtn   = document.getElementById('engineBtn');
const engineIcon  = document.getElementById('engineIcon');
const engineMenu  = document.getElementById('engineMenu');
const engineItems = document.querySelectorAll('.engine-item');

function applyEngine(key) {
  currentEngine = key;
  localStorage.setItem('engine', key);
  const e = engines[key];
  engineIcon.src = `https://www.google.com/s2/favicons?domain=${e.domain}&sz=64`;
  engineIcon.alt = e.label;
  engineItems.forEach(it => it.classList.toggle('active', it.dataset.engine === key));
}
applyEngine(currentEngine);

engineBtn.onclick = e => { e.stopPropagation(); engineMenu.classList.toggle('hidden'); };
engineItems.forEach(item => {
  item.onclick = () => { applyEngine(item.dataset.engine); engineMenu.classList.add('hidden'); input.focus(); };
});
document.addEventListener('click', () => engineMenu.classList.add('hidden'));
form.addEventListener('submit', e => {
  e.preventDefault();
  const q = input.value.trim();
  if (q) location.href = engines[currentEngine].url(q);
});

/* ── Bookmarks ──────────────────────────────────────────── */
let bookmarks = (() => { try { return JSON.parse(localStorage.getItem('bookmarks') || '[]'); } catch { return []; } })();

function saveBookmarks() { localStorage.setItem('bookmarks', JSON.stringify(bookmarks)); render(); }

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
  if (bookmarks.length < 15) {
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
  btn.innerHTML = `<span class="top-folder-item-folder-icon" aria-hidden="true"></span><span class="top-folder-item-folder-label"></span>`;
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
  btn.onclick = e => { e.stopPropagation(); sub.classList.toggle('hidden'); };
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
    btn.onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); };
    wrap.addEventListener('mouseenter', openMenu);
    wrap.addEventListener('mouseleave', closeMenu);
    document.addEventListener('focusin', e => { if (!wrap.contains(e.target)) menu.classList.add('hidden'); });
    wrap.appendChild(btn); wrap.appendChild(menu);
    topBookmarksDiv.appendChild(wrap);
  });
}

function getTopFromLocalStorage() {
  try { const d = JSON.parse(localStorage.getItem(TOP_BOOKMARKS_KEY) || 'null'); return (d && Array.isArray(d.top)) ? d : null; } catch { return null; }
}

async function loadBookmarksJson() {
  try {
    const stored = getTopFromLocalStorage();
    if (stored) { renderTopFolders(stored); return; }
    const res = await fetch('./bookmarks.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderTopFolders(await res.json());
  } catch { if (topBookmarksDiv) topBookmarksDiv.innerHTML = ''; }
}

document.addEventListener('click', () => document.querySelectorAll('.top-folder-menu').forEach(el => el.classList.add('hidden')));

render();
loadBookmarksJson();
input.focus();
