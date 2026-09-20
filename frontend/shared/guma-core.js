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

  /**
   * 외부 GitHub Pages 접속 시 Neon DB 또는 백엔드로부터 최신 터널 주소를 자동 조회하여 갱신합니다.
   */
  async function discoverActiveTunnel(neonConfig = null) {
    if (isLocalEnvironment()) {
      return window.location.origin;
    }

    // 1. Neon DB Serverless HTTP SQL API를 통한 직접 조회 (설정 제공 시)
    if (neonConfig && neonConfig.host && neonConfig.token) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://${neonConfig.host}/sql`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${neonConfig.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: "SELECT value FROM system_config WHERE key = 'tunnel_url' LIMIT 1;"
          }),
          signal: controller.signal
        });
        clearTimeout(tid);

        if (res.ok) {
          const data = await res.json();
          const foundUrl = data?.rows?.[0]?.value || data?.rows?.[0]?.[0];
          if (foundUrl && typeof foundUrl === 'string' && foundUrl.startsWith('http')) {
            const clean = foundUrl.trim().replace(/\/+$/, '');
            localStorage.setItem(STORAGE_KEYS.TUNNEL_CACHE, clean);
            return clean;
          }
        }
      } catch (e) {
        console.warn('[GUMA Core] Neon DB 터널 자동 감지 건너뜀:', e);
      }
    }

    return getApiBaseSync();
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
   */
  async function fetchProfileConfig(configType) {
    const profileId = getActiveProfileId();
    const apiBase = getApiBaseSync();
    try {
      const res = await fetch(`${apiBase}/api/profiles/${profileId}/config/${configType}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data !== null && json.data !== undefined) {
          return json.data;
        }
      }
    } catch (err) {
      console.warn(`[GUMA Core] 프로필(${profileId}) ${configType} 조회 실패:`, err);
    }
    return null;
  }

  /**
   * 백엔드 API를 통해 현재 활성 프로필의 설정을 Neon DB에 영구 저장합니다.
   */
  async function saveProfileConfig(configType, data) {
    const profileId = getActiveProfileId();
    const apiBase = getApiBaseSync();
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
    discoverActiveTunnel: discoverActiveTunnel,
    getActiveProfile: getActiveProfileId,
    setActiveProfile: setActiveProfileId,
    fetchProfileConfig: fetchProfileConfig,
    saveProfileConfig: saveProfileConfig,
    loadProfiles: loadProfiles
  };

})(window);
