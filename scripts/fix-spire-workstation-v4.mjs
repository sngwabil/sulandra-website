import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_WORKSTATION_V4';

let source = await readFile(masterPath, 'utf8');

if (!source.includes('SPIRE_WORKSPACE_PERFORMANCE_V3')) {
  throw new Error('SPIRE workstation v4 requires workspace performance v3 first');
}

if (!source.includes(marker)) {
  // Browser-native fullscreen cannot be restored automatically after a full page
  // refresh without a user gesture. Remove the old resume-button shim and let the
  // authenticated shell/preferences runtime own native fullscreen consistently.
  source = source.replace(
    /\s*<script data-spire-fullscreen-resume="SPIRE_FULLSCREEN_RESUME_V1">[\s\S]*?<\/script>\s*/g,
    '\n'
  );

  const helperAnchor = `  function stableLoadingMarkup(label='Loading chart…') {`;
  if (!source.includes(helperAnchor)) {
    throw new Error('SPIRE workstation v4 could not find workspace helper anchor');
  }

  const prewarmHelpers = `  // ${marker}: hydrate common documentation workspaces while the user reviews the chart.\n  function prewarmWorkspace(viewId) {\n    const target = document.getElementById(viewId);\n    if (!state.patientId || !target || !loaders[viewId] || hasLiveViewContent(target)) return Promise.resolve();\n    const key = viewStateKey(viewId);\n    const pending = viewLoadState.get(key)?.promise;\n    if (pending) return pending;\n\n    const patientAtStart = String(state.patientId);\n    const promise = Promise.resolve(loaders[viewId]?.())\n      .then(() => {\n        if (String(state.patientId) === patientAtStart) markViewLive(viewId, true);\n      })\n      .catch(error => {\n        console.warn('[Spire UX] background workspace prewarm failed', viewId, error);\n      })\n      .finally(() => {\n        const current = viewLoadState.get(key);\n        if (current?.promise === promise) viewLoadState.set(key, { at: current.at || 0, promise: null });\n      });\n    viewLoadState.set(key, { at: viewLoadState.get(key)?.at || 0, promise });\n    return promise;\n  }\n\n  let prewarmScheduledPatientId = '';\n  function scheduleWorkspacePrewarm() {\n    const patientAtSchedule = String(state.patientId || '');\n    if (!patientAtSchedule || navigator.connection?.saveData || prewarmScheduledPatientId === patientAtSchedule) return;\n    prewarmScheduledPatientId = patientAtSchedule;\n\n    const run = async () => {\n      if (String(state.patientId || '') !== patientAtSchedule) return;\n      if (!state.user) {\n        prewarmScheduledPatientId = '';\n        setTimeout(scheduleWorkspacePrewarm, 200);\n        return;\n      }\n      for (const viewId of ['flowsheets-view','mar-view','notes-view']) {\n        if (String(state.patientId || '') !== patientAtSchedule) return;\n        const host = document.getElementById(viewId);\n        if (!host || activeViewId() === viewId || hasLiveViewContent(host)) continue;\n        await prewarmWorkspace(viewId);\n        await new Promise(resolve => setTimeout(resolve, 0));\n      }\n    };\n\n    if ('requestIdleCallback' in window) requestIdleCallback(() => { void run(); }, { timeout: 1200 });\n    else setTimeout(() => { void run(); }, 350);\n  }\n\n`;
  source = source.replace(helperAnchor, prewarmHelpers + helperAnchor);

  const wireAnchor = `  function wireTabs() {\n    $('#mainChartTabs')?.addEventListener('click', event => {`;
  if (!source.includes(wireAnchor)) throw new Error('SPIRE workstation v4 could not find delegated chart tab wiring');
  const wireWithPrewarm = `  function wireTabs() {\n    const prewarmTabFromEvent = event => {\n      const tab = event.target instanceof Element ? event.target.closest('.chart-tab[data-view]') : null;\n      const viewId = tab?.dataset?.view || '';\n      if (viewId) void prewarmWorkspace(viewId);\n    };\n    $('#mainChartTabs')?.addEventListener('pointerover', prewarmTabFromEvent, { passive: true });\n    $('#mainChartTabs')?.addEventListener('pointerdown', prewarmTabFromEvent, { passive: true });\n    $('#mainChartTabs')?.addEventListener('click', event => {`;
  source = source.replace(wireAnchor, wireWithPrewarm);

  const loadedBanner = `      showBanner('Client chart loaded. Documentation is live and audit-tracked.','success');`;
  if (!source.includes(loadedBanner)) throw new Error('SPIRE workstation v4 could not find chart load completion');
  source = source.replace(loadedBanner, `${loadedBanner}\n      scheduleWorkspacePrewarm();`);

  const resetAnchor = `    viewLoadState.clear();`;
  if (!source.includes(resetAnchor)) throw new Error('SPIRE workstation v4 could not find patient view reset');
  source = source.replace(resetAnchor, `${resetAnchor}\n    prewarmScheduledPatientId = '';`);

  const markerAnchor = `  // ${marker}: hydrate common documentation workspaces while the user reviews the chart.`;
  if (!source.includes(markerAnchor)) throw new Error('SPIRE workstation v4 marker installation failed');
}

