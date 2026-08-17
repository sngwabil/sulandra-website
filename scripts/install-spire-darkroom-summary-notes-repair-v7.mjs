import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRelative = 'assets/spire-darkroom-summary-notes-repair-v7.js';
const assetPath = path.join(root, assetRelative);
const marker = 'SPIRE_DARKROOM_SUMMARY_NOTES_REPAIR_V7';
const assetUrl = '/assets/spire-darkroom-summary-notes-repair-v7.js?v=20260817-summary-notes-darkroom-v7-1';
const targetPath = path.join(root, 'spire', 'master.html');

await access(assetPath);
const runtime = await readFile(assetPath, 'utf8');
for (const required of [marker, '#summary-view', '#notes-view', 'spire-summary-at-glance', '.notes-editor-pane']) {
  if (!runtime.includes(required)) throw new Error(`SPIRE Summary/Notes Dark Room repair missing ${required}`);
}
for (const forbidden of ['fetch(', 'MutationObserver', 'addEventListener(', 'SpireMarTimeline', 'SpireFlowsheet', 'openFlowsheetGroup', 'loadCanonicalMar']) {
  if (runtime.includes(forbidden)) throw new Error(`SPIRE Summary/Notes Dark Room repair must remain visual-only; found ${forbidden}`);
}
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`SPIRE Summary/Notes Dark Room repair syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

let html = await readFile(targetPath, 'utf8');
if (!html.includes('</body>')) throw new Error('spire/master.html is missing </body>');
const tag = `<script src="${assetUrl}" data-spire-darkroom-summary-notes-repair="${marker}"></script>`;
html = html.replace(/\s*<script src="\/assets\/spire-darkroom-summary-notes-repair-v7\.js\?v=[^"]+"[^>]*><\/script>\s*/g, '\n');
html = html.replace('</body>', `  ${tag}\n</body>`);
await writeFile(targetPath, html, 'utf8');

const verified = await readFile(targetPath, 'utf8');
if (!verified.includes(assetUrl) || !verified.includes(marker)) throw new Error('SPIRE Summary/Notes Dark Room repair was not published');
console.log('SPIRE Summary + Notes Dark Room visual repair V7 published after the theme suite; MAR and Flowsheet ownership remain untouched.');
