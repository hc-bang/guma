/**
 * GUMA™ Core Client Module
 * - 로컬 환경(localhost, 127.0.0.1, 192.168.x.x) 직결 보장
 * - 외부(GitHub Pages) 접속 시 Neon DB를 통한 Cloudflare 터널 자동 감지(Auto-discovery)
 * - 기기별/개인별 프로필 관리 지원
 */

(function(window) {
  'use strict';

  // 로컬 저장소 키
  const STORAGE_KEYS = {
    TUNNEL_CACHE: 'guma_discovered_tunnel_url',
    ACTIVE_PROFILE: 'guma_active_profile',
    PROFILES_CACHE: 'guma_cached_profiles'
  };

  /**
   * 접속 도메인을 검사하여 로컬 환경인지 여부를 판별합니다.
   */
  function isLocalEnvironment() {
    const host = window.location.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.endsWith('.trycloudflare.com')
    );
  }

  /**
   * 동기적으로 현재 사용 가능한 백엔드 기본 URL을 즉시 반환합니다.
   * (로컬 환경일 때는 무조건 window.location.origin)
   */
  function getApiBaseSync() {
    if (isLocalEnvironment()) {
      return window.location.origin;
    }
    const cached = localStorage.getItem(STORAGE_KEYS.TUNNEL_CACHE);
    return (cached && cached.trim()) ? cached.trim().replace(/\/+$/, '') : window.location.origin;
  }

  let discoveryPromise = null;

  /**
   * 외부 GitHub Pages 접속 시 Git으로 동기화된 tunnel.json을 읽어 백엔드 터널 URL을 자동 감지합니다.
   */
  async function discoverActiveTunnel() {
    if (isLocalEnvironment()) {
      return window.location.origin;
    }

    if (discoveryPromise) {
      return discoveryPromise;
    }

    discoveryPromise = (async () => {
      try {
        const rootPrefix = (window.GUMA && window.GUMA.root) ? window.GUMA.root : (window.location.pathname.includes('/guma/') ? '/guma/' : './');
        const tunnelJsonUrl = `${rootPrefix.replace(/\/+$/, '')}/tunnel.json?_t=${Date.now()}`;

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(tunnelJsonUrl, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(tid);

        if (res.ok) {
          const data = await res.json();
          if (data && data.url && data.status === 'online') {
            const clean = String(data.url).trim().replace(/\/+$/, '');
            localStorage.setItem(STORAGE_KEYS.TUNNEL_CACHE, clean);
            return clean;
          } else if (data && data.status === 'offline') {
            localStorage.removeItem(STORAGE_KEYS.TUNNEL_CACHE);
            return window.location.origin;
          }
        }
      } catch (e) {
        console.warn('[GUMA Core] tunnel.json 자동 감지 지연/실패:', e);
      } finally {
        discoveryPromise = null;
      }
      return getApiBaseSync();
    })();

    return discoveryPromise;
  }

  /**
   * 백엔드 API 주소를 비동기로 확실히 보장합니다.
   */
  async function ensureApiBase() {
    if (isLocalEnvironment()) {
      return window.location.origin;
    }
    const cached = localStorage.getItem(STORAGE_KEYS.TUNNEL_CACHE);
    if (cached && cached.trim()) {
      return cached.trim().replace(/\/+$/, '');
    }
    return await discoverActiveTunnel();
  }

  /**
   * 현재 기기에서 활성화된 프로필 ID를 반환합니다. (기본값: 'default')
   */
  function getActiveProfileId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE) || 'default';
  }

  /**
   * 현재 기기의 활성 프로필을 변경합니다.
   */
  function setActiveProfileId(profileId) {
    if (profileId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, String(profileId).trim());
    }
  }

  /**
   * 백엔드 API를 통해 현재 활성 프로필의 특정 설정(topBookmarks, bookmarks, youtube_channels 등)을 조회합니다.
   * - 타임아웃(3.5초) 제어 및 일시적 터널 지연 시 최대 2회 자동 재시도 탑재
   */
  async function fetchProfileConfig(configType, maxRetries = 2) {
    const profileId = getActiveProfileId();
    const apiBase = await ensureApiBase();

    // GitHub Pages 등 정적 호스팅 환경에서 터널이 미확정된 채 자기 자신을 호출하는 오류 방지
    if (!isLocalEnvironment() && apiBase === window.location.origin) {
      console.warn(`[GUMA Core] 터널 주소 미확보로 프로필(${profileId}) ${configType} 조회 대기 건너뜀`);
      return null;
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`${apiBase}/api/profiles/${profileId}/config/${configType}`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        clearTimeout(tid);

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data !== null && json.data !== undefined) {
            try {
              localStorage.setItem(`guma_cache_${configType}_${profileId}`, JSON.stringify(json.data));
            } catch {}
            return json.data;
          }
        } else if (res.status === 404) {
          // 데이터가 실제로 없는 정상 응답인 경우 재시도 불필요
          return null;
        }
      } catch (err) {
        if (attempt < maxRetries) {
          // 일시적 터널 핑 지연/핸드셰이크 대기 (300ms, 600ms)
          await new Promise(r => setTimeout(r, (attempt + 1) * 300));
          continue;
        }
        console.warn(`[GUMA Core] 프로필(${profileId}) ${configType} 조회 실패 (재시도 완료):`, err);
      }
    }
    return null;
  }

  /**
   * 백엔드 API를 통해 현재 활성 프로필의 설정을 Neon DB에 영구 저장합니다.
   * - 저장 즉시 로컬 캐시를 갱신하여 환경설정 변경 후 다른 페이지로 이동 시 0ms 즉각 반영 보장
   */
  async function saveProfileConfig(configType, data) {
    const profileId = getActiveProfileId();

    // 1. 브라우저 로컬 캐시 즉시 갱신 (환경설정 변경사항 즉시 동기화)
    try {
      localStorage.setItem(`guma_cache_${configType}_${profileId}`, JSON.stringify(data));
      // 구버전 키 호환
      if (configType === 'topBookmarks') {
        const topKey = (profileId === 'default') ? 'topBookmarks' : `topBookmarks_${profileId}`;
        localStorage.setItem(topKey, JSON.stringify(data));
      } else if (configType === 'engines') {
        localStorage.setItem('searchEngines', JSON.stringify(data));
      }
    } catch {}

    // 2. 백엔드 Neon DB 클라우드 영구 저장
    const apiBase = await ensureApiBase();
    try {
      const res = await fetch(`${apiBase}/api/profiles/${profileId}/config/${configType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data })
      });
      return res.ok;
    } catch (err) {
      console.warn(`[GUMA Core] 프로필(${profileId}) ${configType} 저장 실패:`, err);
      return false;
    }
  }

  /**
   * 백엔드(Neon DB)로부터 등록된 모든 프로필 목록을 동적으로 조회합니다.
   * 네트워크 실패 시 로컬 캐시 또는 안전한 최소 기본값을 반환합니다.
   */
  async function loadProfiles() {
    let cached = [];
    try {
      cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES_CACHE) || '[]');
    } catch {}

    const apiBase = getApiBaseSync();
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${apiBase}/api/profiles`, { signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.profiles) && json.profiles.length > 0) {
          const mapped = json.profiles.map(p => ({
            id: p.id,
            name: p.name,
            icon: p.id === 'default' ? '🖥️' : (p.id === 'mobile' ? '📱' : '🏷️'),
            is_default: !!p.is_default
          }));
          try { localStorage.setItem(STORAGE_KEYS.PROFILES_CACHE, JSON.stringify(mapped)); } catch {}
          return mapped;
        }
      }
    } catch (e) {}

    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }

    return [
      { id: 'default', name: '기본 (PC)', icon: '🖥️', is_default: true },
      { id: 'mobile',  name: '모바일',    icon: '📱', is_default: false }
    ];
  }

  // 전역 GumaCore 네임스페이스 등록
  window.GumaCore = {
    isLocal: isLocalEnvironment,
    getApiBase: getApiBaseSync,
    ensureApiBase: ensureApiBase,
    discoverActiveTunnel: discoverActiveTunnel,
    getActiveProfile: getActiveProfileId,
    setActiveProfile: setActiveProfileId,
    fetchProfileConfig: fetchProfileConfig,
    saveProfileConfig: saveProfileConfig,
    loadProfiles: loadProfiles
  };

})(window);
