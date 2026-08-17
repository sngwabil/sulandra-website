import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRelative = 'assets/spire-darkroom-summary-notes-repair-v7.js';
const assetPath = path.join(root, assetRelative);
const marker = 'SPIRE_DARKROOM_GLOBAL_COVERAGE_V8';
const assetUrl = '/assets/spire-darkroom-summary-notes-repair-v7.js?v=20260817-darkroom-global-v8-1';
const targetPath = path.join(root, 'spire', 'master.html');

await access(assetPath);
const runtime = await readFile(assetPath, 'utf8');
for (const required of [
  marker,
  'data-spire-preset="darkClinicalSummary"',
  'data-spire-epic-theme="darkRoom"',
  '#summary-view',
  '#notes-view',
  '#manage-orders-view',
  '#lda-view',
  'SpireDarkRoomGlobalCoverageV8',
  'marExcluded: true',
]) {
  if (!runtime.includes(required)) throw new Error(`SPIRE global Dark Room coverage missing ${required}`);
}
for (const forbidden of [
  'fetch(',
  'MutationObserver',
  'addEventListener(',
  'SpireMarTimeline',
  'SpireFlowsheet',
  'openFlowsheetGroup',
  'loadCanonicalMar',
  'localStorage.',
  'sessionStorage.',
]) {
  if (runtime.includes(forbidden)) throw new Error(`SPIRE global Dark Room coverage must remain visual-only; found ${forbidden}`);
}
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`SPIRE global Dark Room coverage syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

let html = await readFile(targetPath, 'utf8');
if (!html.includes('</body>')) throw new Error('spire/master.html is missing </body>');
const tag = `<script src="${assetUrl}" data-spire-darkroom-global-coverage="${marker}"></script>`;
html = html.replace(/\s*<script src="\/assets\/spire-darkroom-summary-notes-repair-v7\.js\?v=[^"]+"[^>]*><\/script>\s*/g, '\n');
html = html.replace('</body>', `  ${tag}\n</body>`);
await writeFile(targetPath, html, 'utf8');

const verified = await readFile(targetPath, 'utf8');
if (!verified.includes(assetUrl) || !verified.includes(marker)) throw new Error('SPIRE global Dark Room coverage was not published');
console.log('SPIRE Theme #22 + Epic Dark Room global visual coverage V8 published last; MAR, Flowsheet, navigation and clinical behavior remain untouched.');
