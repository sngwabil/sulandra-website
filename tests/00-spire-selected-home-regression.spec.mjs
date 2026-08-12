import { test, expect } from '@playwright/test';

const API='https://sulandra-website-production-5fc4.up.railway.app';
const HOME_ID='biz-spire-home';
const PATIENT_ID='biz-spire-patient';
const TOKEN='biz-spire-selected-home-token';

const patient={
  id:PATIENT_ID,patientId:PATIENT_ID,firstName:'Synthetic',lastName:'SPIRE Patient',preferredName:'Synthetic',name:'Synthetic SPIRE Patient',
  medicalRecordNumber:'SPIRE-UAT-0001',dateOfBirth:'1990-01-01',sexAtBirth:'FEMALE',homeName:'Synthetic SPIRE Home',programName:'Community Living',
  flags:[],riskAlerts:[],allergies:[],diagnoses:[],problems:[],careTeam:[],latestVitals:{systolic:120,diastolic:76,pulse:74,spo2:98},openOrderCount:0,openTaskCount:0,activeMedicationCount:0,
};
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});

test('SPIRE selected home opens the master workstation without render loops',async({page})=>{
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
    if(path===`/api/spire/network/service-homes/${HOME_ID}/schedule`||path===`/api/spire/network/service-homes/${HOME_ID}/inbasket`)return json(route,{data:[]});
    if((path===`/api/spire/patients/${PATIENT_ID}`||path===`/api/spire/patients/${PATIENT_ID}/storyboard`)&&method==='GET')return json(route,{data:patient});
    if(path===`/api/spire/patients/${PATIENT_ID}/chart-review-v2`&&method==='GET'){
      chartReviewCalls+=1;
      return json(route,{data:{items:[{id:'biz-chart-item',resourceId:'biz-chart-item',type:'Note',description:'Synthetic progress note',status:'SIGNED',author:'Synthetic RN',date:'2026-08-11T12:00:00.000Z'}]}});
    }
    if(path===`/api/spire/patients/${PATIENT_ID}/assessments/overview`&&method==='GET')return json(route,{data:{responses:[],due:[]}});
    if(path==='/api/spire/assessment-templates'&&method==='GET')return json(route,{data:[]});
    if(method==='GET')return json(route,{data:[]});
    return json(route,{error:'UAT blocks live mutation'},409);
  });

  await page.goto(`/spire.html?spireHome=${HOME_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});

  const chart=page.locator('#spireChartWorkspace');
  const strip=page.locator('#spirePatientStrip');
  await expect(page.locator('body')).toHaveClass(/spmt-ready/);
  await expect(strip).toContainText('Synthetic SPIRE Patient');
  await expect(chart).toHaveClass(/active/);
  await expect(page.locator('#spireMasterToolbar')).toBeVisible();
  await expect(chart.locator('[data-spmt-special="flowsheets"]')).toBeVisible();
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toBeVisible();
  await expect(page.locator('#spireChartTabBody')).toContainText('Synthetic progress note');

  const master=await page.evaluate(()=>({
    runtime:window.SpireMasterTemplate?.version||'',
    chartOwner:window.SpireChartReviewOwnership?.contract||'',
    patientGuard:window.SpirePatientOpenGuard?.contract||'',
    specialized:window.SpireSpecializedTabOwnership?.contract||'',
    intake:window.SpireIntakeIspSleepWiring?.contract||'',
    breaker:document.documentElement.dataset.spireObserverCircuitBreaker||'',
    appGrid:getComputedStyle(document.querySelector('.spire-app')).display,
    titleHeight:document.querySelector('.spire-topbar')?.getBoundingClientRect().height||0,
    toolbarHeight:document.getElementById('spireMasterToolbar')?.getBoundingClientRect().height||0,
    patientWidth:document.getElementById('spirePatientStrip')?.getBoundingClientRect().width||0,
    rightWidth:document.getElementById('spireRightRail')?.getBoundingClientRect().width||0,
    titleBackground:getComputedStyle(document.querySelector('.spire-topbar')).backgroundImage,
    toolbarBackground:getComputedStyle(document.getElementById('spireMasterToolbar')).backgroundColor,
    styles:[...document.styleSheets].map(sheet=>sheet.href||''),
  }));
  expect(master.runtime).toBe('20260812-user-master-template-2');
  expect(master.chartOwner).toBe('20260812-spire-chart-review-ownership-1');
  expect(master.patientGuard).toBe('20260811-spire-patient-open-guard-7');
  expect(master.specialized).toBe('20260811-spire-specialized-tab-ownership-1');
  expect(master.intake).toBe('20260812-spire-intake-isp-sleep-2');
  expect(master.breaker).toBe('');
  expect(master.appGrid).toBe('grid');
  expect(master.titleHeight).toBeGreaterThanOrEqual(39);
  expect(master.titleHeight).toBeLessThanOrEqual(41);
  expect(master.toolbarHeight).toBeGreaterThanOrEqual(35);
  expect(master.toolbarHeight).toBeLessThanOrEqual(37);
  expect(master.patientWidth).toBeGreaterThanOrEqual(260);
  expect(master.patientWidth).toBeLessThanOrEqual(300);
  expect(master.rightWidth).toBeGreaterThanOrEqual(250);
  expect(master.titleBackground).toContain('linear-gradient');
  expect(master.toolbarBackground).toBe('rgb(153, 0, 0)');
  expect(master.styles.some(href=>href.includes('spire-user-template-integration.css?v=20260812-user-master-template-8'))).toBeTruthy();
  expect(master.styles.some(href=>href.includes('spire-user-template-final-lock.css?v=20260812-user-master-template-8'))).toBeTruthy();

  await page.locator('[data-chart-tab="assessments"]').click();
  await expect(page.locator('#spireChartTabBody .spire-assessment-head')).toBeVisible();
  await expect(page.locator('#spireChartTabBody')).toContainText('Clinical Assessments');
  await expect(page.locator('#spireChartTabBody .json-foundation')).toHaveCount(0);

  await page.locator('[data-chart-tab="chart-review"]').click();
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toBeVisible();
  const settledCalls=chartReviewCalls;
  await page.waitForTimeout(1800);
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toHaveCount(1);
  expect(chartReviewCalls,'Chart Review kept refetching after the owned renderer settled').toBe(settledCalls);

  const finalBreaker=await page.evaluate(()=>document.documentElement.dataset.spireObserverCircuitBreaker||'');
  expect(finalBreaker,'A SPIRE MutationObserver became runaway').toBe('');
  expect(pageErrors,'SPIRE emitted browser page errors').toEqual([]);
  expect(consoleErrors.filter(line=>!line.includes('observer circuit breaker')),'SPIRE emitted unexpected console errors').toEqual([]);
});