import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../tests/production-business-path-uat.spec.mjs', import.meta.url);
let source = await readFile(target, 'utf8');

const helper = `\nasync function dumpItem7Runtime(page,label){\n  const state=await page.evaluate(()=>({\n    href:location.href,pathname:location.pathname,search:location.search,hash:location.hash,readyState:document.readyState,\n    tokenSession:Boolean(sessionStorage.getItem('sulandra:employee:access-token')),tokenLocal:Boolean(localStorage.getItem('sulandra:employee:access-token')),\n    spireApp:Boolean(document.getElementById('spireApp')),spireAppHtml:document.getElementById('spireApp')?.innerHTML?.length||0,\n    strip:Boolean(document.getElementById('spirePatientStrip')),stripHidden:document.getElementById('spirePatientStrip')?.hidden??null,\n    chart:Boolean(document.getElementById('spireChartWorkspace')),chartClass:document.getElementById('spireChartWorkspace')?.className||null,chartHtml:document.getElementById('spireChartWorkspace')?.innerHTML?.length||0,\n    chartTabs:document.querySelectorAll('[data-chart-tab]').length,patientRows:document.querySelectorAll('[data-patient-id]').length,\n    openPatient:typeof window.SpireOpenPatient,ensureShell:typeof window.SpireEnsureShell,\n    canonical:window.SpireCanonicalBootstrap?.contract||null,resilience:window.SpireShellResilience?.contract||null,chartReady:window.SpireChartReady?.contract||null,recovery:window.SpireChartRecovery?.contract||null,\n    bodyReady:document.body?.dataset?.spireChartReady||null,bodyPatient:document.body?.dataset?.spireChartPatientId||null,storedPatient:sessionStorage.getItem('spire:patientId')||null,\n    hhActiveRail:document.documentElement?.dataset?.homeHealthActiveRail||null,hhRailContract:document.documentElement?.dataset?.homeHealthRailStability||null,\n    hhIntakesHidden:document.getElementById('intakesRail')?.hidden??null,hhEpisodesHidden:document.getElementById('episodesRail')?.hidden??null,\n    openEpisodeVisible:[...document.querySelectorAll('[data-open-episode]')].map(el=>({hidden:el.hidden,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,text:el.textContent?.trim()})),\n  }));\n  console.log('[ITEM7-RUNTIME]',label,JSON.stringify(state));\n}\n`;
if(!source.includes('async function dumpItem7Runtime')) source=source.replace('\nfunction noUnexpected(h)',helper+'\nfunction noUnexpected(h)');

source=source.replace(
  `await clickVisible(page,'a[href*="/spire.html?patientId=biz-patient"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await expect(page.locator('#spirePatientStrip')).toBeVisible();`,
  `await clickVisible(page,'a[href*="/spire.html?patientId=biz-patient"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await page.waitForTimeout(1200);await dumpItem7Runtime(page,'intake-after-spire-navigation');await expect(page.locator('#spirePatientStrip')).toBeVisible();`
);
source=source.replace(
  `await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await expect(page.locator('#spirePatientStrip')).toBeVisible();`,
  `await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await page.waitForTimeout(1200);await dumpItem7Runtime(page,'dsp-after-emar-navigation');await expect(page.locator('#spirePatientStrip')).toBeVisible();`
);
source=source.replace(
  `const intakesRail=page.locator('[data-rail="intakes"]');if(await intakesRail.isVisible().catch(()=>false))await intakesRail.click();await clickVisible(page,'[data-open-episode]');`,
  `const intakesRail=page.locator('[data-rail="intakes"]');if(await intakesRail.isVisible().catch(()=>false)){await dumpItem7Runtime(page,'hh-before-intakes-click');await intakesRail.click({timeout:3000}).catch(async e=>{console.log('[ITEM7-HH-CLICK-ERROR]',e.message);await dumpItem7Runtime(page,'hh-intakes-click-error');});}await page.waitForTimeout(500);await dumpItem7Runtime(page,'hh-after-intakes-click');await clickVisible(page,'[data-open-episode]');`
);
source=source.replace(
  `await clickVisible(page,\`[data-patient-id="${'${patient.id}'}"]\`);await expect(page.locator('#spirePatientStrip')).toBeVisible();`,
  `await clickVisible(page,\`[data-patient-id="${'${patient.id}'}"]\`);await page.waitForTimeout(1200);await dumpItem7Runtime(page,'incident-after-patient-click');await expect(page.locator('#spirePatientStrip')).toBeVisible();`
);

await writeFile(target,source,'utf8');
console.log('Targeted Item 7 runtime diagnostics installed for the four remaining red paths.');
