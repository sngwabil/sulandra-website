import { test, expect } from '@playwright/test';

const API='https://sulandra-website-production-5fc4.up.railway.app';
const HOME_ID='biz-spire-home';
const PATIENT_ID='biz-spire-patient';
const TOKEN='biz-spire-intake-wiring-token';
const patient={id:PATIENT_ID,patientId:PATIENT_ID,firstName:'Synthetic',lastName:'SPIRE Patient',preferredName:'Synthetic',name:'Synthetic SPIRE Patient',medicalRecordNumber:'SPIRE-UAT-0001',dateOfBirth:'1990-01-01',sexAtBirth:'FEMALE',homeName:'Synthetic SPIRE Home',programName:'Community Living',flags:[],riskAlerts:[],allergies:[],diagnoses:[],problems:[],careTeam:[],latestVitals:{systolic:120,diastolic:76,pulse:74,spo2:98},openOrderCount:0,openTaskCount:0,activeMedicationCount:0};
const admission={id:'intake-uat-1',serviceType:'Residential HPC',programCode:'SCLS',approvedAt:'2026-08-12T12:00:00.000Z',referralSource:'Synthetic UAT',companyName:'Sulandra Community Living Services',sections:[{sectionKey:'preferences_routines',sectionTitle:'Preferences, Routines & Interests',payload:{sleepPreferences:'Usually sleeps 10 PM to 6 AM; document overnight observations.',morningRoutine:'Prefers breakfast after hygiene.'}},{sectionKey:'goals_outcomes',sectionTitle:'Personal Goals & Desired Outcomes',payload:{serviceGoals:'Increase independence with morning routine.',howProgressMeasured:'Document ISP progress each shift.'}}],attachments:[{id:'attachment-1',title:'Official OhioISP',originalFileName:'synthetic-ohioisp.pdf',documentType:'OHIO_ISP'}],signatures:[{signatureType:'GUARDIAN_ACKNOWLEDGMENT',signerName:'Synthetic Guardian',signerRelationship:'Guardian',signedAt:'2026-08-12T12:05:00.000Z'}]};
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});

async function installApi(page){
  await page.addInitScript(({token})=>{sessionStorage.setItem('sulandra:employee:access-token',token);localStorage.setItem('sulandra:employee:access-token',token);sessionStorage.setItem('spire:selected-service-home-name','Synthetic SPIRE Home');sessionStorage.setItem('spire:selected-service-home-entity','entity-scls');},{token:TOKEN});
  await page.route(`${API}/**`,async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method().toUpperCase();
    if(path==='/api/entity-context')return json(route,{data:{entities:[{id:'entity-scls',code:'SCLS',displayName:'Sulandra Community Living Services',status:'ACTIVE'}],primaryEntityId:'entity-scls',enterpriseOwner:false}});
    if(['/api/session','/api/auth/session','/api/auth/me'].includes(path))return json(route,{data:{id:'biz-spire-user',userId:'biz-spire-user',email:'spire.uat@sulandrahealth.test',displayName:'Synthetic SPIRE User',role:'RN',status:'ACTIVE'},session:{id:'biz-spire-user',userId:'biz-spire-user',email:'spire.uat@sulandrahealth.test',displayName:'Synthetic SPIRE User',role:'RN',status:'ACTIVE'}});
    if(path===`/api/spire/network/service-homes/${HOME_ID}/patients`)return json(route,{data:[patient]});
    if(path===`/api/spire/network/service-homes/${HOME_ID}/schedule`||path===`/api/spire/network/service-homes/${HOME_ID}/inbasket`)return json(route,{data:[]});
    if(path===`/api/spire/patients/${PATIENT_ID}`&&method==='GET'||path===`/api/spire/patients/${PATIENT_ID}/storyboard`&&method==='GET')return json(route,{data:patient});
    if(path===`/api/spire/patients/${PATIENT_ID}/chart-review-v2`)return json(route,{data:{items:[]}});
    if(path===`/api/spire/patients/${PATIENT_ID}/admission-history`)return json(route,{data:{admissions:[admission]}});
    if(path===`/api/spire/patients/${PATIENT_ID}/assessments/overview`)return json(route,{data:{responses:[],due:[]}});
    if(path==='/api/spire/assessment-templates')return json(route,{data:[]});
    if(method==='GET')return json(route,{data:[]});
    return json(route,{error:'UAT blocks writes'},409);
  });
}

async function openChart(page){
  await installApi(page);
  await page.goto(`/spire.html?spireHome=${HOME_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});
  await expect(page.locator('body')).toHaveClass(/spmt-ready/);
  await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);
  await expect(page.locator('#spireMasterToolbar')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-spire-intake-isp-sleep-wiring','20260812-spire-intake-isp-sleep-2');
}

test('approved Client Intake is wired into current SPIRE chart',async({page})=>{
  await openChart(page);
  const intake=page.locator('#spireMasterToolbar [data-spmt-tool="intake"]');
  await expect(intake).toBeVisible();
  await expect(page.locator('#spireMasterToolbar [data-spmt-tool="isp-logs"]')).toBeVisible();
  await expect(page.locator('#spireMasterToolbar [data-spmt-tool="sleep-wake"]')).toBeVisible();
  const admissionTab=page.locator('#spireAdmissionHistoryTab');
  await expect(admissionTab).toHaveText('Intake / Admission');
  await expect(admissionTab).toBeHidden();
  await intake.click();
  await expect(page.locator('#spireChartTabBody')).toContainText('Completed Intake Sections');
  await expect(page.locator('#spireChartTabBody')).toContainText('Preferences, Routines & Interests');
  await expect(page.locator('#spireChartTabBody')).toContainText('Usually sleeps 10 PM to 6 AM');
  await expect(page.locator('#spireChartTabBody')).toContainText('Personal Goals & Desired Outcomes');
  await expect(page.locator('#spireChartTabBody')).toContainText('Official OhioISP');
  await expect(page.locator('#spireChartTabBody')).toContainText('Synthetic Guardian');
});

test('ISP logs and Sleep/Wake shortcuts route to the real continuous flowsheet groups',async({page})=>{
  await openChart(page);
  await page.locator('#spireMasterToolbar [data-spmt-tool="isp-logs"]').click();
  await expect(page).toHaveURL(/\/spire\/flowsheets\.html\?patientId=biz-spire-patient&group=ISP\+Outcomes\+%2F\+Progress/);
  await expect(page.locator('html')).toHaveAttribute('data-spire-flowsheet-master','20260812-spire-flowsheet-master-1');

  await page.goto(`/spire.html?spireHome=${HOME_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});
  await expect(page.locator('#spireMasterToolbar [data-spmt-tool="sleep-wake"]')).toBeVisible();
  await page.locator('#spireMasterToolbar [data-spmt-tool="sleep-wake"]').click();
  await expect(page).toHaveURL(/\/spire\/flowsheets\.html\?patientId=biz-spire-patient&group=Sleep\+%2F\+Wake/);
});
