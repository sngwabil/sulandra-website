import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'SPIRE_EPIC_THEME_SUITE_V1';
const runtimePath = path.join(root, 'dist-web', 'assets', 'spire-epic-theme-suite.js');
const runtime = await readFile(runtimePath, 'utf8');
for (const required of [marker, "label: 'Altitude'", "label: 'Lavender'", "label: 'Verdant'", "label: 'Deep Blue'", "label: 'Amethyst'", "label: 'Carbon'", "label: 'Dark Room'", "label: 'High Contrast'", 'data-spire-epic-theme', 'spire:epic-theme-suite:preset', 'darkRoom', 'highContrast']) {
  if (!runtime.includes(required)) throw new Error(`Published SPIRE Epic theme runtime missing ${required}`);
}
const syntax = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Published SPIRE Epic theme runtime syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

for (const relative of ['spire/client-station.html','spire/master.html','spire/secure-chat.html','spire/flowsheets.html']) {
  const html = await readFile(path.join(root, 'dist-web', relative), 'utf8');
  if (!html.includes('/assets/spire-epic-theme-suite.js') || !html.includes(marker)) throw new Error(`Published ${relative} is missing the SPIRE Epic theme suite`);
}

console.log('SPIRE Epic theme suite verified in dist-web: all 8 themes are published across Client Station, chart, Secure Chat, and Flowsheets.');
