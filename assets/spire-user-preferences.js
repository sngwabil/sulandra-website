(() => {
  'use strict';

  // SPIRE_USER_WORKSPACE_PREFERENCES_V2
  // Shared by the chart, Client Station and Secure Chat. It uses the existing
  // accessibility storage contract and enhances the master profile suite at
  // runtime instead of rewriting the 200KB master HTML during every build.
  const KEYS = Object.freeze({
    preset: 'spire:accessibility:preset',
    mode: 'spire:accessibility:mode',
    custom: 'spire:accessibility:custom-colors',
    cursor: 'spire:accessibility:cursor',
    fontSize: 'spire:accessibility:font-size',
    fullscreen: 'spire:accessibility:fullscreen'
  });

  const PRESETS = Object.freeze({
    classicRed: { title:'#0f172a', toolbar:'#990000', background:'#f0f4f8', card:'#ffffff', text:'#000000' },
    clinicalDark: { title:'#020617', toolbar:'#1e293b', background:'#0f172a', card:'#1e293b', text:'#f8fafc' },
    midnightSlate: { title:'#1e293b', toolbar:'#334155', background:'#475569', card:'#1e293b', text:'#f1f5f9' },
    emeraldHealth: { title:'#064e3b', toolbar:'#047857', background:'#ecfdf5', card:'#ffffff', text:'#064e3b' },
    oceanBlue: { title:'#1e40af', toolbar:'#2563eb', background:'#eff6ff', card:'#ffffff', text:'#1e3a8a' },
    warmSepia: { title:'#78350f', toolbar:'#b45309', background:'#fef3c7', card:'#fffbeb', text:'#451a03' },
    epicTeal: { title:'#0f766e', toolbar:'#115e59', background:'#f0fdfa', card:'#ffffff', text:'#134e4a' },
    monoHighContrast: { title:'#000000', toolbar:'#333333', background:'#ffffff', card:'#ffffff', text:'#000000' },
    colorblindSafe: { title:'#1d4ed8', toolbar:'#b45309', background:'#fef9c3', card:'#ffffff', text:'#1e293b' },
    vibrantLavender: { title:'#581c87', toolbar:'#7e22ce', background:'#f3e8ff', card:'#ffffff', text:'#3b0764' },
    crimsonNight: { title:'#450a0a', toolbar:'#7f1d1d', background:'#18181b', card:'#27272a', text:'#fafafa' },
    arcticFrost: { title:'#164e63', toolbar:'#0891b2', background:'#ecfeff', card:'#ffffff', text:'#164e63' },
    goldenSunrise: { title:'#713f12', toolbar:'#ca8a04', background:'#fefce8', card:'#ffffff', text:'#422006' },
    cyberpunkNeon: { title:'#111827', toolbar:'#6d28d9', background:'#030712', card:'#111827', text:'#e0f2fe' },
    retroVintage: { title:'#57534e', toolbar:'#78716c', background:'#f5f5dc', card:'#fffdf5', text:'#3f3f2f' },
    steelGray: { title:'#1f2937', toolbar:'#4b5563', background:'#e5e7eb', card:'#f9fafb', text:'#111827' },
    coralSunset: { title:'#9f1239', toolbar:'#ea580c', background:'#fff1f2', card:'#ffffff', text:'#881337' },
    mintFresh: { title:'#065f46', toolbar:'#0d9488', background:'#ecfdf5', card:'#ffffff', text:'#064e3b' },
    royalAmethyst: { title:'#4c1d95', toolbar:'#6d28d9', background:'#f5f3ff', card:'#ffffff', text:'#3b0764' },
    solarizedLight: { title:'#073642', toolbar:'#268bd2', background:'#fdf6e3', card:'#eee8d5', text:'#073642' }
  });

  const get = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const set = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
  const parseJson = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };

  function currentPalette() {
    const mode = get(KEYS.mode);
    if (mode === 'custom') {
      const custom = parseJson(get(KEYS.custom));
      if (custom) return {
        title: custom.title || '#0f172a', toolbar: custom.toolbar || '#990000',
        background: custom.background || '#f0f4f8', card:'#ffffff', text: custom.text || '#000000'
      };
    }
    return PRESETS[get(KEYS.preset) || 'classicRed'] || PRESETS.classicRed;
  }

  function applyVisualPreferences() {
    const palette = currentPalette();
    const root = document.documentElement;
    root.style.setProperty('--title-bg', palette.title);
    root.style.setProperty('--toolbar-bg', palette.toolbar);
    root.style.setProperty('--main-bg', palette.background);
    root.style.setProperty('--workspace-card-bg', palette.card);
    root.style.setProperty('--text-color', palette.text);
    root.style.setProperty('--spire-title-bg', palette.title);
    root.style.setProperty('--spire-toolbar-bg', palette.toolbar);
    root.style.setProperty('--spire-page-bg', palette.background);
    root.style.setProperty('--spire-card-bg', palette.card);
    root.style.setProperty('--spire-text', palette.text);

    const fontSize = get(KEYS.fontSize) || '13px';
    if (['12px','13px','14px','16px'].includes(fontSize)) root.style.setProperty('--base-font-size', fontSize);

    const cursor = get(KEYS.cursor) || 'default';
    let style = document.getElementById('spireSharedCursorStyle');
    if (cursor === 'default') style?.remove();
    else if (['crosshair','help','pointer'].includes(cursor)) {
      if (!style) { style = document.createElement('style'); style.id = 'spireSharedCursorStyle'; document.head.appendChild(style); }
      style.textContent = `body, body * { cursor:${cursor} !important; }`;
    }
    root.dataset.spirePreset = get(KEYS.preset) || 'classicRed';
  }

  function fullscreenPreferred() {
    const stored = get(KEYS.fullscreen);
    return stored == null ? true : stored !== '0';
  }

  function syncFullscreenPreferenceCard() {
    const card = document.getElementById('spireFullscreenPreferenceCard');
    if (!card) return;
    const active = fullscreenPreferred();
    card.setAttribute('aria-pressed', active ? 'true' : 'false');
    card.style.outline = active ? '3px solid #2563eb' : '';
    card.style.outlineOffset = active ? '1px' : '';
    const status = card.querySelector('[data-fullscreen-status]');
    if (status) status.textContent = active ? 'Preferred on' : 'Preferred off';
  }

  function syncFullscreenButtons() {
    const active = Boolean(document.fullscreenElement);
    document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach((button) => {
      button.textContent = active ? '🗗' : '⛶';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Exit full screen' : 'Open SPIRE full screen');
      button.setAttribute('title', active ? 'Exit full screen' : (fullscreenPreferred() ? 'Full screen preferred' : 'Open full screen'));
    });
    syncFullscreenPreferenceCard();
  }

  async function requestFullscreen({ persist = true } = {}) {
    if (persist) set(KEYS.fullscreen, '1');
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) { syncFullscreenButtons(); return Boolean(document.fullscreenElement); }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      syncFullscreenButtons();
      return true;
    } catch {
      syncFullscreenButtons();
      return false;
    }
  }

  async function exitFullscreen({ persist = true } = {}) {
    if (persist) set(KEYS.fullscreen, '0');
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
    syncFullscreenButtons();
  }

  async function toggleFullscreenPreference() {
    if (document.fullscreenElement) return exitFullscreen({ persist: true });
    if (fullscreenPreferred()) {
      // If full-screen is preferred but the browser left it during navigation,
      // this user gesture restores it rather than disabling the preference.
      return requestFullscreen({ persist: true });
    }
    set(KEYS.fullscreen, '1');
    return requestFullscreen({ persist: false });
  }

  function armPreferredFullscreen() {
    if (!fullscreenPreferred() || document.fullscreenElement) return;
    // Browser security forbids silent native fullscreen after navigation/reload.
    // We try immediately and, when blocked, honor the saved preference on the
    // user's very next gesture. There is no alert/popup and no second click.
    requestFullscreen({ persist: false }).catch(() => {});
    const reenter = () => {
      if (fullscreenPreferred() && !document.fullscreenElement) requestFullscreen({ persist: false }).catch(() => {});
      document.removeEventListener('pointerdown', reenter, true);
      document.removeEventListener('keydown', reenter, true);
    };
    document.addEventListener('pointerdown', reenter, true);
    document.addEventListener('keydown', reenter, true);
  }

  function bindFullscreenControls() {
    document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach((button) => {
      if (button.dataset.spireFullscreenBound === 'true') return;
      button.dataset.spireFullscreenBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        toggleFullscreenPreference().catch(() => {});
      });
    });
    syncFullscreenButtons();
  }

  function savePresetFromCard(card) {
    const handler = String(card?.getAttribute('onclick') || '');
    const match = handler.match(/applyPresetTheme\(['"]([^'"]+)['"]\)/);
    if (!match || !PRESETS[match[1]]) return;
    set(KEYS.preset, match[1]);
    set(KEYS.mode, 'preset');
    try { localStorage.removeItem(KEYS.custom); } catch {}
    queueMicrotask(applyVisualPreferences);
  }

  function saveCustomColors() {
    const values = {
      title: document.getElementById('customTitleColor')?.value || '#0f172a',
      toolbar: document.getElementById('customToolbarColor')?.value || '#990000',
      background: document.getElementById('customBgColor')?.value || '#f0f4f8',
      text: document.getElementById('customTextColor')?.value || '#000000'
    };
    set(KEYS.custom, JSON.stringify(values));
    set(KEYS.mode, 'custom');
    applyVisualPreferences();
  }

  function installMasterEnhancements() {
    const presetTabButton = document.getElementById('tabPresetBtn');
    if (presetTabButton) presetTabButton.textContent = '21 Display & Accessibility Preferences';

    const presetTab = document.getElementById('accessPresetsTab');
    if (presetTab) {
      const intro = [...presetTab.querySelectorAll('p')].find((node) => /20 distinct professional visual themes/i.test(node.textContent || ''));
      if (intro) intro.textContent = 'Choose one of 20 professional visual themes plus the persistent full-screen workspace preference:';

      presetTab.querySelectorAll('.theme-card').forEach((card) => {
        if (card.dataset.spirePreferenceBound === 'true') return;
        card.dataset.spirePreferenceBound = 'true';
        card.addEventListener('click', () => savePresetFromCard(card));
      });

      if (!document.getElementById('spireFullscreenPreferenceCard')) {
        const grid = presetTab.querySelector('.theme-grid') || presetTab.querySelector('div[style*="grid-template-columns"]') || presetTab.lastElementChild;
        if (grid) {
          const card = document.createElement('div');
          card.className = 'theme-card';
          card.id = 'spireFullscreenPreferenceCard';
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.innerHTML = '<b>21. Full-Screen Workspace</b><br><span style="font-size:11px;color:#64748b">Remember full-screen as the default across Client Station, charts and Secure Chat · <span data-fullscreen-status>Preferred on</span></span>';
          const activate = (event) => {
            if (event?.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
            event?.preventDefault?.();
            if (fullscreenPreferred()) exitFullscreen({ persist: true }).catch(() => {});
            else requestFullscreen({ persist: true }).catch(() => {});
          };
          card.addEventListener('click', activate);
          card.addEventListener('keydown', activate);
          grid.appendChild(card);
        }
      }
    }

    ['customTitleColor','customToolbarColor','customBgColor','customTextColor'].forEach((id) => {
      const input = document.getElementById(id);
      if (input && input.dataset.spirePreferenceBound !== 'true') {
        input.dataset.spirePreferenceBound = 'true';
        input.addEventListener('change', saveCustomColors);
      }
    });

    const cursor = document.getElementById('cursorStyleSelect');
    if (cursor && cursor.dataset.spirePreferenceBound !== 'true') {
      cursor.dataset.spirePreferenceBound = 'true';
      cursor.value = get(KEYS.cursor) || cursor.value || 'default';
      cursor.addEventListener('change', () => { set(KEYS.cursor, cursor.value); applyVisualPreferences(); });
    }
    const font = document.getElementById('fontSizeSelect');
    if (font && font.dataset.spirePreferenceBound !== 'true') {
      font.dataset.spirePreferenceBound = 'true';
      font.value = get(KEYS.fontSize) || font.value || '13px';
      font.addEventListener('change', () => { set(KEYS.fontSize, font.value); applyVisualPreferences(); });
    }

    // Remove retired fake clinical actions even before the live chart controls bind.
    const message = document.getElementById('messagingIconBtn');
    if (message) {
      message.removeAttribute('onclick');
      message.setAttribute('title', 'Secure Chat');
      message.setAttribute('aria-label', 'Secure Chat');
    }
    const bell = document.getElementById('notificationBellBtn');
    if (bell) bell.removeAttribute('onclick');
    const badge = bell?.querySelector('.notification-badge');
    if (badge && !badge.dataset.liveCount) { badge.textContent = '0'; badge.hidden = true; }

    syncFullscreenPreferenceCard();
    bindFullscreenControls();
  }

  function applyAll() {
    applyVisualPreferences();
    installMasterEnhancements();
    bindFullscreenControls();
    armPreferredFullscreen();
  }

  window.SpireUserPreferences = Object.freeze({
    keys: KEYS,
    presets: PRESETS,
    apply: applyAll,
    applyVisualPreferences,
    installMasterEnhancements,
    fullscreenPreferred,
    requestFullscreen,
    exitFullscreen,
    toggleFullscreenPreference,
    syncFullscreenButtons,
    setFullscreenPreferred(value) { set(KEYS.fullscreen, value ? '1' : '0'); syncFullscreenButtons(); },
  });
  window.toggleSpireFullscreenPreference = toggleFullscreenPreference;

  document.addEventListener('fullscreenchange', syncFullscreenButtons);
  window.addEventListener('storage', (event) => {
    if (Object.values(KEYS).includes(event.key)) applyVisualPreferences();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  else applyAll();
})();
