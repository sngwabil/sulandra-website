import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../tests/production-business-path-uat.spec.mjs', import.meta.url);
let source = await readFile(target, 'utf8');

const helper = `\nasync function dumpItem7Runtime(page,label){\n  const state=await page.evaluate(()=>({\n    href:location.href,pathname:location.pathname,search:location.search,hash:location.hash,readyState:document.readyState,\n    tokenSession:Boolean(sessionStorage.getItem('sulandra:employee:access-token')),tokenLocal:Boolean(localStorage.getItem('sulandra:employee:access-token')),\n    spireApp:Boolean(document.getElementById('spireApp')),spireAppHtml:document.getElementById('spireApp')?.innerHTML?.length||0,\n    strip:Boolean(document.getElementById('spirePatientStrip')),stripHidden:document.getElementById('spirePatientStrip')?.hidden??null,\n    chart:Boolean(document.getElementById('spireChartWorkspace')),chartClass:document.getElementById('spireChartWorkspace')?.className||null,chartHtml:document.getElementById('spireChartWorkspace')?.innerHTML?.length||0,\n    chartTabs:document.querySelectorAll('[data-chart-tab]').length,patientRows:document.querySelectorAll('[data-patient-id]').length,\n    openPatient:typeof window.SpireOpenPatient,ensureShell:typeof window.SpireEnsureShell,\n    canonical:window.SpireCanonicalBootstrap?.contract||null,resilience:window.SpireShellResilience?.contract||null,chartReady:window.SpireChartReady?.contract||null,recovery:window.SpireChartRecovery?.contract||null,\n    bodyReady:document.body?.dataset?.spireChartReady||null,bodyPatient:document.body?.dataset?.spireChartPatientId||null,storedPatient:sessionStorage.getItem('spire:patientId')||null,\n    hhActiveRail:document.documentElement?.dataset?.homeHealthActiveRail||null,hhRailContract:document.documentElement?.dataset?.homeHealthRailStability||null,\n    hhIntakesHidden:document.getElementById('intakesRail')?.hidden??null,hhEpisodesHidden:document.getElementById('episodesRail')?.hidden??null,\n    openEpisodeVisible:[...document.querySelectorAll('[data-open-episode]')].map((el,i)=>({i,hidden:el.hidden,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,text:el.textContent?.trim()})),\n  }));\n  console.log('[ITEM7-RUNTIME]',label,JSON.stringify(state));\n}\n`;
if(!source.includes('async function dumpItem7Runtime')) source=source.replace('\nfunction noUnexpected(h)',helper+'\nfunction noUnexpected(h)');

function addBefore(needle, insertion){
  if(source.includes(insertion)) return;
  if(source.includes(needle)) source=source.replace(needle,insertion+needle);
}

addBefore(
  `await expect(page.locator('body[data-spire-chart-ready="true"][data-spire-chart-patient-id="biz-patient"]')).toBeVisible();`,
  `await page.waitForTimeout(1200);await dumpItem7Runtime(page,'intake-before-readiness');`
);
addBefore(
  'await expect(page.locator(`body[data-spire-chart-ready="true"][data-spire-chart-patient-id="${patient.id}"]`)).toBeVisible();',
  `await page.waitForTimeout(1200);await dumpItem7Runtime(page,'spire-before-dynamic-readiness');`
);

source=source.replace(
  `const intakesRail=page.locator('[data-rail="intakes"]');if(await intakesRail.isVisible().catch(()=>false))await intakesRail.click();await clickVisible(page,'[data-open-episode]');`,
  `const intakesRail=page.locator('[data-rail="intakes"]');if(await intakesRail.isVisible().catch(()=>false)){await dumpItem7Runtime(page,'hh-before-intakes-click');await intakesRail.click({timeout:3000}).catch(async e=>{console.log('[ITEM7-HH-CLICK-ERROR]',e.message);await dumpItem7Runtime(page,'hh-intakes-click-error');});}await page.waitForTimeout(500);await dumpItem7Runtime(page,'hh-after-intakes-click');await clickVisible(page,'[data-open-episode]');`
);

await writeFile(target,source,'utf8');
console.log('Targeted Item 7 runtime diagnostics installed immediately before SPIRE readiness checks and around the Home Health rail transition.');
