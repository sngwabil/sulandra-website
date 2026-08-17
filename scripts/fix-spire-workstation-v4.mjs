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
  // The old resume-button implementation could never auto-enter browser-native fullscreen
  // after a refresh because browsers require a fresh user gesture. Remove it and let the
  // shared workstation runtime provide automatic viewport immersion plus click-to-native fullscreen.
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

  const wireBefore = `    $$('.chart-tab').forEach(tab=>tab.addEventListener('click',()=>activateView(tab.dataset.view)));`;
  const wireAfter = `    $$('.chart-tab').forEach(tab=>{\n      const viewId=tab.dataset.view;\n      tab.addEventListener('pointerenter',()=>{ void prewarmWorkspace(viewId); },{passive:true});\n      tab.addEventListener('pointerdown',()=>{ void prewarmWorkspace(viewId); },{passive:true});\n      tab.addEventListener('click',()=>activateView(viewId));\n    });`;
  if (!source.includes(wireBefore)) throw new Error('SPIRE workstation v4 could not find chart tab wiring');
  source = source.replace(wireBefore, wireAfter);

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
  "['flowsheets-view','mar-view','notes-view']",
  'requestIdleCallback',
  'scheduleWorkspacePrewarm();',
]) {
  if (!source.includes(required)) throw new Error(`SPIRE workstation v4 verification failed: missing ${required}`);
}
if (source.includes('data-spire-fullscreen-resume="SPIRE_FULLSCREEN_RESUME_V1"')) {
  throw new Error('SPIRE workstation v4 verification failed: legacy fullscreen resume runtime remains');
}

await writeFile(masterPath, source, 'utf8');
console.log('SPIRE workstation v4 installed: common workspaces prewarm in idle time, hover/click shares one in-flight load, and the legacy fullscreen resume shim is removed.');
