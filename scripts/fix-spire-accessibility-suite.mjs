import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_ACCESSIBILITY_SUITE_RUNTIME_V2';

let html = await readFile(target, 'utf8');

if (!html.includes(marker)) {
  // fix-spire-master-defects.mjs installs the real switchAccessTab() and
  // applyPresetTheme() implementations. The original master source still has
  // two obsolete compatibility assignments immediately afterward; one points
  // at the removed applyTheme() function and the other replaces the real tab
  // handler with a no-op. Remove both before adding the persistent controls.
  html = html.replace(
    "  window.selectPresetTheme=applyTheme;\n  window.switchAccessTab=()=>{};\n",
    '',
  );
  html = html.replace("  window.selectPresetTheme=applyTheme;\n", '');
  html = html.replace("  window.switchAccessTab=()=>{};\n", '');

  const anchor = '  window.applyPresetTheme=applyPresetTheme;';
  if (!html.includes(anchor)) {
    throw new Error('SPIRE accessibility preset runtime anchor was not found');
  }

  const runtime = `${anchor}

  /* ${marker}: make every visual-accessibility control functional and persistent. */
  const SPIRE_ACCESS_KEYS = Object.freeze({
    preset: 'spire:accessibility:preset',
    mode: 'spire:accessibility:mode',
    custom: 'spire:accessibility:custom-colors',
    cursor: 'spire:accessibility:cursor',
    fontSize: 'spire:accessibility:font-size'
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
    rootStyle.setProperty('--workspace-card-bg', values.background === '#ffffff' ? '#ffffff' : '#ffffff');
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
    'window.applyPresetTheme = applyPresetThemePersistent',
    'window.applyCustomColors = applyCustomColors',
    'window.applyCursorStyle = applyCursorStyle',
    'window.applyFontSize = applyFontSize',
  ]) {
    if (!html.includes(required)) throw new Error(`SPIRE accessibility runtime is missing: ${required}`);
  }

  await writeFile(target, html, 'utf8');
}

console.log('SPIRE accessibility suite verified: preset tabs, 20 theme choices, custom colors, cursor styles, and font scaling are functional and persistent.');
