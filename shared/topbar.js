/**
 * GUMA™ Shared Topbar Module
 * - menu.json 에서 내비게이션 항목을 불러와 사이드패널에 렌더링
 * - 테마 토글 / 사이드패널 열고닫기 공통 처리
 *
 * 사용법 (각 페이지 head 또는 body 끝):
 *   <script>
 *     window.GUMA = { root: '../', page: 'config' };
 *   </script>
 *   <script src="../shared/topbar.js" defer></script>
 *
 * window.GUMA.root  : 사이트 루트까지의 상대 경로 (필수, 끝에 '/' 포함)
 * window.GUMA.page  : 현재 페이지 식별자 — 활성 메뉴 표시용 (선택)
 */

(function () {
  'use strict';

  /* ── SVG 아이콘 맵 ──────────────────────────────────── */
  const ICONS = {
    settings: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,
    document: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>`,
    tool: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>`,
    home: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>`,
    moon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`,
    menu: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`,
  };

  /* ── 설정 ───────────────────────────────────────────── */
  const cfg   = window.GUMA || {};
  const ROOT  = (cfg.root || './').replace(/\/?$/, '/');
  const PAGE  = cfg.page || '';

  /* ── 테마 ───────────────────────────────────────────── */
  function setTheme(mode) {
    document.body.classList.toggle('dark', mode === 'dark');
    localStorage.setItem('theme', mode);
    // 부모에서 테마 변경 시 모든 iframe에 알림 전송 (동일 출처 가정)
    try {
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'themeChange', theme: mode }, '*');
        }
      });
    } catch (e) {
      // 안전하게 무시
    }
  }
  function toggleTheme() {
    setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  }
  // 저장된 테마 적용 (CSS 로드 전 깜박임 방지)
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

  /* ── 사이드패널 ─────────────────────────────────────── */
  function openSidepanel()  {
    document.getElementById('sidepanelOverlay')?.classList.add('open');
    document.getElementById('sidepanel')?.classList.add('open');
  }
  function closeSidepanel() {
    document.getElementById('sidepanelOverlay')?.classList.remove('open');
    document.getElementById('sidepanel')?.classList.remove('open');
  }

  /* ── 메뉴 렌더링 ────────────────────────────────────── */
  function renderNav(items) {
    const container = document.getElementById('sidepanel-nav');
    if (!container) return;
    container.innerHTML = '';

    items.forEach(item => {
      const a = document.createElement('a');
      // href: root 기준 상대 경로를 현재 페이지 기준으로 변환
      a.href = ROOT + item.href;
      a.className = 'btn' + (item.href.replace(/\/$/, '') === PAGE ? ' active' : '');

      const iconSvg = document.createElement('span');
      iconSvg.className = 'icon-svg';
      iconSvg.setAttribute('aria-hidden', 'true');
      iconSvg.innerHTML = ICONS[item.icon] || '';

      const label = document.createElement('span');
      label.textContent = item.label;

      a.appendChild(iconSvg);
      a.appendChild(label);
      container.appendChild(a);
    });
  }

  /* ── menu.json 로드 ─────────────────────────────────── */
  async function loadMenu() {
    try {
      const res = await fetch(ROOT + 'menu.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.nav)) renderNav(data.nav);
    } catch (e) {
      // 로드 실패 시 기본 메뉴 폴백
      renderNav([
        { label: '환경설정', href: 'config/', icon: 'settings' },
        { label: '문서',     href: 'posts/',  icon: 'document'  },
        { label: '도구',     href: 'tools/',  icon: 'tool'      },
      ]);
    }
  }

  /* ── 이벤트 바인딩 ──────────────────────────────────── */
  function init() {
    // 테마 토글
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('themeToggleTop')?.addEventListener('click', toggleTheme);

    // 사이드패널
    document.getElementById('openSidepanel')?.addEventListener('click', e => {
      e.preventDefault(); openSidepanel();
    });
    document.getElementById('sidepanelOverlay')?.addEventListener('click', closeSidepanel);

    // ESC 키
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSidepanel();
    });

    // 메뉴 로드
    loadMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
