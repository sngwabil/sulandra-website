import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

// Apply the MAR occurrence filter contract after the canonical MAR publisher has
// restored Timeline V4, but before continuity is verified/copied into dist-web.
await import('./install-spire-mar-due-overdue-split.mjs');

const assetRelative = 'assets/spire-adaptive-chart-tabs.js';
const assetUrl = '/assets/spire-adaptive-chart-tabs.js?v=20260815-adaptive-tabs-3';
const marker = 'SPIRE_ADAPTIVE_CHART_TABS_V1';
const ldaRelative = 'assets/spire-lda-workspace.js';
const ldaMarker = 'SPIRE_LDA_WORKSPACE_V1';
const ldaUrl = '/assets/spire-lda-workspace.js?v=20260815-lda-workspace-v1';
const summaryRelative = 'assets/spire-summary-overview.js';
const summaryMarker = 'SPIRE_SUMMARY_OVERVIEW_V3';
const summaryUrl = '/assets/spire-summary-overview.js?v=20260815-summary-overview-v3';
const medicationPolicyRelative = 'assets/spire-medication-management-policy.js';
const medicationPolicyMarker = 'SPIRE_MEDICATION_TOP_MANAGE_ONLY_V1';
const medicationPolicyUrl = '/assets/spire-medication-management-policy.js?v=20260816-top-manage-only-1';
const medicationOrderRelative = 'assets/spire-medication-order-entry.js';
const medicationOrderMarker = 'SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V4';
const medicationOrderUrl = '/assets/spire-medication-order-entry.js?v=20260816-med-order-canonical-loader-4';
const marGuidanceRelative = 'assets/spire-mar-action-guidance.js';
const marGuidanceMarker = 'SPIRE_MAR_ACTION_GUIDANCE_V2';
const marGuidanceUrl = '/assets/spire-mar-action-guidance.js?v=20260816-mar-action-guidance-2';
const marContinuityRelative = 'assets/spire-mar-continuity.js';
const marContinuityMarker = 'SPIRE_MAR_CONTINUITY_V3';
const marContinuityUrl = '/assets/spire-mar-continuity.js?v=20260816-mar-continuity-4';
const marMouseNavigationRelative = 'assets/spire-mar-mouse-navigation.js';
const marMouseNavigationMarker = 'SPIRE_MAR_MOUSE_NAV_V3';
const marMouseNavigationUrl = '/assets/spire-mar-mouse-navigation.js?v=20260816-mar-mouse-nav-3';
const browserTitle = 'Spire Enterprise - Master Client Chart & Intake';

const runtimePath = path.join(root, assetRelative);
const runtime = await readFile(runtimePath, 'utf8');
if (!runtime.includes(marker)) throw new Error(`SPIRE adaptive chart tabs runtime is missing ${marker}`);
if (!runtime.includes("MORE_ID = 'spireChartMoreTab'")) throw new Error('SPIRE adaptive chart tabs runtime is missing the More menu control');
if (!runtime.includes('ResizeObserver')) throw new Error('SPIRE adaptive chart tabs runtime is missing responsive width observation');
if (!runtime.includes('spire:chart-tab-usage:v1:')) throw new Error('SPIRE adaptive chart tabs runtime is missing per-user usage ranking');
if (!runtime.includes('data:image/svg+xml')) throw new Error('SPIRE adaptive runtime is missing the medication-style MAR icon');
if (!runtime.includes('SPIRE_LDA_TAB_SHELL_V1') || !runtime.includes(ldaUrl)) throw new Error('SPIRE adaptive runtime is missing the LDA tab/workspace loader');
if (!runtime.includes(summaryUrl)) throw new Error('SPIRE adaptive runtime is missing Summary Overview V3 loader');
new Function(runtime);

