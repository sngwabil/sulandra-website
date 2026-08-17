import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_WORKSPACE_PERFORMANCE_V2';
const fullscreenMarker = 'SPIRE_FULLSCREEN_RESUME_V1';

let source = await readFile(masterPath, 'utf8');

if (!source.includes('SPIRE_STABLE_WORKSPACE_UX_V1')) {
  throw new Error('Spire workspace performance guard requires the stable workspace optimizer first');
}
if (!source.includes('SPIRE_STABLE_WORKSPACE_SELECTOR_FIX_V1')) {
  throw new Error('Spire workspace performance guard requires the selector repair first');
}

if (!source.includes(marker)) {
  const ttlBefore = '  const CHART_SNAPSHOT_TTL_MS = 90 * 1000;';
  const ttlAfter = '  const CHART_SNAPSHOT_TTL_MS = 15 * 60 * 1000;';
  if (!source.includes(ttlBefore)) throw new Error('Spire workspace performance guard could not find chart snapshot TTL');
  source = source.replace(ttlBefore, ttlAfter);

  const gateBefore = '    if (!force && viewIsFresh(viewId) && hasLiveViewContent(target)) return Promise.resolve();';
  const gateAfter = '    if (!force && hasLiveViewContent(target)) return Promise.resolve();';
  if (!source.includes(gateBefore)) throw new Error('Spire workspace performance guard could not find tab revisit gate');
  source = source.replace(gateBefore, gateAfter);

  const forcedActiveBefore = "      if (active !== 'summary-view') await activateView(active, { force: true });";
  const forcedActiveAfter = "      if (active !== 'summary-view') await activateView(active);\n      clearChartHydrationMask();";
  if (!source.includes(forcedActiveBefore)) throw new Error('Spire workspace performance guard could not find forced active-view reload');
  source = source.replace(forcedActiveBefore, forcedActiveAfter);

  const loadingHelperAnchor = `  function stableLoadingMarkup(label='Loading chart…') {`;
  if (!source.includes(loadingHelperAnchor)) throw new Error('Spire workspace performance guard could not find loading helper anchor');
  const hydrationHelpers = `  // ${marker}: keep the client chart visually stable while authenticated data hydrates.\n  function installChartHydrationMaskStyles() {\n    if (document.getElementById('spire-chart-hydration-style')) return;\n    const style = document.createElement('style');\n    style.id = 'spire-chart-hydration-style';\n    style.textContent = '#spireChartHydrationMask{position:fixed;inset:78px 0 0;z-index:9990;display:flex;align-items:center;justify-content:center;background:var(--main-bg,#eef6fa);font:600 13px/1.45 Segoe UI,Arial,sans-serif;color:#244657}#spireChartHydrationMask[hidden]{display:none!important}.spire-chart-hydration-card{min-width:min(420px,calc(100vw - 36px));max-width:520px;background:#fff;border:1px solid #b8d7e5;border-radius:8px;box-shadow:0 12px 36px rgba(14,84,116,.16);padding:22px 24px;text-align:center}.spire-chart-hydration-card strong{display:block;color:#075f86;font-size:15px;margin-bottom:5px}.spire-chart-hydration-card span{color:#607b89}';\n    document.head.appendChild(style);\n  }\n\n  function setChartHydrationMask(active, label='Opening client chart…') {\n    installChartHydrationMaskStyles();\n    let mask = document.getElementById('spireChartHydrationMask');\n    if (!mask) {\n      mask = document.createElement('div');\n      mask.id = 'spireChartHydrationMask';\n      mask.setAttribute('role', 'status');\n      mask.setAttribute('aria-live', 'polite');\n      mask.innerHTML = '<div class="spire-chart-hydration-card"><strong>Opening client chart</strong><span></span></div>';\n      document.body.appendChild(mask);\n    }\n    mask.querySelector('span').textContent = label;\n    mask.hidden = !active;\n  }\n\n  function clearChartHydrationMask() {\n    const mask = document.getElementById('spireChartHydrationMask');\n    if (mask) mask.hidden = true;\n  }\n\n`;
  source = source.replace(loadingHelperAnchor, hydrationHelpers + loadingHelperAnchor);

  const openPatientBefore = `  async function openPatient(patientId) {\n    if (!patientId) return;\n    const nextPatientId = String(patientId);`;
  const openPatientAfter = `  async function openPatient(patientId) {\n    if (!patientId) return;\n    setChartHydrationMask(true, 'Loading the selected client without exposing another chart…');\n    const nextPatientId = String(patientId);`;
  if (!source.includes(openPatientBefore)) throw new Error('Spire workspace performance guard could not find openPatient hydration anchor');
  source = source.replace(openPatientBefore, openPatientAfter);

  const bootstrapBefore = `      await window.SulandraEntityContext?.ready;\n      state.entity=window.SulandraEntityContext?.get?.()?.selectedEntity||null;\n      state.user=await loadSession();\n      updateHeaderIdentity();\n      await loadWorkspace();\n      state.patientId=currentPatientId();\n      if(state.patientId){\n        sessionStorage.setItem('spire:patientId',state.patientId);\n        const rememberedView=sessionStorage.getItem('spire:active-view');\n        if(rememberedView && document.getElementById(rememberedView)) selectViewShell(rememberedView);\n        restoreChartSnapshot(state.patientId);\n        await loadPatientChart(state.patientId);\n      }else{\n        renderClientPicker();\n      }`;
  const bootstrapAfter = `      const bootPatientId=currentPatientId();\n      if(bootPatientId) setChartHydrationMask(true, 'Restoring the current client chart…');\n      await window.SulandraEntityContext?.ready;\n      state.entity=window.SulandraEntityContext?.get?.()?.selectedEntity||null;\n      state.patientId=bootPatientId;\n      let rememberedView='summary-view';\n      let restoredSnapshot=false;\n      if(state.patientId){\n        sessionStorage.setItem('spire:patientId',state.patientId);\n        rememberedView=sessionStorage.getItem('spire:active-view')||'summary-view';\n        if(rememberedView && document.getElementById(rememberedView)) selectViewShell(rememberedView);\n        restoredSnapshot=restoreChartSnapshot(state.patientId);\n        if(restoredSnapshot && rememberedView==='summary-view') clearChartHydrationMask();\n      }\n      const sessionPromise=loadSession();\n      const workspacePromise=loadWorkspace();\n      const chartPromise=state.patientId?loadPatientChart(state.patientId):Promise.resolve();\n      state.user=await sessionPromise;\n      updateHeaderIdentity();\n      await Promise.all([workspacePromise,chartPromise]);\n      if(!state.patientId){\n        clearChartHydrationMask();\n        renderClientPicker();\n      }else{\n        clearChartHydrationMask();\n      }`;
  if (!source.includes(bootstrapBefore)) throw new Error('Spire workspace performance guard could not find bootstrap hydration block');
  source = source.replace(bootstrapBefore, bootstrapAfter);

  const catchBefore = `    }catch(error){\n      console.error('[S.P.I.R.E. Master]',error);`;
  const catchAfter = `    }catch(error){\n      clearChartHydrationMask();\n      console.error('[S.P.I.R.E. Master]',error);`;
  if (!source.includes(catchBefore)) throw new Error('Spire workspace performance guard could not find bootstrap error handler');
  source = source.replace(catchBefore, catchAfter);
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
  'if (!force && hasLiveViewContent(target)) return Promise.resolve();',
  "if (active !== 'summary-view') await activateView(active);",
  'const bootPatientId=currentPatientId();',
  'setChartHydrationMask',
  'spire:fullscreen-intent-v1',
  'Resume Full Screen',
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error(`Spire workspace performance verification failed: missing ${needle}`);
}

for (const forbidden of [
  'if (!force && viewIsFresh(viewId) && hasLiveViewContent(target)) return Promise.resolve();',
  "if (active !== 'summary-view') await activateView(active, { force: true });",
  'const CHART_SNAPSHOT_TTL_MS = 90 * 1000;',
]) {
  if (source.includes(forbidden)) throw new Error(`Spire workspace performance verification failed: stale reload behavior remains: ${forbidden}`);
}

await writeFile(masterPath, source, 'utf8');

console.log('Spire workspace performance v2 installed: same-patient snapshot restores before workspace loading, chart/workspace requests overlap, loaded tabs stay mounted for instant revisits, active tabs are not force-reloaded, placeholder templates are masked during hydration, and native fullscreen intent survives refresh with one-click browser-safe resume.');
