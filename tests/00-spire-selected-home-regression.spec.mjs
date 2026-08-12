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

test('SPIRE selected home opens user master-template chart without render loops',async({page})=>{
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
    if(path===`/api/spire/patients/${PATIENT_ID}/assessments/overview`&&method==='GET')return json(route,{data:{responses:[],due:[]}});
    if(path==='/api/spire/assessment-templates'&&method==='GET')return json(route,{data:[]});
    if(method==='GET')return json(route,{data:[]});
    return json(route,{data:{ok:true}});
  });

  await page.goto(`/spire.html?spireHome=${HOME_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});

  const strip=page.locator('#spirePatientStrip');
  const chart=page.locator('#spireChartWorkspace');
  await expect(page.locator('body')).toHaveClass(/spmt-ready/);
  await expect(strip).toContainText('Synthetic SPIRE Patient');
  await expect(chart).toHaveClass(/active/);
  await expect(chart.locator('[data-chart-tab="chart-review"]')).toBeVisible();
  await expect(chart.locator('[data-spmt-special="flowsheets"]')).toBeVisible();
  await expect(page.locator('#spireMasterToolbar')).toBeVisible();
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toBeVisible();
  await expect(page.locator('#spireChartTabBody')).toContainText('Synthetic progress note');

  const workstation=await page.evaluate(()=>{
    const chart=document.getElementById('spireChartWorkspace');
    const tabs=chart?.querySelector(':scope > .chart-tabs');
    const inactiveTab=chart?.querySelector('[data-chart-tab="results-review"]');
    const activeTab=chart?.querySelector('[data-chart-tab="chart-review"]');
    const flowsheetsTab=chart?.querySelector('[data-spmt-special="flowsheets"]');
    const left=document.querySelector('.spire-left-rail');
    const right=document.querySelector('.spire-right-rail');
    const strip=document.getElementById('spirePatientStrip');
    const shell=document.querySelector('.spire-shell');
    const brand=document.querySelector('.spire-brand');
    const brandText=document.querySelector('.spire-brand strong');
    const logoMark=document.querySelector('.spire-logo-mark');
    const topbar=document.querySelector('.spire-topbar');
    const topAction=document.querySelector('.spire-top-actions button');
    const masterToolbar=document.getElementById('spireMasterToolbar');
    const stylesheets=[...document.styleSheets].map(sheet=>sheet.href||'');
    const stylesheet=stylesheets.find(href=>href.includes('spire-clinical-workstation.css'))||'';
    const controlStylesheet=stylesheets.find(href=>href.includes('spire-sulandra-controls-final.css'))||'';
    const masterStylesheet=stylesheets.find(href=>href.includes('spire-user-template-integration.css'))||'';
    const masterLayoutStylesheet=stylesheets.find(href=>href.includes('spire-user-template-layout-fix.css'))||'';
    const chartRect=chart?.getBoundingClientRect();
    const tabsRect=tabs?.getBoundingClientRect();
    const stripRect=strip?.getBoundingClientRect();
    const shellRect=shell?.getBoundingClientRect();
    const inactiveStyle=inactiveTab?getComputedStyle(inactiveTab):null;
    const activeStyle=activeTab?getComputedStyle(activeTab):null;
    const inactiveBefore=inactiveTab?getComputedStyle(inactiveTab,'::before'):null;
    const topbarStyle=topbar?getComputedStyle(topbar):null;
    const topActionStyle=topAction?getComputedStyle(topAction):null;
    const toolbarStyle=masterToolbar?getComputedStyle(masterToolbar):null;
    const brandStyle=brand?getComputedStyle(brand):null;
    const brandTextStyle=brandText?getComputedStyle(brandText):null;
    return {
      stylesheet,
      controlStylesheet,
      masterStylesheet,
      masterLayoutStylesheet,
      masterRuntime:window.SpireMasterTemplate?.version||'',
      appFontFamily:getComputedStyle(document.querySelector('.spire-app')).fontFamily,
      chartDisplay:chart?getComputedStyle(chart).display:'',
      tabsDirection:tabs?getComputedStyle(tabs).flexDirection:'',
      tabBeforeDisplay:inactiveBefore?.display||'',
      tabBorderRadius:inactiveStyle?.borderRadius||'',
      tabFontWeight:inactiveStyle?.fontWeight||'',
      inactiveTabBackground:inactiveStyle?.backgroundColor||'',
      activeTabBackground:activeStyle?.backgroundColor||'',
      flowsheetsTabText:flowsheetsTab?.textContent?.trim()||'',
      topbarBackgroundImage:topbarStyle?.backgroundImage||'',
      topbarHeight:topbar?.getBoundingClientRect().height||0,
      topbarBorderBottomColor:topbarStyle?.borderBottomColor||'',
      topbarBorderBottomWidth:topbarStyle?.borderBottomWidth||'',
      topActionBackground:topActionStyle?.backgroundColor||'',
      topActionColor:topActionStyle?.color||'',
      topActionBorderRadius:topActionStyle?.borderRadius||'',
      masterToolbarBackground:toolbarStyle?.backgroundColor||'',
      masterToolbarHeight:masterToolbar?.getBoundingClientRect().height||0,
      leftDisplay:left?getComputedStyle(left).display:'',
      rightDisplay:right?getComputedStyle(right).display:'',
      rightWidth:right?right.getBoundingClientRect().width:0,
      patientStripWidth:stripRect?.width||0,
      patientStripHeight:stripRect?.height||0,
      patientStripRight:stripRect?.right||0,
      shellLeft:shellRect?.left||0,
      chartTop:chartRect?.top||0,
      tabsTop:tabsRect?.top||0,
      tabsWidth:tabsRect?.width||0,
      tabsHeight:tabsRect?.height||0,
      brandWidth:brand?.getBoundingClientRect().width||0,
      brandBackground:brandStyle?.backgroundColor||'',
      brandTextBackground:brandTextStyle?.backgroundColor||'',
      brandTextColor:brandTextStyle?.color||'',
      brandFontStyle:brandTextStyle?.fontStyle||'',
      brandFontWeight:brandTextStyle?.fontWeight||'',
      brandText:brandText?.textContent?.trim()||'',
      logoMarkDisplay:logoMark?getComputedStyle(logoMark).display:'',
    };
  });
  console.log('SPIRE user master-template diagnostics',JSON.stringify(workstation));
  expect(workstation.stylesheet).toContain('20260811-spire-clinical-workstation-2');
  expect(workstation.controlStylesheet).toContain('20260811-sulandra-controls-lock-1');
  expect(workstation.masterStylesheet).toContain('spire-user-template-integration.css?v=20260812-user-master-template-3');
  expect(workstation.masterLayoutStylesheet).toContain('spire-user-template-layout-fix.css?v=20260812-user-master-template-3');
  expect(workstation.masterRuntime).toBe('20260812-user-master-template-2');
  expect(workstation.appFontFamily).toContain('Segoe UI');
  expect(workstation.chartDisplay).toBe('grid');
  expect(workstation.tabsDirection).toBe('row');
  expect(workstation.tabBeforeDisplay).toBe('none');
  expect(workstation.tabBorderRadius).toBe('0px');
  expect(Number(workstation.tabFontWeight)).toBeLessThanOrEqual(700);
  expect(['rgba(0, 0, 0, 0)','rgb(216, 228, 240)','rgb(226, 232, 240)']).toContain(workstation.inactiveTabBackground);
  expect(workstation.activeTabBackground).toBe('rgb(255, 255, 255)');
  expect(workstation.flowsheetsTabText).toBe('Flowsheets');
  expect(workstation.topbarBackgroundImage).toContain('linear-gradient');
  expect(workstation.topbarHeight).toBeGreaterThanOrEqual(39);
  expect(workstation.topbarHeight).toBeLessThanOrEqual(41);
  expect(workstation.topbarBorderBottomColor).toBe('rgb(30, 41, 59)');
  expect(workstation.topbarBorderBottomWidth).toBe('1px');
  expect(workstation.topActionBackground).toMatch(/rgba?\(/);
  expect(workstation.topActionColor).toBe('rgb(255, 255, 255)');
  expect(workstation.topActionBorderRadius).toBe('3px');
  expect(workstation.masterToolbarBackground).toBe('rgb(153, 0, 0)');
  expect(workstation.masterToolbarHeight).toBeGreaterThanOrEqual(35);
  expect(workstation.masterToolbarHeight).toBeLessThanOrEqual(37);
  expect(workstation.leftDisplay).toBe('none');
  expect(workstation.rightDisplay).not.toBe('none');
  expect(workstation.rightWidth).toBeGreaterThanOrEqual(270);
  expect(workstation.rightWidth).toBeLessThanOrEqual(290);
  expect(workstation.patientStripWidth).toBeGreaterThanOrEqual(270);
  expect(workstation.patientStripWidth).toBeLessThanOrEqual(290);
  expect(workstation.patientStripHeight).toBeGreaterThan(500);
  expect(Math.abs(workstation.patientStripRight-workstation.shellLeft)).toBeLessThan(3);
  expect(workstation.tabsWidth).toBeGreaterThan(workstation.tabsHeight*6);
  expect(Math.abs(workstation.chartTop-workstation.tabsTop)).toBeLessThan(3);
  expect(workstation.brandWidth).toBeGreaterThan(90);
  expect(['rgba(0, 0, 0, 0)','transparent']).toContain(workstation.brandBackground);
  expect(workstation.brandTextBackground).toBe('rgb(255, 255, 255)');
  expect(workstation.brandTextColor).toBe('rgb(168, 0, 0)');
  expect(workstation.brandFontStyle).toBe('italic');
  expect(Number(workstation.brandFontWeight)).toBeGreaterThanOrEqual(800);
  expect(workstation.brandText).toBe('Spire');
  expect(workstation.logoMarkDisplay).toBe('none');

  // Dedicated clinical tabs still own real rendering under the master shell.
  await page.locator('[data-chart-tab="assessments"]').click();
  await expect(page.locator('#spireChartTabBody .spire-assessment-head')).toBeVisible();
  await expect(page.locator('#spireChartTabBody')).toContainText('Clinical Assessments');
  await expect(page.locator('#spireChartTabBody .json-foundation')).toHaveCount(0);
  await expect(page.locator('#spireChartTabBody')).toContainText('No assessments documented yet.');

  await page.locator('[data-chart-tab="chart-review"]').click();
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toBeVisible();
  const chartReviewCallsAfterNavigation=chartReviewCalls;

  await page.waitForTimeout(1800);
  await expect(chart).toHaveClass(/active/);
  await expect(page.locator('#spireMasterToolbar')).toBeVisible();
  await expect(page.locator('#spireChartTabBody .spire-cr-layout')).toHaveCount(1);
  expect(chartReviewCalls,'Chart Review kept refetching after the explicit navigation settled').toBe(chartReviewCallsAfterNavigation);

  const observerDiagnostics=await page.evaluate(()=>({
    breaker:document.documentElement.dataset.spireObserverCircuitBreaker||'',
    quarantined:document.documentElement.dataset.spireUnsafeObserverQuarantined||'',
    workspaceSuppressed:document.documentElement.dataset.spireWorkspaceObserverSuppressed||'',
    workspaceRestored:document.documentElement.dataset.spireWorkspaceObserverRestored||'',
    guard:window.SpirePatientOpenGuard?.contract||'',
    specialized:window.SpireSpecializedTabOwnership?.contract||'',
    master:window.SpireMasterTemplate?.version||'',
  }));
  console.log('SPIRE observer diagnostics',JSON.stringify(observerDiagnostics));
  expect(observerDiagnostics.breaker,`A SPIRE MutationObserver became runaway: ${observerDiagnostics.breaker}`).toBe('');
  expect(observerDiagnostics.specialized).toBe('20260811-spire-specialized-tab-ownership-1');
  expect(observerDiagnostics.master).toBe('20260812-user-master-template-2');
  expect(pageErrors,'SPIRE emitted browser page errors while opening the selected-home chart').toEqual([]);
  expect(consoleErrors.filter(line=>!line.includes('observer circuit breaker')),'SPIRE emitted unexpected console errors').toEqual([]);
});
