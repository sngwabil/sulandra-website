import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const sourcePath = path.join(root, 'assets', 'spire-global-chart-search.js');
const publishedPath = path.join(dist, 'assets', 'spire-global-chart-search.js');
const masterPath = path.join(dist, 'spire', 'master.html');
const searchUrl = '/assets/spire-global-chart-search.js?v=20260816-chart-search-2';

await Promise.all([stat(sourcePath), stat(masterPath)]);
await copyFile(sourcePath, publishedPath);

const runtime = await readFile(publishedPath, 'utf8');
for (const marker of [
  'SPIRE_GLOBAL_CHART_SEARCH_V3',
  'Allergy:',
  'Diagnosis:',
  'Latest Vitals / Baseline',
  'visibleClinicalMatches',
  'visibleMarMatches',
  'emarMatches',
  '/emar?date=',
  'window.handleChartSearch = enhancedChartSearch',
  '20260816-chart-search-2',
]) {
  if (!runtime.includes(marker)) throw new Error(`SPIRE global chart search runtime missing ${marker}`);
}
try { new Function(runtime); }
catch (error) { throw new Error(`SPIRE global chart search syntax error: ${error instanceof Error ? error.message : String(error)}`); }

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-global-chart-search\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${searchUrl}"></script>\n</body>`);

const count = (master.match(/src="\/assets\/spire-global-chart-search\.js(?:\?[^"']*)?"/g) || []).length;
if (count !== 1) throw new Error(`SPIRE global chart search must publish exactly once; found ${count}`);
if (!master.includes(searchUrl)) throw new Error('SPIRE global chart search is not cache-pinned to the current runtime');
if (!master.includes('id="globalChartSearchInput"')) throw new Error('SPIRE master lost the global chart search input');
if (!master.includes('oninput="handleChartSearch(this.value)"')) throw new Error('SPIRE master search input is no longer wired to the replaceable global handler');

await writeFile(masterPath, master, 'utf8');
console.log('SPIRE global chart search published: visible MAR and canonical eMAR medications plus current-chart allergies, diagnoses, precautions, providers and baseline/vitals are searchable before the authorized client/chart-review fallback.');