for (const required of [
  marker,
  'function prewarmWorkspace(viewId)',
  'function scheduleWorkspacePrewarm()',
  'requestIdleCallback',
  'scheduleWorkspacePrewarm();',
  "addEventListener('pointerover', prewarmTabFromEvent",
  "addEventListener('pointerdown', prewarmTabFromEvent",
]) {
  if (!source.includes(required)) throw new Error(`SPIRE workstation v4 verification failed: missing ${required}`);
}

// Publication layers intentionally evolve this list in a strict sequence:
// workstation v4 -> flowsheets/MAR/notes;
// MAR single-owner v5 -> flowsheets/notes (MAR removed);
// Orders v6 -> flowsheets/notes/manage-orders.
// A repeat build must accept any already-installed later SAFE state while continuing
// to reject any state that brings MAR back into generic background prewarming.
const workstationPrewarm = "['flowsheets-view','mar-view','notes-view']";
const marSafePrewarm = "['flowsheets-view','notes-view']";
const ordersSafePrewarm = "['flowsheets-view','notes-view','manage-orders-view']";
const singleOwnerGuard = "if (viewId === 'mar-view') return Promise.resolve(false)";
const workstationStateValid = source.includes(workstationPrewarm) && !source.includes('SPIRE_MAR_SINGLE_OWNER_V5');
const marSafeStateValid = source.includes('SPIRE_MAR_SINGLE_OWNER_V5') && source.includes(singleOwnerGuard)
  && (source.includes(marSafePrewarm) || source.includes(ordersSafePrewarm));
if (!workstationStateValid && !marSafeStateValid) {
  throw new Error('SPIRE workstation v4 verification failed: workspace prewarm targets are not an approved workstation/MAR-single-owner/Orders state');
}
if (marSafeStateValid && source.includes(workstationPrewarm)) {
  throw new Error('SPIRE workstation v4 verification failed: MAR returned to generic prewarm after single-owner activation');
}
if (source.includes('data-spire-fullscreen-resume="SPIRE_FULLSCREEN_RESUME_V1"')) {
  throw new Error('SPIRE workstation v4 verification failed: legacy fullscreen resume runtime remains');
}

await writeFile(masterPath, source, 'utf8');
console.log(marSafeStateValid
  ? 'SPIRE workstation v4 verified in repeat-build MAR-safe state; Orders prewarm may remain active while generic MAR prewarm stays disabled.'
  : 'SPIRE workstation v4 installed: common workspaces prewarm in idle time, delegated chart tabs share one in-flight load, and the legacy fullscreen resume shim is removed.');
