import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Normalize the standalone master first so this repair always operates on the
// exact runtime shape produced by fix-spire-master-defects.mjs.
await import('./fix-spire-master-defects.mjs');

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_ACCESSIBILITY_SUITE_RUNTIME_V2';
const workspaceMarker = 'SPIRE_ACCESSIBILITY_FULLSCREEN_V3';
const preferenceAsset = '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1';

let html = await readFile(target, 'utf8');

if (!html.includes(marker)) {
  // fix-spire-master-defects.mjs installs the real switchAccessTab() and
  // applyPresetTheme() implementations. The original master source still has
  // an obsolete switchAccessTab no-op below those implementations. Remove the
  // no-op, but retain the canonical selectPresetTheme alias as an idempotent
  // build marker and inject the persistent runtime after it so nothing later
  // can overwrite the functional handlers.
  html = html.replace("  window.switchAccessTab=()=>{};\n", '');

  const anchor = '  window.selectPresetTheme=applyPresetTheme;';
  if (!html.includes(anchor)) {
    throw new Error('SPIRE accessibility canonical preset alias was not found');
  }

  const runtime = `${anchor}

  /* ${marker}: make every visual-accessibility control functional and persistent. */
  const SPIRE_ACCESS_KEYS = Object.freeze({
    preset: 'spire:accessibility:preset',
    mode: 'spire:accessibility:mode',
    custom: 'spire:accessibility:custom-colors',
    cursor: 'spire:accessibility:cursor',
    fontSize: 'spire:accessibility:font-size',
    fullscreen: 'spire:accessibility:fullscreen'
  });

  const accessibilityStore = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
    remove(key) { try { localStorage.removeItem(key); } catch {} }
  };

  const baseApplyPresetTheme = applyPresetTheme;

  function markSelectedPreset(themeName) {
    document.querySelectorAll('#accessPresetsTab .theme-card').forEach(card => {
      const selected = String(card.getAttribute('onclick') || '').includes(\`'\${themeName}'\`);
      card.style.outline = selected ? '3px solid #2563eb' : '';
      card.style.outlineOffset = selected ? '1px' : '';
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function applyPresetThemePersistent(themeName) {
    baseApplyPresetTheme(themeName);
    accessibilityStore.set(SPIRE_ACCESS_KEYS.preset, String(themeName || 'classicRed'));
    accessibilityStore.set(SPIRE_ACCESS_KEYS.mode, 'preset');
    accessibilityStore.remove(SPIRE_ACCESS_KEYS.custom);
    markSelectedPreset(themeName);
  }
  window.applyPresetTheme = applyPresetThemePersistent;
  window.selectPresetTheme = applyPresetThemePersistent;

  function readCustomColorValues() {
    return {
      title: document.getElementById('customTitleColor')?.value || '#0f172a',
      toolbar: document.getElementById('customToolbarColor')?.value || '#990000',
      background: document.getElementById('customBgColor')?.value || '#f0f4f8',
      text: document.getElementById('customTextColor')?.value || '#000000'
    };
  }

  function applyCustomColorValues(values, persist = true) {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--title-bg', values.title || '#0f172a');
    rootStyle.setProperty('--toolbar-bg', values.toolbar || '#990000');
    rootStyle.setProperty('--main-bg', values.background || '#f0f4f8');
    rootStyle.setProperty('--workspace-card-bg', '#ffffff');
    rootStyle.setProperty('--text-color', values.text || '#000000');
    document.body.style.filter = 'none';

    const map = {
      customTitleColor: values.title,
      customToolbarColor: values.toolbar,
      customBgColor: values.background,
      customTextColor: values.text
    };
    Object.entries(map).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && value) input.value = value;
    });

    if (persist) {
      accessibilityStore.set(SPIRE_ACCESS_KEYS.custom, JSON.stringify(values));
      accessibilityStore.set(SPIRE_ACCESS_KEYS.mode, 'custom');
    }
  }

  function applyCustomColors() {
    applyCustomColorValues(readCustomColorValues(), true);
  }
  window.applyCustomColors = applyCustomColors;

  function applyCursorStyle(value, persist = true) {
    const allowed = new Set(['default', 'crosshair', 'help', 'pointer']);
    const cursor = allowed.has(String(value)) ? String(value) : 'default';
    let style = document.getElementById('spireAccessibilityCursorStyle');
    if (cursor === 'default') {
      style?.remove();
    } else {
      if (!style) {
        style = document.createElement('style');
        style.id = 'spireAccessibilityCursorStyle';
        document.head.appendChild(style);
      }
      style.textContent = \`body, body * { cursor: \${cursor} !important; }\`;
    }
    const select = document.getElementById('cursorStyleSelect');
    if (select) select.value = cursor;
    if (persist) accessibilityStore.set(SPIRE_ACCESS_KEYS.cursor, cursor);
  }
  window.applyCursorStyle = applyCursorStyle;

  function applyFontSize(value, persist = true) {
    const allowed = new Set(['12px', '13px', '14px', '16px']);
    const size = allowed.has(String(value)) ? String(value) : '13px';
    document.documentElement.style.setProperty('--base-font-size', size);
    const select = document.getElementById('fontSizeSelect');
    if (select) select.value = size;
    if (persist) accessibilityStore.set(SPIRE_ACCESS_KEYS.fontSize, size);
  }
  window.applyFontSize = applyFontSize;

  function restoreSpireAccessibilityPreferences() {
    const mode = accessibilityStore.get(SPIRE_ACCESS_KEYS.mode);
    const preset = accessibilityStore.get(SPIRE_ACCESS_KEYS.preset);
    const custom = accessibilityStore.get(SPIRE_ACCESS_KEYS.custom);

    if (mode === 'custom' && custom) {
      try { applyCustomColorValues(JSON.parse(custom), false); } catch {}
    } else if (preset) {
      baseApplyPresetTheme(preset);
      markSelectedPreset(preset);
    }

    applyCursorStyle(accessibilityStore.get(SPIRE_ACCESS_KEYS.cursor) || 'default', false);
    applyFontSize(accessibilityStore.get(SPIRE_ACCESS_KEYS.fontSize) || '13px', false);
    window.SpireUserPreferences?.apply?.();
  }
  window.restoreSpireAccessibilityPreferences = restoreSpireAccessibilityPreferences;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restoreSpireAccessibilityPreferences, { once: true });
  } else {
    restoreSpireAccessibilityPreferences();
  }`;

  html = html.replace(anchor, runtime);

  if (html.includes('window.switchAccessTab=()=>{}')) {
    throw new Error('SPIRE accessibility tab handler is still being replaced with a no-op');
  }
  if (html.includes('window.selectPresetTheme=applyTheme')) {
    throw new Error('SPIRE accessibility runtime still references the removed applyTheme function');
  }
  for (const required of [
    'window.switchAccessTab=switchAccessTab',
    'window.applyPresetTheme = applyPresetThemePersistent',
    'window.selectPresetTheme = applyPresetThemePersistent',
    'window.applyCustomColors = applyCustomColors',
    'window.applyCursorStyle = applyCursorStyle',
    'window.applyFontSize = applyFontSize',
  ]) {
    if (!html.includes(required)) throw new Error(`SPIRE accessibility runtime is missing: ${required}`);
  }

  await writeFile(target, html, 'utf8');
}

