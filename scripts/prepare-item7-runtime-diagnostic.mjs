import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../tests/production-business-path-uat.spec.mjs', import.meta.url);
let source = await readFile(target, 'utf8');

const helper = `\nasync function dumpItem7Runtime(page,label){\n  const state=await page.evaluate(()=>({\n    href:location.href,pathname:location.pathname,search:location.search,hash:location.hash,readyState:document.readyState,\n    tokenSession:Boolean(sessionStorage.getItem('sulandra:employee:access-token')),tokenLocal:Boolean(localStorage.getItem('sulandra:employee:access-token')),\n    spireApp:Boolean(document.getElementById('spireApp')),spireAppHtml:document.getElementById('spireApp')?.innerHTML?.length||0,\n    strip:Boolean(document.getElementById('spirePatientStrip')),stripHidden:document.getElementById('spirePatientStrip')?.hidden??null,\n    chart:Boolean(document.getElementById('spireChartWorkspace')),chartClass:document.getElementById('spireChartWorkspace')?.className||null,chartHtml:document.getElementById('spireChartWorkspace')?.innerHTML?.length||0,\n    chartTabs:document.querySelectorAll('[data-chart-tab]').length,patientRows:document.querySelectorAll('[data-patient-id]').length,\n    openPatient:typeof window.SpireOpenPatient,ensureShell:typeof window.SpireEnsureShell,\n    canonical:window.SpireCanonicalBootstrap?.contract||null,resilience:window.SpireShellResilience?.contract||null,chartReady:window.SpireChartReady?.contract||null,recovery:window.SpireChartRecovery?.contract||null,\n    bodyReady:document.body?.dataset?.spireChartReady||null,bodyPatient:document.body?.dataset?.spireChartPatientId||null,storedPatient:sessionStorage.getItem('spire:patientId')||null,\n  }));\n  console.log('[ITEM7-RUNTIME]',label,JSON.stringify(state));\n}\n`;
if(!source.includes('async function dumpItem7Runtime')) source=source.replace('\nfunction noUnexpected(h)',helper+'\nfunction noUnexpected(h)');

function replaceOnce(from,to){ if(source.includes(from)&&!source.includes(to)) source=source.replace(from,to); }

replaceOnce(
  `await clickVisible(page,'a[href*="/spire.html?patientId=biz-patient"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);`,
  `await clickVisible(page,'a[href*="/spire.html?patientId=biz-patient"]');await dumpItem7Runtime(page,'intake-immediately-after-chart-click');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);`
);
replaceOnce(
  `await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);`,
  `await page.getByRole('link',{name:/Open eMAR/i}).first().click();await dumpItem7Runtime(page,'dsp-immediately-after-emar-click');await expect(page).toHaveURL(/\\/spire\\.html/);`
);
replaceOnce(
  'await clickVisible(page,`[data-patient-id="${patient.id}"]`);await expect(page.locator(`body[data-spire-chart-ready="true"][data-spire-chart-patient-id="${patient.id}"]`)).toBeVisible();',
  'await clickVisible(page,`[data-patient-id="${patient.id}"]`);await dumpItem7Runtime(page,\'incident-immediately-after-patient-click\');await expect(page.locator(`body[data-spire-chart-ready="true"][data-spire-chart-patient-id="${patient.id}"]`)).toBeVisible();'
);

await writeFile(target,source,'utf8');
console.log('Targeted SPIRE diagnostics installed immediately after the three unresolved chart-open actions.');