for (const [relative, requiredMarker] of [[ldaRelative, ldaMarker], [summaryRelative, summaryMarker]]) {
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

const medicationPolicyPath = path.join(root, medicationPolicyRelative);
const medicationPolicy = await readFile(medicationPolicyPath, 'utf8');
if (!medicationPolicy.includes(medicationPolicyMarker)) throw new Error(`SPIRE medication management policy is missing ${medicationPolicyMarker}`);
if (!medicationPolicy.includes('window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true')) throw new Error('SPIRE medication management policy does not retire per-medication Manage controls');
if (!medicationPolicy.includes('[data-spire-manage-medication-orders]')) throw new Error('SPIRE medication management policy does not preserve the top Manage Orders control');
new Function(medicationPolicy);
const publishedMedicationPolicyPath = path.join(dist, medicationPolicyRelative);
await stat(publishedMedicationPolicyPath);
const publishedMedicationPolicy = await readFile(publishedMedicationPolicyPath, 'utf8');
if (!publishedMedicationPolicy.includes(medicationPolicyMarker)) throw new Error('Published SPIRE medication management policy is stale');
new Function(publishedMedicationPolicy);

const medicationOrderPath = path.join(root, medicationOrderRelative);
const medicationOrder = await readFile(medicationOrderPath, 'utf8');
if (!medicationOrder.includes(medicationOrderMarker)) throw new Error(`SPIRE medication order loader is missing ${medicationOrderMarker}`);
if (!medicationOrder.includes("document.getElementById('manage-orders-view')")) throw new Error('SPIRE medication order loader is not scoped to the Orders workspace');
if (!medicationOrder.includes('ordersObserver.observe(view, { childList: true, subtree: true })')) throw new Error('SPIRE medication order loader is missing the scoped Orders repaint guard');
if (medicationOrder.includes('observe(document.documentElement')) throw new Error('SPIRE medication order loader must not observe the whole document');
new Function(medicationOrder);
const publishedMedicationOrderPath = path.join(dist, medicationOrderRelative);
await stat(publishedMedicationOrderPath);
const publishedMedicationOrder = await readFile(publishedMedicationOrderPath, 'utf8');
if (!publishedMedicationOrder.includes(medicationOrderMarker)) throw new Error('Published SPIRE medication order loader is stale');
new Function(publishedMedicationOrder);

const marGuidancePath = path.join(root, marGuidanceRelative);
const marGuidance = await readFile(marGuidancePath, 'utf8');
for (const required of [
  marGuidanceMarker,
  'SPIRE_MAR_ACTION_GUIDANCE_V1',
  'Not due yet',
  'Past-due historical occurrence',
  "today's scheduled doses are separate",
  'todaySeparateFromHistory: true',
  'genericErrorReplacement: true',
  'wholeDocumentObserver: false',
]) {
  if (!marGuidance.includes(required)) throw new Error(`SPIRE MAR action guidance is missing ${required}`);
}
if (marGuidance.includes('observe(document.documentElement') || marGuidance.includes('observe(document.body')) {
  throw new Error('SPIRE MAR action guidance must not observe the whole document');
}
new Function(marGuidance);
const publishedMarGuidancePath = path.join(dist, marGuidanceRelative);
await copyFile(marGuidancePath, publishedMarGuidancePath);
const publishedMarGuidance = await readFile(publishedMarGuidancePath, 'utf8');
if (!publishedMarGuidance.includes(marGuidanceMarker)) throw new Error('Published SPIRE MAR action guidance is stale');
new Function(publishedMarGuidance);

const marContinuityPath = path.join(root, marContinuityRelative);
const marContinuity = await readFile(marContinuityPath, 'utf8');
for (const required of [
  marContinuityMarker,
  'SPIRE_MAR_CONTINUITY_V2',
  'Today / Now',
  'Prior-day overdue occurrences',
  'Current-day scheduled doses remain independent',
  "priorOverdueQueue: 'overdue-filter-only'",
  '[data-mar-filter="overdue"].active',
  'blankScheduledCellsDisabled: true',
  'compactOverdueHeader: true',
  'overdueGridVerticalScroll: true',
  'rootOnlyObserver: true',
  'observerFeedbackLoopGuard: true',
  "scopedObserver: '#mar-view'",
  'wholeDocumentObserver: false',
  'includeOverdue=1',
]) {
  if (!marContinuity.includes(required)) throw new Error(`SPIRE MAR continuity runtime is missing ${required}`);
}
if (marContinuity.includes('observe(document.documentElement') || marContinuity.includes('observe(document.body')) {
  throw new Error('SPIRE MAR continuity runtime must not observe the whole document');
}
if (!marContinuity.includes('marObserver.observe(host, { childList: true });')) {
  throw new Error('SPIRE MAR continuity observer must be root-only on #mar-view');
}
if (marContinuity.includes('marObserver.observe(host, { childList: true, subtree: true })')) {
  throw new Error('SPIRE MAR continuity observer must not observe its own nested decorations');
}
new Function(marContinuity);
const publishedMarContinuityPath = path.join(dist, marContinuityRelative);
await copyFile(marContinuityPath, publishedMarContinuityPath);
const publishedMarContinuity = await readFile(publishedMarContinuityPath, 'utf8');
if (!publishedMarContinuity.includes(marContinuityMarker)) throw new Error('Published SPIRE MAR continuity runtime is stale');
new Function(publishedMarContinuity);

const marMouseNavigationPath = path.join(root, marMouseNavigationRelative);
const marMouseNavigation = await readFile(marMouseNavigationPath, 'utf8');
for (const required of [
  marMouseNavigationMarker,
  'SPIRE_MAR_MOUSE_NAV_V2',
  'overdueGridVerticalScroll: true',
  'compactOverdueHeader: true',
  'mouseWheelHorizontalWhenNeeded: true',
  'headerDragPan: true',
  'hourArrowControls: true',
  'rootOnlyObserver: true',
  'observerLoopGuard: true',
  "scopedObserver: '#mar-view'",
  'wholeDocumentObserver: false',
]) {
  if (!marMouseNavigation.includes(required)) throw new Error(`SPIRE MAR mouse navigation runtime is missing ${required}`);
}
if (marMouseNavigation.includes('observe(document.documentElement') || marMouseNavigation.includes('observe(document.body')) {
  throw new Error('SPIRE MAR mouse navigation must not observe the whole document');
}
if (!marMouseNavigation.includes('observer.observe(host, { childList: true });')) {
  throw new Error('SPIRE MAR mouse navigation observer must be root-only on #mar-view');
}
if (marMouseNavigation.includes('observer.observe(host, { childList: true, subtree: true })')) {
  throw new Error('SPIRE MAR mouse navigation observer must not observe its own nested controls');
}
new Function(marMouseNavigation);
const publishedMarMouseNavigationPath = path.join(dist, marMouseNavigationRelative);
await copyFile(marMouseNavigationPath, publishedMarMouseNavigationPath);
const publishedMarMouseNavigation = await readFile(publishedMarMouseNavigationPath, 'utf8');
if (!publishedMarMouseNavigation.includes(marMouseNavigationMarker)) throw new Error('Published SPIRE MAR mouse navigation runtime is stale');
new Function(publishedMarMouseNavigation);

const distRuntimePath = path.join(dist, assetRelative);
await stat(distRuntimePath);
const publishedRuntime = await readFile(distRuntimePath, 'utf8');
if (!publishedRuntime.includes(marker) || !publishedRuntime.includes(ldaUrl) || !publishedRuntime.includes(summaryUrl)) {
  throw new Error('Published SPIRE adaptive chart runtime is stale');
}

async function publishMaster(masterPath) {
  let html = await readFile(masterPath, 'utf8');
  html = html
    .replace(/\s*<script\s+src=["']\/assets\/spire-medication-management-policy\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-medication-order-entry\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-mar-action-guidance\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-mar-continuity\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-mar-mouse-navigation\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-adaptive-chart-tabs\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${browserTitle}</title>`);

  if (!html.includes('</body>')) {
    throw new Error(`SPIRE adaptive chart tabs could not find </body> in ${path.relative(root, masterPath)}`);
  }

  html = html.replace(
    '</body>',
    `  <script src="${medicationPolicyUrl}"></script>\n`
      + `  <script src="${medicationOrderUrl}"></script>\n`
      + `  <script src="${assetUrl}"></script>\n`
      + `  <script src="${marGuidanceUrl}"></script>\n`
      + `  <script src="${marContinuityUrl}"></script>\n`
      + `  <script src="${marMouseNavigationUrl}"></script>\n`
      + '</body>',
  );

  const adaptiveCount = (html.match(/\/assets\/spire-adaptive-chart-tabs\.js\?v=/g) || []).length;
  if (adaptiveCount !== 1) throw new Error(`SPIRE adaptive chart tabs must publish exactly once in ${path.relative(root, masterPath)}; found ${adaptiveCount}`);
  const policyCount = (html.match(/\/assets\/spire-medication-management-policy\.js\?v=/g) || []).length;
  if (policyCount !== 1) throw new Error(`SPIRE medication management policy must publish exactly once in ${path.relative(root, masterPath)}; found ${policyCount}`);
  const orderCount = (html.match(/\/assets\/spire-medication-order-entry\.js\?v=/g) || []).length;
  if (orderCount !== 1) throw new Error(`SPIRE medication order loader must publish exactly once in ${path.relative(root, masterPath)}; found ${orderCount}`);
  const guidanceCount = (html.match(/\/assets\/spire-mar-action-guidance\.js\?v=/g) || []).length;
  if (guidanceCount !== 1) throw new Error(`SPIRE MAR action guidance must publish exactly once in ${path.relative(root, masterPath)}; found ${guidanceCount}`);
  const continuityCount = (html.match(/\/assets\/spire-mar-continuity\.js\?v=/g) || []).length;
  if (continuityCount !== 1) throw new Error(`SPIRE MAR continuity must publish exactly once in ${path.relative(root, masterPath)}; found ${continuityCount}`);
  const mouseNavigationCount = (html.match(/\/assets\/spire-mar-mouse-navigation\.js\?v=/g) || []).length;
  if (mouseNavigationCount !== 1) throw new Error(`SPIRE MAR mouse navigation must publish exactly once in ${path.relative(root, masterPath)}; found ${mouseNavigationCount}`);

  if (html.indexOf(medicationPolicyUrl) > html.indexOf(medicationOrderUrl)) {
    throw new Error('SPIRE medication management policy must load before the medication order loader');
  }
  if (html.indexOf(medicationOrderUrl) > html.indexOf(assetUrl)) {
    throw new Error('SPIRE medication order loader must load before adaptive chart tabs');
  }
  if (html.indexOf(assetUrl) > html.indexOf(marGuidanceUrl)) {
    throw new Error('SPIRE MAR action guidance must load after the chart navigation runtime');
  }
  if (html.indexOf(marGuidanceUrl) > html.indexOf(marContinuityUrl)) {
    throw new Error('SPIRE MAR continuity must load after MAR action guidance');
  }
  if (html.indexOf(marContinuityUrl) > html.indexOf(marMouseNavigationUrl)) {
    throw new Error('SPIRE MAR mouse navigation must load after MAR continuity');
  }

  await writeFile(masterPath, html, 'utf8');
}

await publishMaster(path.join(root, 'spire', 'master.html'));
await publishMaster(path.join(dist, 'spire', 'master.html'));

const finalMaster = await readFile(path.join(dist, 'spire', 'master.html'), 'utf8');
for (const required of [
  `<title>${browserTitle}</title>`,
  medicationPolicyUrl,
  medicationOrderUrl,
  assetUrl,
  marGuidanceUrl,
  marContinuityUrl,
  marMouseNavigationUrl,
  'data-view="flowsheets-view"',
  'data-view="mar-view"',
  'id="mainChartTabs"',
]) {
  if (!finalMaster.includes(required)) {
    throw new Error(`Final SPIRE adaptive chart tab publication is missing ${required}`);
  }
}

console.log(
  `Spire adaptive chart navigation published via ${assetUrl}: pinned core tabs, responsive More menu, MAR icon, LDA workspace loader, Summary LDA avatar, one self-healing top-level medication Orders toolbar via ${medicationOrderUrl}, per-medication Manage controls retired by ${medicationPolicyUrl}, occurrence-aware MAR action guidance via ${marGuidanceUrl}, loop-safe split Due/Overdue MAR continuity via ${marContinuityUrl}, and loop-safe mouse wheel/drag/hour-arrow MAR navigation via ${marMouseNavigationUrl}.`,
);