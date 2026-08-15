import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const runtimePath = path.join(dist, 'assets', 'spire-clinical-regression-runtime.js');
const auditPath = path.join(dist, 'assets', 'spire-flowsheet-audit-popover.js');
const notePath = path.join(dist, 'assets', 'spire-note-composer-v2.js');

const runtimeUrl = '/assets/spire-clinical-regression-runtime.js?v=20260815-clinical-regression-2';
const auditUrl = '/assets/spire-flowsheet-audit-popover.js?v=20260815-flowsheet-audit-popover-2';
const noteUrl = '/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-1';

await Promise.all([stat(masterPath), stat(runtimePath), stat(auditPath), stat(notePath)]);

const [runtime, audit, note] = await Promise.all([
  readFile(runtimePath, 'utf8'),
  readFile(auditPath, 'utf8'),
  readFile(notePath, 'utf8'),
]);

for (const marker of [
  'SPIRE_CLINICAL_REGRESSION_RUNTIME_V1',
  '/api/spire/clinical-identity',
  '/api/spire/clinical-users?ids=',
  'Filed by',
  'Recorded for',
  'Scheduled Medications',
  'PRN Medications',
  'Continuous / Infusion Medications',
  'One-Time Medications',
]) {
  if (!runtime.includes(marker)) throw new Error(`SPIRE clinical regression runtime missing ${marker}`);
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
if (audit.includes('spire-flow-audit-trigger')) {
  throw new Error('SPIRE flowsheet audit must not publish visible per-cell info buttons');
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
]) {
  if (!note.includes(marker)) throw new Error(`SPIRE Note Composer V2 publication missing ${marker}`);
}

for (const [name, source] of [['clinical regression runtime', runtime], ['flowsheet audit popover', audit], ['Note Composer V2', note]]) {
  try { new Function(source); }
  catch (error) { throw new Error(`SPIRE ${name} syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

let master = await readFile(masterPath, 'utf8');
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

await writeFile(masterPath, master, 'utf8');

const published = await readFile(masterPath, 'utf8');
for (const required of [runtimeUrl, auditUrl, noteUrl]) {
  if (!published.includes(required)) throw new Error(`Final SPIRE master publication missing ${required}`);
}
if (!published.includes('id="notes-view"')) throw new Error('Final SPIRE master lost the Notes view host');
if (!published.includes('id="flowsheets-view"')) throw new Error('Final SPIRE master lost the Flowsheets view host');

console.log('SPIRE final clinical repair published non-destructively: clinician attribution/MAR runtime preserved, filed-cell audit popover uses hover/press-and-hold without visible info buttons, legacy note modal removed, and inline provenance-aware Note Composer V2 layered over the validated chart shell.');
