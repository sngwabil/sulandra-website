import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const runtimePath = path.join(dist, 'assets', 'spire-clinical-regression-runtime.js');
const auditPath = path.join(dist, 'assets', 'spire-flowsheet-audit-popover.js');
const notePath = path.join(dist, 'assets', 'spire-note-composer-v2.js');
const noteSourcePath = path.join(root, 'assets', 'spire-note-composer-v2.js');

const runtimeUrl = '/assets/spire-clinical-regression-runtime.js?v=20260816-clinical-regression-2';
const auditUrl = '/assets/spire-flowsheet-audit-popover.js?v=20260815-flowsheet-audit-popover-2';
const noteUrl = '/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-2';

await import('./fix-spire-note-filing-history.mjs');
await copyFile(noteSourcePath, notePath);

await Promise.all([stat(masterPath), stat(runtimePath), stat(auditPath), stat(notePath)]);

const [runtime, audit, note] = await Promise.all([
  readFile(runtimePath, 'utf8'),
  readFile(auditPath, 'utf8'),
  readFile(notePath, 'utf8'),
]);

for (const marker of [
  'SPIRE_CLINICAL_REGRESSION_RUNTIME_V2',
  '/api/spire/clinical-identity',
  '/api/spire/clinical-users?ids=',
  'Filed by',
  'Recorded for',
  "scope: 'flowsheets-only'",
  "document.getElementById('flowsheets-view')",
]) {
  if (!runtime.includes(marker)) throw new Error(`SPIRE clinical regression runtime missing ${marker}`);
}
if (runtime.includes('repairMarSections') || runtime.includes('document.querySelector(\'#mar-view')) {
  throw new Error('SPIRE clinical regression runtime must not inspect, regroup, or rewrite MAR/eMAR');
}
if (runtime.includes('observer.observe(document.body')) {
  throw new Error('SPIRE clinical regression runtime must not observe the entire document');
}
for (const marker of [
  'SPIRE_FLOWSHEET_AUDIT_POPOVER_V1',
  'Flowsheet Audit',
  'Filed by',
  'Recorded for',
  'Filed at',
  '/api/spire/clinical-users?ids=',
  '/flowsheet-workspace?from=',
  'press and hold',
]) {
  if (!audit.includes(marker)) throw new Error(`SPIRE flowsheet audit popover publication missing ${marker}`);
}
if (audit.includes("className = 'spire-flow-audit-trigger'") || audit.includes("textContent = 'i'")) {
  throw new Error('SPIRE flowsheet audit must not create visible per-cell info buttons');
}
for (const marker of [
  'SPIRE_NOTE_COMPOSER_V2',
  '/api/spire/note-composer/catalog',
  '/note-composer/notes',
  'Select note type',
  'Select a template',
  'Authored Only',
  'Template',
  'pasteEventCount',
  'templateSnapshot',
  'Sign & File',
  'sncSignDraftFromReader',
  'SPIRE_NOTE_READER_SIGN_AND_FILE_V1',
]) {
  if (!note.includes(marker)) throw new Error(`SPIRE Note Composer V2 publication missing ${marker}`);
}

for (const [name, source] of [['clinical regression runtime', runtime], ['flowsheet audit popover', audit], ['Note Composer V2', note]]) {
  try { new Function(source); }
  catch (error) { throw new Error(`SPIRE ${name} syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

let master = await readFile(masterPath, 'utf8');
const legacyClientTabPattern = /\s*<div class="client-tab">\s*<span id="tabClientName">[\s\S]*?<\/span>\s*<span>✖<\/span>\s*<\/div>/g;
const legacyClientTabs = master.match(legacyClientTabPattern) || [];
if (legacyClientTabs.length !== 1) {
  throw new Error(`SPIRE client toolbar tab removal expected exactly one legacy client tab; found ${legacyClientTabs.length}`);
}
master = master.replace(
  legacyClientTabPattern,
  '\n        <div id="legacyClientTabHook" class="client-tab" hidden aria-hidden="true" style="display:none!important"><span id="tabClientName"></span></div>',
);

master = master
  .replace(/\s*<script src="\/assets\/spire-clinical-regression-runtime\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-flowsheet-audit-popover\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-note-workflow\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-note-composer-v2\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${runtimeUrl}"></script>\n  <script src="${auditUrl}"></script>\n  <script src="${noteUrl}"></script>\n</body>`);

const checks = [
  ['clinical regression runtime', /src="\/assets\/spire-clinical-regression-runtime\.js(?:\?[^"']*)?"/g, runtimeUrl],
  ['flowsheet audit popover', /src="\/assets\/spire-flowsheet-audit-popover\.js(?:\?[^"']*)?"/g, auditUrl],
  ['Note Composer V2', /src="\/assets\/spire-note-composer-v2\.js(?:\?[^"']*)?"/g, noteUrl],
];
for (const [name, pattern, url] of checks) {
  const found = (master.match(pattern) || []).length;
  if (found !== 1) throw new Error(`SPIRE ${name} must publish exactly once; found ${found}`);
  if (!master.includes(url)) throw new Error(`SPIRE master lost cache-busted ${name}`);
}
if (/src="\/assets\/spire-note-workflow\.js(?:\?[^"']*)?"/.test(master)) {
  throw new Error('Legacy SPIRE note modal is still published alongside Note Composer V2');
}
if (!master.includes('id="legacyClientTabHook"') || !master.includes('id="tabClientName"')) {
  throw new Error('SPIRE hidden legacy client-tab compatibility hook was not published');
}
if (/<div class="client-tab">\s*<span id="tabClientName">[\s\S]*?<span>✖<\/span>/.test(master)) {
  throw new Error('SPIRE still publishes the redundant visible client-name tab and fake close control');
}

await writeFile(masterPath, master, 'utf8');

const published = await readFile(masterPath, 'utf8');
for (const required of [runtimeUrl, auditUrl, noteUrl]) {
  if (!published.includes(required)) throw new Error(`Final SPIRE master publication missing ${required}`);
}
if (!published.includes('id="notes-view"')) throw new Error('Final SPIRE master lost the Notes view host');
if (!published.includes('id="flowsheets-view"')) throw new Error('Final SPIRE master lost the Flowsheets view host');
if (!published.includes('id="legacyClientTabHook"') || !published.includes('style="display:none!important"')) {
  throw new Error('Final SPIRE master lost the hidden legacy client-tab compatibility hook');
}

console.log('SPIRE final clinical repair published non-destructively: clinician attribution is flowsheet-only, MAR/eMAR remains owned by the canonical master renderer, filed-cell audit hover/press-and-hold is retained, Note Composer V2 remains active, and the redundant toolbar client-name tab is hidden.');