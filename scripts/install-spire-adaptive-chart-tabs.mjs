import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const assetRelative = 'assets/spire-adaptive-chart-tabs.js';
const assetUrl = '/assets/spire-adaptive-chart-tabs.js?v=20260815-adaptive-tabs-3';
const marker = 'SPIRE_ADAPTIVE_CHART_TABS_V1';
const ldaRelative = 'assets/spire-lda-workspace.js';
const ldaMarker = 'SPIRE_LDA_WORKSPACE_V1';
const ldaUrl = '/assets/spire-lda-workspace.js?v=20260815-lda-workspace-v1';
const summaryRelative = 'assets/spire-summary-overview.js';
const summaryMarker = 'SPIRE_SUMMARY_OVERVIEW_V3';
const summaryUrl = '/assets/spire-summary-overview.js?v=20260815-summary-overview-v3';

const runtimePath = path.join(root, assetRelative);
const runtime = await readFile(runtimePath, 'utf8');
if (!runtime.includes(marker)) throw new Error(`SPIRE adaptive chart tabs runtime is missing ${marker}`);
if (!runtime.includes("MORE_ID = 'spireChartMoreTab'")) throw new Error('SPIRE adaptive chart tabs runtime is missing the More menu control');
if (!runtime.includes('ResizeObserver')) throw new Error('SPIRE adaptive chart tabs runtime is missing responsive width observation');
if (!runtime.includes('spire:chart-tab-usage:v1:')) throw new Error('SPIRE adaptive chart tabs runtime is missing per-user usage ranking');
if (!runtime.includes('data:image/svg+xml')) throw new Error('SPIRE adaptive chart tabs runtime is missing the medication-style MAR icon');
if (!runtime.includes('SPIRE_LDA_TAB_SHELL_V1') || !runtime.includes(ldaUrl)) throw new Error('SPIRE adaptive runtime is missing the LDA tab/workspace loader');
if (!runtime.includes(summaryUrl)) throw new Error('SPIRE adaptive runtime is missing Summary Overview V3 loader');
new Function(runtime);

for (const [relative, requiredMarker] of [[ldaRelative, ldaMarker],[summaryRelative, summaryMarker]]) {
  const sourcePath = path.join(root, relative);
  const source = await readFile(sourcePath, 'utf8');
  if (!source.includes(requiredMarker)) throw new Error(`${relative} is missing ${requiredMarker}`);
  new Function(source);
  const publishedPath = path.join(dist, relative);
  await stat(publishedPath);
  const published = await readFile(publishedPath, 'utf8');
  if (!published.includes(requiredMarker)) throw new Error(`Published ${relative} is stale`);
  new Function(published);
}

const distRuntimePath = path.join(dist, assetRelative);
await stat(distRuntimePath);
const publishedRuntime = await readFile(distRuntimePath, 'utf8');
if (!publishedRuntime.includes(marker) || !publishedRuntime.includes(ldaUrl) || !publishedRuntime.includes(summaryUrl)) throw new Error('Published SPIRE adaptive chart runtime is stale');

async function publishMaster(masterPath) {
  let html = await readFile(masterPath, 'utf8');
  html = html.replace(/\s*<script\s+src=["']\/assets\/spire-adaptive-chart-tabs\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
  if (!html.includes('</body>')) throw new Error(`SPIRE adaptive chart tabs could not find </body> in ${path.relative(root, masterPath)}`);
  html = html.replace('</body>', `  <script src="${assetUrl}"></script>\n</body>`);
  const count = (html.match(/\/assets\/spire-adaptive-chart-tabs\.js\?v=/g) || []).length;
  if (count !== 1) throw new Error(`SPIRE adaptive chart tabs must publish exactly once in ${path.relative(root, masterPath)}; found ${count}`);
  await writeFile(masterPath, html, 'utf8');
}

await publishMaster(path.join(root, 'spire', 'master.html'));
await publishMaster(path.join(dist, 'spire', 'master.html'));

const finalMaster = await readFile(path.join(dist, 'spire', 'master.html'), 'utf8');
for (const required of [assetUrl, 'data-view="flowsheets-view"', 'data-view="mar-view"', 'id="mainChartTabs"']) {
  if (!finalMaster.includes(required)) throw new Error(`Final SPIRE adaptive chart tab publication is missing ${required}`);
}

console.log(`SPIRE adaptive chart navigation published via ${assetUrl}: pinned core tabs, responsive More menu, MAR icon, LDA workspace loader, and Summary LDA avatar.`);
