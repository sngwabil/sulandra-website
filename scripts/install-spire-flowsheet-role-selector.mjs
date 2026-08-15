import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const selectorPath = path.join(dist, 'assets', 'spire-flowsheet-role-selector.js');
const selectorUrl = '/assets/spire-flowsheet-role-selector.js?v=20260815-role-selector-3';

await Promise.all([stat(masterPath), stat(selectorPath)]);

const selector = await readFile(selectorPath, 'utf8');
for (const marker of ['SPIRE_FLOWSHEET_ROLE_SELECTOR_V1', '20260815-role-selector-3', 'Nurse Flowsheets', 'ensureUnfilteredBaseForNurse', 'spire:flowsheet:selected-role', 'SpireFlowsheetRoleSelector']) {
  if (!selector.includes(marker)) throw new Error(`SPIRE flowsheet role selector missing ${marker}`);
}
try { new Function(selector); }
catch (error) { throw new Error(`SPIRE flowsheet role selector syntax error: ${error instanceof Error ? error.message : String(error)}`); }

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-flowsheet-role-selector\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${selectorUrl}"></script>\n</body>`);

const count = (master.match(/src="\/assets\/spire-flowsheet-role-selector\.js(?:\?[^"']*)?"/g) || []).length;
if (count !== 1) throw new Error(`SPIRE master must publish the flowsheet role selector exactly once; found ${count}`);
if (!master.includes('/assets/spire-master-flowsheet-grid.js')) throw new Error('SPIRE role selector requires the authoritative master flowsheet grid');

await writeFile(masterPath, master, 'utf8');

const published = await readFile(masterPath, 'utf8');
if (!published.includes(selectorUrl)) throw new Error('SPIRE master publication lost the flowsheet role selector');

console.log('SPIRE flowsheet role selector published: Nurse view clears inherited DSP filters and hides DSP task categories while preserving the authoritative filing grid.');
