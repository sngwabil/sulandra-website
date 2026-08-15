import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const assetRelative = 'assets/spire-adaptive-chart-tabs.js';
const assetUrl = '/assets/spire-adaptive-chart-tabs.js?v=20260815-adaptive-tabs-1';
const marker = 'SPIRE_ADAPTIVE_CHART_TABS_V1';

const runtimePath = path.join(root, assetRelative);
const runtime = await readFile(runtimePath, 'utf8');
if (!runtime.includes(marker)) throw new Error(`SPIRE adaptive chart tabs runtime is missing ${marker}`);
if (!runtime.includes("id = 'spireChartMoreTab'") && !runtime.includes("MORE_ID = 'spireChartMoreTab'")) throw new Error('SPIRE adaptive chart tabs runtime is missing the More menu control');
if (!runtime.includes('ResizeObserver')) throw new Error('SPIRE adaptive chart tabs runtime is missing responsive width observation');
if (!runtime.includes('spire:chart-tab-usage:v1:')) throw new Error('SPIRE adaptive chart tabs runtime is missing per-user usage ranking');
if (!runtime.includes("data:image/svg+xml")) throw new Error('SPIRE adaptive chart tabs runtime is missing the medication-style MAR icon');
new Function(runtime);

const distRuntimePath = path.join(dist, assetRelative);
await stat(distRuntimePath);
const publishedRuntime = await readFile(distRuntimePath, 'utf8');
if (!publishedRuntime.includes(marker)) throw new Error('Published SPIRE adaptive chart tabs runtime is stale');

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

// Medication ordering V2 and the MAR safety verifier must publish after the chart's
// other late finalizers so cache-busting and dialog context cannot be overwritten.
await import('./install-spire-medication-safety-ui.mjs');

console.log(`SPIRE adaptive chart navigation published via ${assetUrl}: responsive More menu, usage-ranked visible tabs, and medication-style MAR icon. Medication ordering V2 and MAR safety verification were published afterward.`);
