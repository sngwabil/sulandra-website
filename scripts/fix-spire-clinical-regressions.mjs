import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const runtimePath = path.join(dist, 'assets', 'spire-clinical-regression-runtime.js');
const notePath = path.join(dist, 'assets', 'spire-note-workflow.js');
const runtimeUrl = '/assets/spire-clinical-regression-runtime.js?v=20260815-clinical-regression-2';
const noteUrl = '/assets/spire-note-workflow.js?v=20260815-note-template-workflow-1';

await Promise.all([stat(masterPath), stat(runtimePath), stat(notePath)]);

const [runtime, note] = await Promise.all([
  readFile(runtimePath, 'utf8'),
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
  'SPIRE_NOTE_TEMPLATE_WORKFLOW_V1',
  '/api/spire/note-types',
  'Save Draft',
  'Sign & Close',
  'Note Template',
]) {
  if (!note.includes(marker)) throw new Error(`SPIRE note workflow publication missing ${marker}`);
}

try { new Function(runtime); }
catch (error) { throw new Error(`SPIRE clinical regression runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }
try { new Function(note); }
catch (error) { throw new Error(`SPIRE note workflow syntax error: ${error instanceof Error ? error.message : String(error)}`); }

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-clinical-regression-runtime\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-note-workflow\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${runtimeUrl}"></script>\n  <script src="${noteUrl}"></script>\n</body>`);

const runtimeCount = (master.match(/src="\/assets\/spire-clinical-regression-runtime\.js(?:\?[^"']*)?"/g) || []).length;
const noteCount = (master.match(/src="\/assets\/spire-note-workflow\.js(?:\?[^"']*)?"/g) || []).length;
if (runtimeCount !== 1) throw new Error(`SPIRE clinical regression runtime must publish exactly once; found ${runtimeCount}`);
if (noteCount !== 1) throw new Error(`SPIRE note workflow must publish exactly once; found ${noteCount}`);
if (!master.includes(runtimeUrl)) throw new Error('SPIRE master lost the cache-busted clinical regression runtime');
if (!master.includes(noteUrl)) throw new Error('SPIRE master lost the cache-busted note workflow');

await writeFile(masterPath, master, 'utf8');

const published = await readFile(masterPath, 'utf8');
for (const required of [runtimeUrl, noteUrl]) {
  if (!published.includes(required)) throw new Error(`Final SPIRE master publication missing ${required}`);
}

console.log('SPIRE final clinical repair published non-destructively: clinician-attributed flowsheet metadata, structural MAR grouping, and note type → template → editor workflow are layered over the existing validated chart engines.');
