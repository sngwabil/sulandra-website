import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const assetRelative = 'assets/spire-adaptive-chart-tabs.js';
const assetUrl = '/assets/spire-adaptive-chart-tabs.js?v=20260815-adaptive-tabs-2';
const marker = 'SPIRE_ADAPTIVE_CHART_TABS_V1';
const summaryRelative = 'assets/spire-summary-overview.js';
const summaryMarker = 'SPIRE_SUMMARY_OVERVIEW_V2';
const summaryUrl = '/assets/spire-summary-overview.js?v=20260815-summary-overview-v2';

const runtimePath = path.join(root, assetRelative);
const runtime = await readFile(runtimePath, 'utf8');
if (!runtime.includes(marker)) throw new Error(`SPIRE adaptive chart tabs runtime is missing ${marker}`);
if (!runtime.includes("id = 'spireChartMoreTab'") && !runtime.includes("MORE_ID = 'spireChartMoreTab'")) throw new Error('SPIRE adaptive chart tabs runtime is missing the More menu control');
if (!runtime.includes('ResizeObserver')) throw new Error('SPIRE adaptive chart tabs runtime is missing responsive width observation');
if (!runtime.includes('spire:chart-tab-usage:v1:')) throw new Error('SPIRE adaptive chart tabs runtime is missing per-user usage ranking');
if (!runtime.includes("data:image/svg+xml")) throw new Error('SPIRE adaptive chart tabs runtime is missing the medication-style MAR icon');
if (!runtime.includes(summaryUrl)) throw new Error(`SPIRE adaptive chart tabs runtime is missing Summary Overview V2 loader ${summaryUrl}`);
new Function(runtime);

const summaryRuntimePath = path.join(root, summaryRelative);
const summaryRuntime = await readFile(summaryRuntimePath, 'utf8');
if (!summaryRuntime.includes(summaryMarker)) throw new Error(`SPIRE Summary Overview runtime is missing ${summaryMarker}`);
new Function(summaryRuntime);

const distRuntimePath = path.join(dist, assetRelative);
await stat(distRuntimePath);
const publishedRuntime = await readFile(distRuntimePath, 'utf8');
if (!publishedRuntime.includes(marker)) throw new Error('Published SPIRE adaptive chart tabs runtime is stale');
if (!publishedRuntime.includes(summaryUrl)) throw new Error('Published SPIRE adaptive chart tabs runtime does not load Summary Overview V2');

const distSummaryPath = path.join(dist, summaryRelative);
await stat(distSummaryPath);
const publishedSummary = await readFile(distSummaryPath, 'utf8');
if (!publishedSummary.includes(summaryMarker)) throw new Error('Published SPIRE Summary Overview runtime is stale');

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

console.log(`SPIRE adaptive chart navigation published via ${assetUrl}: responsive More menu, usage-ranked visible tabs, medication-style MAR icon, and Summary Overview V2 loader.`);
