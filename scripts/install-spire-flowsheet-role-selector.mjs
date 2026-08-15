import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const gridPath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const selectorPath = path.join(dist, 'assets', 'spire-flowsheet-role-selector.js');
const nurseNavigationPath = path.join(dist, 'assets', 'spire-nurse-flowsheet-navigation.js');
const gridUrl = '/assets/spire-master-flowsheet-grid.js?v=20260815-file-persistence-2';
const selectorUrl = '/assets/spire-flowsheet-role-selector.js?v=20260815-role-selector-3';
const nurseNavigationUrl = '/assets/spire-nurse-flowsheet-navigation.js?v=20260815-nurse-navigation-1';
const filePersistenceMarker = 'SPIRE_FLOWSHEET_FILE_PERSISTENCE_V1';

await Promise.all([stat(masterPath), stat(gridPath), stat(selectorPath), stat(nurseNavigationPath)]);

let grid = await readFile(gridPath, 'utf8');
if (!grid.includes(filePersistenceMarker)) {
  const loadAnchor = '  async function loadWorkspace({ preserveColumns = false, preserveStatus = false } = {}) {';
  if (!grid.includes(loadAnchor)) throw new Error('SPIRE flowsheet persistence patch could not find loadWorkspace');
  grid = grid.replace(loadAnchor, `  // ${filePersistenceMarker}\n  // Query the timestamps the user can actually see, including columns restored\n  // from session storage after a full browser reload. A fixed rolling 24-hour\n  // query can otherwise hide successfully filed values in older/custom columns.\n  function workspaceQueryRange() {\n    const points = [\n      ...readStoredColumns(),\n      ...runtime.columns,\n      ...[...runtime.drafts.values()].map((draft) => draft.recordedAt),\n    ].map((value) => new Date(value).getTime()).filter(Number.isFinite);\n    if (!points.length) {\n      return {\n        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),\n        to: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),\n      };\n    }\n    const padding = 12 * 60 * 60 * 1000;\n    return {\n      from: new Date(Math.min(...points) - padding).toISOString(),\n      to: new Date(Math.max(...points) + padding).toISOString(),\n    };\n  }\n\n  async function loadWorkspace({ preserveColumns = false, preserveStatus = false } = {}) {`);

  const fixedRange = "      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();\n      const to = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();";
  if (!grid.includes(fixedRange)) throw new Error('SPIRE flowsheet persistence patch could not find the rolling workspace range');
  grid = grid.replace(fixedRange, '      const { from, to } = workspaceQueryRange();');

  const successfulFileBlock = "      runtime.drafts.clear();\n      saveDraftStore();\n      runtime.filing = false;\n      await loadWorkspace({ preserveColumns: true, preserveStatus: true });\n      setStatus(`${result?.count ?? entries.length} change${(result?.count ?? entries.length) === 1 ? '' : 's'} filed together · ${actorName()}.`, 'success');";
  if (!grid.includes(successfulFileBlock)) throw new Error('SPIRE flowsheet persistence patch could not find the successful File completion block');
  grid = grid.replace(successfulFileBlock, `      const filedEntries = Array.isArray(result?.entries) ? result.entries : [];\n      const filedCount = Number(result?.count ?? filedEntries.length);\n      if (filedCount !== entries.length || filedEntries.length !== entries.length) {\n        throw new Error('The server did not confirm every staged flowsheet cell. Nothing was cleared from this workstation.');\n      }\n\n      runtime.drafts.clear();\n      saveDraftStore();\n      runtime.filing = false;\n      await loadWorkspace({ preserveColumns: true, preserveStatus: true });\n\n      // The transactional File response is authoritative. Merge those confirmed\n      // rows back into the reloaded workspace immediately so a successful File\n      // can never visually erase documentation while the grid refreshes.\n      if (runtime.data && filedEntries.length) {\n        const merged = new Map((Array.isArray(runtime.data.entries) ? runtime.data.entries : []).map((entry) => [String(entry.id), entry]));\n        for (const entry of filedEntries) merged.set(String(entry.id), entry);\n        runtime.data.entries = [...merged.values()];\n        renderGrid();\n      }\n      setStatus(\`${'${filedCount}'} change${'${filedCount === 1 ? \'\' : \'s\'}'} filed together · ${'${actorName()}'} .\`.replace(' .', '.'), 'success');`);
}

for (const marker of [filePersistenceMarker, 'workspaceQueryRange', 'readStoredColumns()', 'server did not confirm every staged flowsheet cell', 'transactional File response is authoritative']) {
  if (!grid.includes(marker)) throw new Error(`SPIRE flowsheet file persistence patch missing ${marker}`);
}
try { new Function(grid); }
catch (error) { throw new Error(`SPIRE master flowsheet grid syntax error after persistence patch: ${error instanceof Error ? error.message : String(error)}`); }
await writeFile(gridPath, grid, 'utf8');

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
  .replace(/\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"']+)?/g, gridUrl)
  .replace(/\s*<script src="\/assets\/spire-flowsheet-role-selector\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-nurse-flowsheet-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${selectorUrl}"></script>\n  <script src="${nurseNavigationUrl}"></script>\n</body>`);

const gridCount = (master.match(/src="\/assets\/spire-master-flowsheet-grid\.js(?:\?[^"']*)?"/g) || []).length;
const selectorCount = (master.match(/src="\/assets\/spire-flowsheet-role-selector\.js(?:\?[^"']*)?"/g) || []).length;
const nurseNavigationCount = (master.match(/src="\/assets\/spire-nurse-flowsheet-navigation\.js(?:\?[^"']*)?"/g) || []).length;
if (gridCount !== 1) throw new Error(`SPIRE master must publish the authoritative flowsheet grid exactly once; found ${gridCount}`);
if (selectorCount !== 1) throw new Error(`SPIRE master must publish the flowsheet role selector exactly once; found ${selectorCount}`);
if (nurseNavigationCount !== 1) throw new Error(`SPIRE master must publish the nurse task/scroll runtime exactly once; found ${nurseNavigationCount}`);
if (!master.includes(gridUrl)) throw new Error('SPIRE master did not cache-bust the filed-value persistence grid');

await writeFile(masterPath, master, 'utf8');

const published = await readFile(masterPath, 'utf8');
if (!published.includes(gridUrl)) throw new Error('SPIRE master publication lost the filed-value persistence grid');
if (!published.includes(selectorUrl)) throw new Error('SPIRE master publication lost the flowsheet role selector');
if (!published.includes(nurseNavigationUrl)) throw new Error('SPIRE master publication lost the nurse task/scroll runtime');

await import('./fix-spire-clinical-regressions.mjs');

console.log('SPIRE flowsheet publication now preserves confirmed filed values across File and full reloads, queries the visible/custom column range, retains Nurse-specific task navigation with viewport scrolling, and applies the final clinical attribution/MAR/Notes regression guard.');
