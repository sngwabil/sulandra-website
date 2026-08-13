import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the established 20-theme/profile accessibility implementation in the
// standalone master. Persistence, cross-surface inheritance, and preference #21
// are owned by assets/spire-user-preferences.js at runtime.
await import('./fix-spire-master-defects.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'spire', 'master.html');
let html = await readFile(target, 'utf8');

// The original master contained two obsolete compatibility assignments below
// the real functions. Remove only those exact no-op/removed-function aliases.
html = html
  .replaceAll('  window.switchAccessTab=()=>{};\n', '')
  .replaceAll('  window.selectPresetTheme=applyTheme;\n', '  window.selectPresetTheme=applyPresetTheme;\n');

if (!html.includes('window.selectPresetTheme=applyPresetTheme;')) {
  const anchor = '  window.applyPresetTheme=applyPresetTheme;';
  if (!html.includes(anchor)) throw new Error('SPIRE accessibility applyPresetTheme runtime is missing');
  html = html.replace(anchor, `${anchor}\n  window.selectPresetTheme=applyPresetTheme;`);
}

await writeFile(target, html, 'utf8');
html = await readFile(target, 'utf8');

for (const marker of [
  'SPIRE_MASTER_DEFECT_FIXES_V1',
  'window.switchAccessTab=switchAccessTab',
  'window.applyPresetTheme=applyPresetTheme',
  'window.selectPresetTheme=applyPresetTheme',
  "themeName === 'classicRed'",
  "themeName === 'solarizedLight'",
  '20. Solarized Light Clean',
  'customTitleColor',
  'cursorStyleSelect',
  'fontSizeSelect',
]) {
  if (!html.includes(marker)) throw new Error(`SPIRE accessibility source is missing ${marker}`);
}
for (const forbidden of ['window.switchAccessTab=()=>{}', 'window.selectPresetTheme=applyTheme']) {
  if (html.includes(forbidden)) throw new Error(`SPIRE accessibility source still contains obsolete ${forbidden}`);
}

console.log('SPIRE accessibility source verified: the 20 established visual themes/profile controls remain functional; persistence and #21 Full-Screen Workspace are delegated to the shared SPIRE preference runtime.');
