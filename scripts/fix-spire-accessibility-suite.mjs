import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve the established master profile/accessibility implementation. This pass
// only makes it persistent, adds the requested Client Station visual theme as #21,
// and removes the retired fake messaging/notification handlers.
await import('./fix-spire-master-defects.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_ACCESSIBILITY_SUITE_RUNTIME_V4';
const preferenceAsset = '/assets/spire-user-preferences.js?v=20260813-exact-workflow-1';
let html = await readFile(target, 'utf8');

html = html
  .replaceAll('  window.switchAccessTab=()=>{};\n', '')
  .replaceAll('  window.selectPresetTheme=applyTheme;\n', '  window.selectPresetTheme=applyPresetTheme;\n')
  .replace('20 Distinct Preset Looks', '21 Distinct Preset Looks')
  .replace('Select one of 20 distinct professional visual themes tailored for Spire Enterprise:', 'Select one of 21 distinct professional visual themes tailored for S.P.I.R.E. Enterprise:')
  .replace('title="Messaging Portal"', 'title="Secure Chat"')
  .replace(" onclick=\"alert('Opening Staff Messaging Portal...')\"", '')
  .replace(" onclick=\"alert('Notifications: 3 unread reminders for current client.')\"", '')
  .replace('<span class="notification-badge">3</span>', '<span class="notification-badge" hidden>0</span>');

if (!html.includes('window.selectPresetTheme=applyPresetTheme;')) {
  const aliasAnchor = '  window.applyPresetTheme=applyPresetTheme;';
  if (!html.includes(aliasAnchor)) throw new Error('SPIRE accessibility applyPresetTheme alias anchor is missing');
  html = html.replace(aliasAnchor, `${aliasAnchor}\n  window.selectPresetTheme=applyPresetTheme;`);
}

if (!html.includes(preferenceAsset)) {
  if (!html.includes('</head>')) throw new Error('SPIRE master head close is missing');
  html = html.replace('</head>', `  <script src="${preferenceAsset}"></script>\n</head>`);
}

if (!html.includes('21. Client Station Classic')) {
  const twentieth = `<div class="theme-card" onclick="applyPresetTheme('solarizedLight')"><b>20. Solarized Light Clean</b><br><span style="font-size: 11px; color: #64748b;">Soft cream base with contrasting navy</span></div>`;
  if (!html.includes(twentieth)) throw new Error('SPIRE accessibility preset 20 anchor is missing');
  const twentyFirst = `${twentieth}\n                        <div class="theme-card" onclick="applyPresetTheme('clientStation')"><b>21. Client Station Classic</b><br><span style="font-size: 11px; color: #64748b;">The red, cyan and ice-blue Client Station workstation look</span></div>`;
  html = html.replace(twentieth, twentyFirst);
}

if (!html.includes(marker)) {
  const anchor = '  window.selectPresetTheme=applyPresetTheme;';
  if (!html.includes(anchor)) throw new Error('SPIRE accessibility persistent-runtime anchor is missing');
  const runtime = `${anchor}

  /* ${marker}: authenticated-user persistence for all 21 visual themes. */
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
    if (themeName !== 'clientStation') baseApplyPresetTheme(themeName);
    if (window.SpireUserPreferences?.setPreset) {
      window.SpireUserPreferences.setPreset(themeName);
    } else {
      try {
        localStorage.setItem('spire:accessibility:preset', String(themeName || 'classicRed'));
        localStorage.setItem('spire:accessibility:mode', 'preset');
      } catch {}
    }
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

  function applyCustomColors() {
    const values = readCustomColorValues();
    if (window.SpireUserPreferences?.setCustomColors) window.SpireUserPreferences.setCustomColors(values);
    else {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--title-bg', values.title);
      rootStyle.setProperty('--toolbar-bg', values.toolbar);
      rootStyle.setProperty('--main-bg', values.background);
      rootStyle.setProperty('--workspace-card-bg', '#ffffff');
      rootStyle.setProperty('--text-color', values.text);
      try {
        localStorage.setItem('spire:accessibility:custom-colors', JSON.stringify(values));
        localStorage.setItem('spire:accessibility:mode', 'custom');
      } catch {}
    }
  }
  window.applyCustomColors = applyCustomColors;

  function applyCursorStyle(value) {
    const cursor = ['default','crosshair','help','pointer'].includes(String(value)) ? String(value) : 'default';
    window.SpireUserPreferences?.setPreference?.('cursor', cursor);
    window.SpireUserPreferences?.applyVisualPreferences?.();
  }
  window.applyCursorStyle = applyCursorStyle;

  function applyFontSize(value) {
    const size = ['12px','13px','14px','16px'].includes(String(value)) ? String(value) : '13px';
    window.SpireUserPreferences?.setPreference?.('fontSize', size);
    window.SpireUserPreferences?.applyVisualPreferences?.();
  }
  window.applyFontSize = applyFontSize;

  function restoreSpireAccessibilityPreferences() {
    window.SpireUserPreferences?.apply?.();
    const preset = window.SpireUserPreferences?.getPreference?.('preset') || 'classicRed';
    markSelectedPreset(preset);
    const cursor = document.getElementById('cursorStyleSelect');
    if (cursor) cursor.value = window.SpireUserPreferences?.getPreference?.('cursor') || 'default';
    const font = document.getElementById('fontSizeSelect');
    if (font) font.value = window.SpireUserPreferences?.getPreference?.('fontSize') || '13px';
  }
  window.restoreSpireAccessibilityPreferences = restoreSpireAccessibilityPreferences;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreSpireAccessibilityPreferences, { once: true });
  else restoreSpireAccessibilityPreferences();`;
  html = html.replace(anchor, runtime);
}

if (!html.includes('</body>')) throw new Error('SPIRE master body close is missing');
if (!html.includes('SPIRE_ACCESSIBILITY_THEME21_CLIENT_STATION_V1')) {
  html = html.replace('</body>', '  <!-- SPIRE_ACCESSIBILITY_THEME21_CLIENT_STATION_V1 -->\n</body>');
}

await writeFile(target, html, 'utf8');
html = await readFile(target, 'utf8');

for (const forbidden of [
  "alert('Opening Staff Messaging Portal...')",
  "alert('Notifications: 3 unread reminders for current client.')",
  '21. Full-Screen Workspace</b>'
]) {
  if (html.includes(forbidden)) throw new Error(`SPIRE master still contains retired behavior: ${forbidden}`);
}
for (const required of [
  preferenceAsset,
  '21. Client Station Classic',
  "applyPresetTheme('clientStation')",
  'title="Secure Chat"',
  marker,
  'SPIRE_ACCESSIBILITY_THEME21_CLIENT_STATION_V1'
]) {
  if (!html.includes(required)) throw new Error(`SPIRE accessibility correction is missing: ${required}`);
}

console.log('SPIRE accessibility verified: 21 visual themes with Client Station Classic as #21; authenticated-user persistence remains shared; fullscreen is separate/default-on; fake messaging and notification alerts are removed.');
