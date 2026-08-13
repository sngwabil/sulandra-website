(() => {
  'use strict';

  const CLIENT_STATION_PRESET = 'clientStation';
  const FULLSCREEN_KEY = 'spire:accessibility:fullscreen';

  function applyClientStationTheme() {
    if (window.SpireUserPreferences?.getPreference?.('preset') !== CLIENT_STATION_PRESET) return;
    const root = document.documentElement;
    root.style.setProperty('--title-bg', '#0f172a');
    root.style.setProperty('--toolbar-bg', '#990000');
    root.style.setProperty('--main-bg', '#eaf7fb');
    root.style.setProperty('--workspace-card-bg', '#ffffff');
    root.style.setProperty('--text-color', '#173c50');
    root.style.setProperty('--spire-title-bg', '#0f172a');
    root.style.setProperty('--spire-toolbar-bg', '#990000');
    root.style.setProperty('--spire-page-bg', '#eaf7fb');
    root.style.setProperty('--spire-card-bg', '#ffffff');
    root.style.setProperty('--spire-text', '#173c50');
    root.dataset.spirePreset = CLIENT_STATION_PRESET;
  }

  function preserveFullscreenIntent() {
    if (document.fullscreenElement) {
      try { localStorage.setItem(FULLSCREEN_KEY, '1'); } catch {}
    }
  }

  function installFullscreenNavigationBridge() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link || !document.fullscreenElement) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/spire/')) preserveFullscreenIntent();
    }, true);
  }

  applyClientStationTheme();
  installFullscreenNavigationBridge();
  window.addEventListener('pageshow', applyClientStationTheme);
})();