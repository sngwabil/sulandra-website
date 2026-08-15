import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const selectorPath = path.join(dist, 'assets', 'spire-flowsheet-role-selector.js');
const nurseNavigationPath = path.join(dist, 'assets', 'spire-nurse-flowsheet-navigation.js');
const selectorUrl = '/assets/spire-flowsheet-role-selector.js?v=20260815-role-selector-3';
const nurseNavigationUrl = '/assets/spire-nurse-flowsheet-navigation.js?v=20260815-nurse-navigation-1';

await Promise.all([stat(masterPath), stat(selectorPath), stat(nurseNavigationPath)]);

const [selector, nurseNavigation] = await Promise.all([
  readFile(selectorPath, 'utf8'),
  readFile(nurseNavigationPath, 'utf8'),
]);
for (const marker of ['SPIRE_FLOWSHEET_ROLE_SELECTOR_V1', '20260815-role-selector-3', 'Nurse Flowsheets', 'ensureUnfilteredBaseForNurse', 'spire:flowsheet:selected-role', 'SpireFlowsheetRoleSelector']) {
  if (!selector.includes(marker)) throw new Error(`SPIRE flowsheet role selector missing ${marker}`);
}
for (const marker of ['SPIRE_NURSE_FLOWSHEET_NAVIGATION_V1', 'Nursing Task List', 'Respiratory & Oxygen', 'resizeScrollableWorkspace', 'SpireNurseFlowsheetNavigation']) {
  if (!nurseNavigation.includes(marker)) throw new Error(`SPIRE nurse flowsheet navigation missing ${marker}`);
}
try { new Function(selector); }
catch (error) { throw new Error(`SPIRE flowsheet role selector syntax error: ${error instanceof Error ? error.message : String(error)}`); }
try { new Function(nurseNavigation); }
catch (error) { throw new Error(`SPIRE nurse flowsheet navigation syntax error: ${error instanceof Error ? error.message : String(error)}`); }

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-flowsheet-role-selector\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-nurse-flowsheet-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${selectorUrl}"></script>\n  <script src="${nurseNavigationUrl}"></script>\n</body>`);

const selectorCount = (master.match(/src="\/assets\/spire-flowsheet-role-selector\.js(?:\?[^"']*)?"/g) || []).length;
const nurseNavigationCount = (master.match(/src="\/assets\/spire-nurse-flowsheet-navigation\.js(?:\?[^"']*)?"/g) || []).length;
if (selectorCount !== 1) throw new Error(`SPIRE master must publish the flowsheet role selector exactly once; found ${selectorCount}`);
if (nurseNavigationCount !== 1) throw new Error(`SPIRE master must publish the nurse task/scroll runtime exactly once; found ${nurseNavigationCount}`);
if (!master.includes('/assets/spire-master-flowsheet-grid.js')) throw new Error('SPIRE role selector requires the authoritative master flowsheet grid');

await writeFile(masterPath, master, 'utf8');

const published = await readFile(masterPath, 'utf8');
if (!published.includes(selectorUrl)) throw new Error('SPIRE master publication lost the flowsheet role selector');
if (!published.includes(nurseNavigationUrl)) throw new Error('SPIRE master publication lost the nurse task/scroll runtime');

console.log('SPIRE flowsheet role selector published with Nurse-specific task navigation and a viewport-constrained vertically scrollable grid while preserving the authoritative filing workflow.');
