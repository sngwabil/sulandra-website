import { test, expect } from '@playwright/test';

const API='https://sulandra-website-production-5fc4.up.railway.app';
const HOME_ID='biz-spire-home';
const PATIENT_ID='biz-spire-patient';
const TOKEN='biz-spire-selected-home-token';

const patient={
  id:PATIENT_ID,
  patientId:PATIENT_ID,
  firstName:'Synthetic',
  lastName:'SPIRE Patient',
  preferredName:'Synthetic',
  name:'Synthetic SPIRE Patient',
  medicalRecordNumber:'SPIRE-UAT-0001',
  dateOfBirth:'1990-01-01',
  sexAtBirth:'FEMALE',
  homeName:'Synthetic SPIRE Home',
  programName:'Community Living',
  flags:[],
  riskAlerts:[],
  allergies:[],
  diagnoses:[],
  problems:[],
  careTeam:[],
  latestVitals:{systolic:120,diastolic:76,pulse:74,spo2:98},
  openOrderCount:0,
  openTaskCount:0,
  activeMedicationCount:0,
};

function json(route,data,status=200){
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
}

test('SPIRE selected home opens one patient chart without render loops',async({page})=>{
  let chartReviewCalls=0;
  const pageErrors=[];
  const consoleErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error?.message||error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});

  await page.addInitScript(({token})=>{
    sessionStorage.setItem('sulandra:employee:access-token',token);
    localStorage.setItem('sulandra:employee:access-token',token);
    sessionStorage.setItem('spire:selected-service-home-name','Synthetic SPIRE Home');
    sessionStorage.setItem('spire:selected-service-home-entity','entity-scls');
  },{token:TOKEN});

  await page.route(`${API}/**`,async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    const method=request.method().toUpperCase();

    if(path==='/api/entity-context')return json(route,{data:{entities:[{id:'entity-scls',code:'SCLS',displayName:'Sulandra Community Living Services',status:'ACTIVE'}],primaryEntityId:'entity-scls',enterpriseOwner:false}});
    if(['/api/session','/api/auth/session','/api/auth/me'].includes(path))return json(route,{data:{id:'biz-spire-user',userId:'biz-spire-user',email:'spire.uat@sulandrahealth.test',displayName:'Synthetic SPIRE User',role:'RN',status:'ACTIVE'},session:{id:'biz-spire-user',userId:'biz-spire-user',email:'spire.uat@sulandrahealth.test',displayName:'Synthetic SPIRE User',role:'RN',status:'ACTIVE'}});
    if(path===`/api/spire/network/service-homes/${HOME_ID}/patients`)return json(route,{data:[patient]});
    if(path===`/api/spire/network/service-homes/${HOME_ID}/schedule`)return json(route,{data:[]});
    if(path===`/api/spire/network/service-homes/${HOME_ID}/inbasket`)return json(route,{data:[]});
    if(path===`/api/spire/patients/${PATIENT_ID}`&&method==='GET')return json(route,{data:patient});
    if(path===`/api/spire/patients/${PATIENT_ID}/storyboard`&&method==='GET')return json(route,{data:patient});
    if(path===`/api/spire/patients/${PATIENT_ID}/chart-review-v2`&&method==='GET'){
      chartReviewCalls+=1;
      return json(route,{data:{items:[{id:'biz-chart-item',resourceId:'biz-chart-item',type:'Note',description:'Synthetic progress note',status:'SIGNED',author:'Synthetic RN',date:'2026-08-11T12:00:00.000Z'}]}});
    }
    if(method==='GET')return json(route,{data:[]});
    return json(route,{data:{ok:true}});
  });

  // Commit returns as soon as the document navigation is accepted. This lets the
  // regression distinguish a renderer freeze from a normal DOMContentLoaded delay.
  await page.goto(`/spire.html?spireHome=${HOME_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});

  const strip=page.locator('#spirePatientStrip');
  const chart=page.locator('#spireChartWorkspace');
  await expect(strip).toContainText('Synthetic SPIRE Patient');
  await expect(chart).toHaveClass(/active/);
  await expect(chart.locator('[data-chart-tab="chart-review"]')).toBeVisible();
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toBeVisible();
  await expect(page.locator('#spireChartTabBody')).toContainText('Synthetic progress note');

  await page.waitForTimeout(1800);
  await expect(chart).toHaveClass(/active/);
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toHaveCount(1);
  expect(chartReviewCalls,'Chart Review repeatedly refetched after rendering its own DOM').toBeLessThanOrEqual(3);

  const observerDiagnostics=await page.evaluate(()=>({
    breaker:document.documentElement.dataset.spireObserverCircuitBreaker||'',
    quarantined:document.documentElement.dataset.spireUnsafeObserverQuarantined||'',
    workspaceSuppressed:document.documentElement.dataset.spireWorkspaceObserverSuppressed||'',
    workspaceRestored:document.documentElement.dataset.spireWorkspaceObserverRestored||'',
    guard:window.SpirePatientOpenGuard?.contract||'',
  }));
  console.log('SPIRE observer diagnostics',JSON.stringify(observerDiagnostics));
  expect(observerDiagnostics.breaker,`A SPIRE MutationObserver became runaway: ${observerDiagnostics.breaker}`).toBe('');
  expect(pageErrors,'SPIRE emitted browser page errors while opening the selected-home chart').toEqual([]);
  expect(consoleErrors.filter(line=>!line.includes('observer circuit breaker')),'SPIRE emitted unexpected console errors').toEqual([]);
});