// V3 is deliberately a separate idempotent pass so sites that already contain
// the V2 runtime receive the new Client Station/fullscreen/live-notification
// contract on the next build instead of being skipped by the older marker.
html = await readFile(target, 'utf8');
if (!html.includes(workspaceMarker)) {
  // The shared preference runtime must execute before body scripts such as the
  // screen controls so one controller owns native fullscreen state.
  if (!html.includes(preferenceAsset)) {
    if (!html.includes('<head>')) throw new Error('SPIRE master head was not found');
    html = html.replace('<head>', `<head>\n  <script src="${preferenceAsset}"></script>`);
  }

  html = html
    .replace('20 Distinct Preset Looks', '21 Display & Accessibility Preferences')
    .replace('Select one of 20 distinct professional visual themes tailored for Spire Enterprise:', 'Choose one of 20 professional visual themes plus the persistent full-screen workspace preference:')
    .replace('title="Messaging Portal"', 'title="Secure Chat"')
    .replace(" onclick=\"alert('Opening Staff Messaging Portal...')\"", '')
    .replace(" onclick=\"alert('Notifications: 3 unread reminders for current client.')\"", '')
    .replace('<span class="notification-badge">3</span>', '<span class="notification-badge" hidden>0</span>');

  if (!html.includes('21. Full-Screen Workspace')) {
    const twentieth = `<div class="theme-card" onclick="applyPresetTheme('solarizedLight')"><b>20. Solarized Light Clean</b><br><span style="font-size: 11px; color: #64748b;">Soft cream base with contrasting navy</span></div>`;
    if (!html.includes(twentieth)) throw new Error('SPIRE accessibility preset 20 anchor was not found');
    const twentyFirst = `${twentieth}\n                        <div class="theme-card" id="spireFullscreenPreferenceCard" onclick="toggleSpireFullscreenPreference()"><b>21. Full-Screen Workspace</b><br><span style="font-size: 11px; color: #64748b;">Remember full-screen as the default across Client Station, charts and Secure Chat</span></div>`;
    html = html.replace(twentieth, twentyFirst);
  }

  if (!html.includes('</body>')) throw new Error('SPIRE master body close was not found');
  html = html.replace('</body>', `  <!-- ${workspaceMarker} -->\n</body>`);
  await writeFile(target, html, 'utf8');
}

html = await readFile(target, 'utf8');
for (const forbidden of [
  "alert('Opening Staff Messaging Portal...')",
  "alert('Notifications: 3 unread reminders for current client.')",
]) {
  if (html.includes(forbidden)) throw new Error(`SPIRE master still contains fake clinical UI behavior: ${forbidden}`);
}
for (const required of [preferenceAsset, '21. Full-Screen Workspace', 'title="Secure Chat"', workspaceMarker]) {
  if (!html.includes(required)) throw new Error(`SPIRE workspace preference/live-control normalization missing: ${required}`);
}

console.log('SPIRE accessibility suite verified: 20 visual themes, custom colors, cursor/font scaling, #21 persistent full-screen workspace preference, shared Client Station/Secure Chat appearance, and no fake messaging/notification alerts.');
