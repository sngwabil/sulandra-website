import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_WORKSPACE_PERFORMANCE_V3';
const legacyMarker = 'SPIRE_WORKSPACE_PERFORMANCE_V2';
const fullscreenMarker = 'SPIRE_FULLSCREEN_RESUME_V1';

let source = await readFile(masterPath, 'utf8');

if (!source.includes('SPIRE_STABLE_WORKSPACE_UX_V1')) {
  throw new Error('Spire workspace performance guard requires the stable workspace optimizer first');
}
if (!source.includes('SPIRE_STABLE_WORKSPACE_SELECTOR_FIX_V1')) {
  throw new Error('Spire workspace performance guard requires the selector repair first');
}

// Migrate a workspace that was previously generated with V2. V2 obscured a valid
// same-patient snapshot with a full-screen hydration mask, defeating instant restore.
if (source.includes(legacyMarker) && !source.includes(marker)) {
  source = source.replace(
    /  \/\/ SPIRE_WORKSPACE_PERFORMANCE_V2: keep the client chart visually stable while authenticated data hydrates\.[\s\S]*?(?=  function stableLoadingMarkup\(label='Loading chart…'\) \{)/,
    `  // ${marker}: restored chart/workspace content stays visible while live data revalidates.\n`
  );
  source = source
    .replace("    setChartHydrationMask(true, 'Loading the selected client without exposing another chart…');\n", '')
    .replace("      if(bootPatientId) setChartHydrationMask(true, 'Restoring the current client chart…');\n", '')
    .replace("        if(restoredSnapshot && rememberedView==='summary-view') clearChartHydrationMask();\n", '')
    .replace("        clearChartHydrationMask();\n        renderClientPicker();", '        renderClientPicker();')
    .replace("      }else{\n        clearChartHydrationMask();\n      }", '      }')
    .replace("      clearChartHydrationMask();\n      console.error('[S.P.I.R.E. Master]',error);", "      console.error('[S.P.I.R.E. Master]',error);");
}

if (!source.includes(marker)) {
  const ttlBefore = '  const CHART_SNAPSHOT_TTL_MS = 90 * 1000;';
  const ttlAfter = '  const CHART_SNAPSHOT_TTL_MS = 15 * 60 * 1000;';
  if (source.includes(ttlBefore)) source = source.replace(ttlBefore, ttlAfter);
  if (!source.includes(ttlAfter)) throw new Error('Spire workspace performance guard could not establish chart snapshot TTL');

  const gateBefore = '    if (!force && viewIsFresh(viewId) && hasLiveViewContent(target)) return Promise.resolve();';
  const gateV2 = '    if (!force && hasLiveViewContent(target)) return Promise.resolve();';
  const gateAfter = "    if (!force && hasLiveViewContent(target) && target.dataset.spireRestored !== 'true') return Promise.resolve();";
  if (source.includes(gateBefore)) source = source.replace(gateBefore, gateAfter);
  else if (source.includes(gateV2)) source = source.replace(gateV2, gateAfter);
  if (!source.includes(gateAfter)) throw new Error('Spire workspace performance guard could not establish persistent tab revisit gate');

  const snapshotAnchor = `  function minimalAdmissionSnapshot() {`;
  if (!source.includes(snapshotAnchor)) throw new Error('Spire workspace performance guard could not find snapshot helper anchor');
  const workspaceSnapshotHelpers = `  // ${marker}: cache the rendered active workspace so a hard refresh never falls back to an empty template.\n  function workspaceSnapshotKey(viewId, patientId=state.patientId) {\n    return 'spire:workspace-snapshot:v1:' + selectedEntityId() + ':' + String(patientId || '') + ':' + String(viewId || 'summary-view');\n  }\n\n  function saveWorkspaceSnapshot(viewId, host) {\n    if (!state.patientId || !host || viewId === 'summary-view' || !hasLiveViewContent(host)) return;\n    try {\n      const snapshot = { version: 1, savedAt: Date.now(), patientId: String(state.patientId), entityId: selectedEntityId(), viewId: String(viewId), html: host.innerHTML };\n      const serialized = JSON.stringify(snapshot);\n      if (serialized.length <= 700000) sessionStorage.setItem(workspaceSnapshotKey(viewId), serialized);\n    } catch (error) {\n      console.warn('[Spire UX] workspace snapshot was not cached', error);\n    }\n  }\n\n  function restoreWorkspaceSnapshot(viewId, patientId=state.patientId) {\n    if (!viewId || viewId === 'summary-view' || !patientId) return false;\n    const host = document.getElementById(viewId);\n    if (!host) return false;\n    try {\n      const raw = sessionStorage.getItem(workspaceSnapshotKey(viewId, patientId));\n      if (!raw) return false;\n      const snapshot = JSON.parse(raw);\n      if (snapshot?.version !== 1 || String(snapshot.patientId) !== String(patientId) || snapshot.entityId !== selectedEntityId() || snapshot.viewId !== String(viewId)) return false;\n      if (!snapshot.savedAt || Date.now() - Number(snapshot.savedAt) > CHART_SNAPSHOT_TTL_MS || !snapshot.html) {\n        sessionStorage.removeItem(workspaceSnapshotKey(viewId, patientId));\n        return false;\n      }\n      host.innerHTML = snapshot.html;\n      host.dataset.spireLive = 'true';\n      host.dataset.spirePatientId = String(patientId);\n      host.dataset.spireRestored = 'true';\n      return true;\n    } catch (error) {\n      console.warn('[Spire UX] cached workspace could not be restored', error);\n      return false;\n    }\n  }\n\n`;
  source = source.replace(snapshotAnchor, workspaceSnapshotHelpers + snapshotAnchor);

  const markBefore = `  function markViewLive(viewId, fresh=true) {\n    const host = document.getElementById(viewId);\n    if (!host) return;\n    host.dataset.spireLive = 'true';\n    host.dataset.spirePatientId = String(state.patientId || '');\n    clearViewBusy(host);\n    if (fresh) viewLoadState.set(viewStateKey(viewId), { at: Date.now(), promise: null });\n  }`;
  const markAfter = `  function markViewLive(viewId, fresh=true) {\n    const host = document.getElementById(viewId);\n    if (!host) return;\n    host.dataset.spireLive = 'true';\n    host.dataset.spirePatientId = String(state.patientId || '');\n    delete host.dataset.spireRestored;\n    clearViewBusy(host);\n    if (fresh) viewLoadState.set(viewStateKey(viewId), { at: Date.now(), promise: null });\n    if (fresh && viewId !== 'summary-view') saveWorkspaceSnapshot(viewId, host);\n  }`;
  if (source.includes(markBefore)) source = source.replace(markBefore, markAfter);
  if (!source.includes(markAfter)) throw new Error('Spire workspace performance guard could not make workspace snapshots persistent');

  const notesLoadBefore = `    if (!state.patientId) return showError(host,'Select a client first.');\n    const data = await api(\`/api/spire/patients/${'${encodeURIComponent(state.patientId)}'}/chart-review-v2?category=notes\`);`;
  const notesLoadAfter = `    if (!state.patientId) return showError(host,'Select a client first.');\n    if(!hasLiveViewContent(host)) host.innerHTML = stableLoadingMarkup('Loading clinical notes…');\n    const data = await api(\`/api/spire/patients/${'${encodeURIComponent(state.patientId)}'}/chart-review-v2?category=notes\`);`;
  if (source.includes(notesLoadBefore)) source = source.replace(notesLoadBefore, notesLoadAfter);
  if (!source.includes(notesLoadAfter)) throw new Error('Spire workspace performance guard could not suppress the legacy Notes template during first load');

  const forcedActiveBefore = "      if (active !== 'summary-view') await activateView(active, { force: true });";
  const forcedActiveV2 = "      if (active !== 'summary-view') await activateView(active);\n      clearChartHydrationMask();";
  const forcedActiveAfter = "      if (active !== 'summary-view') await activateView(active);";
  if (source.includes(forcedActiveBefore)) source = source.replace(forcedActiveBefore, forcedActiveAfter);
  else if (source.includes(forcedActiveV2)) source = source.replace(forcedActiveV2, forcedActiveAfter);
  if (!source.includes(forcedActiveAfter)) throw new Error('Spire workspace performance guard could not disable forced active-view rebuilds');

  const openPatientBefore = `    restoreChartSnapshot(state.patientId);\n    await loadPatientChart(state.patientId);`;
  const openPatientAfter = `    const rememberedView = sessionStorage.getItem('spire:active-view') || 'summary-view';\n    if (rememberedView && document.getElementById(rememberedView)) {\n      selectViewShell(rememberedView);\n      restoreWorkspaceSnapshot(rememberedView, state.patientId);\n    }\n    restoreChartSnapshot(state.patientId);\n    await loadPatientChart(state.patientId);`;
  if (source.includes(openPatientBefore)) source = source.replace(openPatientBefore, openPatientAfter);
  if (!source.includes(openPatientAfter)) throw new Error('Spire workspace performance guard could not establish patient workspace restore');

  const bootstrapBefore = `      await window.SulandraEntityContext?.ready;\n      state.entity=window.SulandraEntityContext?.get?.()?.selectedEntity||null;\n      state.user=await loadSession();\n      updateHeaderIdentity();\n      await loadWorkspace();\n      state.patientId=currentPatientId();\n      if(state.patientId){\n        sessionStorage.setItem('spire:patientId',state.patientId);\n        const rememberedView=sessionStorage.getItem('spire:active-view');\n        if(rememberedView && document.getElementById(rememberedView)) selectViewShell(rememberedView);\n        restoreChartSnapshot(state.patientId);\n        await loadPatientChart(state.patientId);\n      }else{\n        renderClientPicker();\n      }`;
  const bootstrapV2 = `      const bootPatientId=currentPatientId();\n      await window.SulandraEntityContext?.ready;\n      state.entity=window.SulandraEntityContext?.get?.()?.selectedEntity||null;\n      state.patientId=bootPatientId;\n      let rememberedView='summary-view';\n      let restoredSnapshot=false;\n      if(state.patientId){\n        sessionStorage.setItem('spire:patientId',state.patientId);\n        rememberedView=sessionStorage.getItem('spire:active-view')||'summary-view';\n        if(rememberedView && document.getElementById(rememberedView)) selectViewShell(rememberedView);\n        restoredSnapshot=restoreChartSnapshot(state.patientId);\n      }\n      const sessionPromise=loadSession();\n      const workspacePromise=loadWorkspace();\n      const chartPromise=state.patientId?loadPatientChart(state.patientId):Promise.resolve();\n      state.user=await sessionPromise;\n      updateHeaderIdentity();\n      await Promise.all([workspacePromise,chartPromise]);\n      if(!state.patientId){\n        renderClientPicker();\n      }`;
  const bootstrapAfter = `      const bootPatientId=currentPatientId();\n      await window.SulandraEntityContext?.ready;\n      state.entity=window.SulandraEntityContext?.get?.()?.selectedEntity||null;\n      state.patientId=bootPatientId;\n      let rememberedView='summary-view';\n      if(state.patientId){\n        sessionStorage.setItem('spire:patientId',state.patientId);\n        rememberedView=sessionStorage.getItem('spire:active-view')||'summary-view';\n        if(rememberedView && document.getElementById(rememberedView)) selectViewShell(rememberedView);\n        restoreChartSnapshot(state.patientId);\n        restoreWorkspaceSnapshot(rememberedView,state.patientId);\n      }\n      const sessionPromise=loadSession();\n      const workspacePromise=loadWorkspace();\n      const chartPromise=state.patientId?loadPatientChart(state.patientId):Promise.resolve();\n      state.user=await sessionPromise;\n      updateHeaderIdentity();\n      await Promise.all([workspacePromise,chartPromise]);\n      if(!state.patientId) renderClientPicker();`;
  if (source.includes(bootstrapBefore)) source = source.replace(bootstrapBefore, bootstrapAfter);
  else if (source.includes(bootstrapV2)) source = source.replace(bootstrapV2, bootstrapAfter);
  if (!source.includes(bootstrapAfter)) throw new Error('Spire workspace performance guard could not establish non-blocking bootstrap restore');

  const cleanupBefore = `      if (key.startsWith('spire:chart-snapshot:v1:') || key === 'spire:active-view') sessionStorage.removeItem(key);`;
  const cleanupAfter = `      if (key.startsWith('spire:chart-snapshot:v1:') || key.startsWith('spire:workspace-snapshot:v1:') || key === 'spire:active-view') sessionStorage.removeItem(key);`;
  if (source.includes(cleanupBefore)) source = source.replace(cleanupBefore, cleanupAfter);
  if (!source.includes(cleanupAfter)) throw new Error('Spire workspace performance guard could not establish workspace snapshot cleanup');
}

if (!source.includes(fullscreenMarker)) {
  if (!source.includes('</body>')) throw new Error('Spire workspace performance guard could not find </body> for fullscreen continuity runtime');
  const fullscreenRuntime = `  <script data-spire-fullscreen-resume="${fullscreenMarker}">\n  (() => {\n    'use strict';\n    const KEY='spire:fullscreen-intent-v1';\n    const wantsFullscreen=()=>sessionStorage.getItem(KEY)==='1';\n    const setIntent=(value)=>sessionStorage.setItem(KEY,value?'1':'0');\n\n    function ensureResumeButton(){\n      let button=document.getElementById('spireResumeFullscreen');\n      if(!wantsFullscreen()||document.fullscreenElement){button?.remove();return null;}\n      if(button)return button;\n      button=document.createElement('button');\n      button.id='spireResumeFullscreen';\n      button.type='button';\n      button.textContent='Resume Full Screen';\n      button.title='Browsers leave native full screen during a page refresh. Click once to resume it.';\n      button.style.cssText='position:fixed;right:18px;bottom:18px;z-index:12050;border:1px solid #7eb9d1;background:#075f86;color:#fff;border-radius:6px;padding:8px 12px;font:700 12px Segoe UI,Arial,sans-serif;box-shadow:0 5px 18px rgba(3,32,51,.24);cursor:pointer';\n      button.addEventListener('click',async()=>{\n        try{await document.documentElement.requestFullscreen?.({navigationUI:'hide'});setIntent(true);button.remove();}\n        catch{button.title='Full screen requires a browser-supported user action.';}\n      });\n      document.body.appendChild(button);\n      return button;\n    }\n\n    document.addEventListener('click',(event)=>{\n      const trigger=event.target instanceof Element?event.target.closest('#maxBtn,#spireFullscreenControl,[data-spire-fullscreen-control]'):null;\n      if(!trigger)return;\n      setIntent(!document.fullscreenElement);\n      queueMicrotask(ensureResumeButton);\n    },true);\n    document.addEventListener('fullscreenchange',()=>setTimeout(ensureResumeButton,0));\n    window.addEventListener('pageshow',()=>setTimeout(ensureResumeButton,0));\n    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureResumeButton,{once:true});\n    else ensureResumeButton();\n  })();\n  </script>\n`;
  source = source.replace('</body>', `${fullscreenRuntime}</body>`);
}

const required = [
  marker,
  fullscreenMarker,
  'const CHART_SNAPSHOT_TTL_MS = 15 * 60 * 1000;',
  "target.dataset.spireRestored !== 'true'",
  'workspaceSnapshotKey',
  'restoreWorkspaceSnapshot',
  'saveWorkspaceSnapshot',
  "stableLoadingMarkup('Loading clinical notes…')",
  "if (active !== 'summary-view') await activateView(active);",
  'const bootPatientId=currentPatientId();',
  'spire:workspace-snapshot:v1:',
  'spire:fullscreen-intent-v1',
  'Resume Full Screen',
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error(`Spire workspace performance verification failed: missing ${needle}`);
}

for (const forbidden of [
  'if (!force && viewIsFresh(viewId) && hasLiveViewContent(target)) return Promise.resolve();',
  'if (!force && hasLiveViewContent(target)) return Promise.resolve();',
  "if (active !== 'summary-view') await activateView(active, { force: true });",
  'const CHART_SNAPSHOT_TTL_MS = 90 * 1000;',
  'setChartHydrationMask(true',
  'spireChartHydrationMask',
]) {
  if (source.includes(forbidden)) throw new Error(`Spire workspace performance verification failed: stale blocking/reload behavior remains: ${forbidden}`);
}

await writeFile(masterPath, source, 'utf8');

console.log('Spire workspace performance v3 installed: same-patient chart and active workspace snapshots restore immediately, live tabs remain mounted for instant revisits, restored workspaces revalidate without being blanked, active tabs are not force-rebuilt, and no full-chart hydration mask obscures cached content.');
