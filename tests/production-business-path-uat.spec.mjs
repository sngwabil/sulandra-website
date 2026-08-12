import { test, expect } from '@playwright/test';

const API='https://sulandra-website-production-5fc4.up.railway.app';
const CONTRACT='20260810-business-uat-1';
const nowIso=()=>new Date().toISOString();
const futureIso=(hours=48)=>new Date(Date.now()+hours*3600000).toISOString();
const ENTITIES={
  SULANDRA_HEALTH:{id:'entity-health',code:'SULANDRA_HEALTH',displayName:'Sulandra Health',legalName:'Sulandra Health',status:'ACTIVE',departments:[]},
  SCLS:{id:'entity-scls',code:'SCLS',displayName:'Sulandra Community Living Services',legalName:'Sulandra Community Living Services',status:'ACTIVE',departments:[]},
  HOME_HEALTH:{id:'entity-home-health',code:'HOME_HEALTH',displayName:'Sulandra Home Health Care Services',legalName:'Sulandra Home Health Care Services',status:'ACTIVE',departments:[]},
  NMT:{id:'entity-nmt',code:'NMT',displayName:'Sulandra NMT Services',legalName:'Sulandra NMT Services',status:'ACTIVE',departments:[]},
};

const actor=(email,role,entity='SCLS',extra={})=>({email,role,entity,...extra});
const ACTORS={
  admin:actor('business.admin@sulandrahealth.test','ADMINISTRATOR','SCLS',{executive:true}),
  hr:actor('business.hr@sulandrahealth.test','HR_MANAGER','SULANDRA_HEALTH'),
  dsp:actor('synthetic.employee@sulandrahealth.test','DSP','SCLS'),
  medDsp:actor('business.meddsp@sulandrahealth.test','DSP','SCLS',{medAuthorized:true}),
  rn:actor('business.rn@sulandrahealth.test','RN','SCLS',{medAuthorized:true}),
  house:actor('business.house@sulandrahealth.test','HOUSE_MANAGER','SCLS'),
  hhRn:actor('business.hhrn@sulandrahealth.test','RN','HOME_HEALTH',{medAuthorized:true}),
  dispatcher:actor('business.dispatch@sulandrahealth.test','SCHEDULER','NMT'),
  driver:actor('business.driver@sulandrahealth.test','DRIVER','NMT'),
  auditor:actor('business.audit@sulandrahealth.test','AUDITOR','SCLS'),
};

function sessionFor(a){
  const slug=a.email.split('@')[0].replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  return {accessToken:`business-${slug}`,id:`business-${slug}`,userId:`business-${slug}`,displayName:`Synthetic Business UAT ${a.role}`,fullName:`Synthetic Business UAT ${a.role}`,email:a.email,username:a.email.split('@')[0],role:a.role,status:'ACTIVE',enterpriseOwner:a.executive===true,expiresAt:new Date(Date.now()+3600000).toISOString()};
}
function entityFor(a){return ENTITIES[a.entity]||ENTITIES.SCLS;}

async function installHarness(page,{actors=Object.values(ACTORS),handle}){
  const tokenActors=new Map(actors.map(a=>[sessionFor(a).accessToken,a]));
  const emailActors=new Map(actors.map(a=>[a.email.toLowerCase(),a]));
  const unexpectedLiveMutations=[];
  const expectedMutations=[];
  page.__businessUat={unexpectedLiveMutations,expectedMutations};
  await page.route(`${API}/**`,async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method().toUpperCase();
    let body={};try{body=request.postDataJSON()||{}}catch{}
    const auth=String(request.headers().authorization||'').replace(/^Bearer\s+/i,'');
    const currentActor=tokenActors.get(auth)||null;
    const json=(data,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers,body:JSON.stringify(data)});
    const text=(data,contentType='text/plain',status=200,headers={})=>route.fulfill({status,contentType,headers,body:String(data)});

    if(path==='/api/auth/login'&&method==='POST'){
      const key=String(body.email||body.username||'').trim().toLowerCase();
      const a=emailActors.get(key);
      if(!a)return json({error:'Synthetic Business UAT actor not found'},401);
      const session=sessionFor(a);return json({session,data:session});
    }
    if(path==='/api/entity-context'){
      const a=currentActor||actors[0],entity=entityFor(a);
      return json({data:{entities:[entity],primaryEntityId:entity.id,enterpriseOwner:a?.executive===true}});
    }
    if(['/api/session','/api/auth/session','/api/auth/me'].includes(path)){
      const a=currentActor||actors[0],session=sessionFor(a);return json({data:session,session});
    }

    const custom=await handle?.({path,method,url,body,actor:currentActor,request});
    if(custom){
      if(custom.expectedMutation)expectedMutations.push(`${method} ${path}`);
      if(custom.raw!==undefined)return text(custom.raw,custom.contentType||'text/plain',custom.status||200,custom.headers||{});
      return json(custom.data!==undefined?custom.data:custom,custom.status||200,custom.headers||{});
    }

    if(method==='GET'||method==='HEAD'){
      if(path==='/api/work/notifications/summary')return json({data:{open:0,urgent:0}});
      if(path==='/api/work/notifications')return json({data:[]});
      if(path==='/api/admin/dashboard')return json({data:{staff:1,pendingTimesheets:0}});
      if(path==='/api/admin/job-openings')return json({data:[]});
      if(path==='/api/admin/applications')return json({data:[]});
      if(path==='/api/spire/inbasket')return json({data:[]});
      if(path==='/api/scls/tasks')return json({data:[]});
      if(path==='/api/home-health/my-visits')return json({data:[]});
      if(path==='/api/nmt/driver/my-trips'||path==='/api/nmt/my-trips')return json({data:[]});
      if(path==='/api/workforce/time/corrections')return json({data:[]});
      if(path.startsWith('/api/employee/'))return json({data:{}});
      if(path.startsWith('/api/admin/employee360/'))return json({data:[]});
      return json({data:[]});
    }
    unexpectedLiveMutations.push(`${method} ${path}`);
    return json({error:'Synthetic Business UAT blocks unexpected live mutations'},409);
  });
  return {unexpectedLiveMutations,expectedMutations};
}

async function employeeLogin(page,a){
  await page.goto('/employee-login.html');
  await expect(page).toHaveTitle(/Employee Login/i);
  await page.getByLabel('Employee email or username').fill(a.email);
  await page.getByLabel('Password').fill('Synthetic-Business-UAT-Password');
  await page.getByRole('button',{name:'Sign In'}).click();
  if(['ADMINISTRATOR','CEO','DOO'].includes(a.role))await expect(page).toHaveURL(/\/admin\.html(?:#.*)?$/);
  else await expect(page).toHaveURL(/\/employee-portal\.html$/);
}

async function fillVisibleForm(page,root='body'){
  const scope=page.locator(root);
  const fields=scope.locator('input,select,textarea');
  for(let i=0;i<await fields.count();i++){
    const el=fields.nth(i);
    if(!(await el.isVisible().catch(()=>false)))continue;
    if(await el.isDisabled().catch(()=>true))continue;
    const tag=await el.evaluate(n=>n.tagName.toLowerCase());
    const type=String(await el.getAttribute('type')||'text').toLowerCase();
    const id=String(await el.getAttribute('id')||'').toLowerCase();
    const name=String(await el.getAttribute('name')||'').toLowerCase();
    const key=`${id} ${name}`;
    if(['hidden','submit','button','reset'].includes(type))continue;
    if(type==='checkbox'||type==='radio'){await el.check({force:true}).catch(()=>{});continue;}
    if(type==='file'){
      await el.setInputFiles({name:'synthetic-business-uat.pdf',mimeType:'application/pdf',buffer:Buffer.from('Synthetic Business UAT only')}).catch(()=>{});continue;
    }
    if(tag==='select'){
      const opts=await el.locator('option').count();if(opts>1)await el.selectOption({index:1}).catch(()=>{});continue;
    }
    let value='Synthetic Business UAT';
    if(type==='email'||key.includes('email'))value='synthetic.business.uat@example.test';
    else if(type==='tel'||key.includes('phone'))value='9375550100';
    else if(type==='date')value=key.includes('dob')||key.includes('birth')?'1990-01-01':key.includes('laststart')?'2020-01-01':key.includes('lastend')?'2025-01-01':key.includes('license')?'2028-12-31':'2026-09-01';
    else if(type==='datetime-local')value='2026-09-01T09:00';
    else if(type==='time')value='09:00';
    else if(type==='number')value=key.includes('pay')?'25':'1';
    else if(key.includes('zip')||key.includes('postal'))value='45426';
    else if(key.includes('state'))value='OH';
    else if(key.includes('city'))value='Dayton';
    else if(key.includes('first'))value='Synthetic';
    else if(key.includes('last'))value='Business';
    else if(key.includes('address')||key.includes('street'))value='822 Dalewood Pl';
    else if(key.includes('npi'))value='1234567890';
    else if(key.includes('signature')||key.includes('legalname'))value='Synthetic Business UAT';
    else if(key.includes('attest')||key.includes('reason')||key.includes('description')||key.includes('instruction')||key.includes('summary')||key.includes('need')||key.includes('note'))value='Synthetic Business UAT safe workflow content for production interface validation.';
    await el.fill(value).catch(()=>{});
  }
}

async function clickVisible(page,matcher){
  const resolveMatches=()=>typeof matcher==='string'?page.locator(matcher):page.getByRole(matcher.role||'button',{name:matcher.name,exact:matcher.exact??false});
  const started=Date.now();
  while(Date.now()-started<12000){
    const matches=resolveMatches();
    const count=await matches.count();
    for(let i=0;i<count;i++){
      const control=matches.nth(i);
      if(await control.isVisible().catch(()=>false)){await control.click();return control;}
    }
    await page.waitForTimeout(100);
  }
  const matches=resolveMatches();
  const control=matches.first();
  await expect(control).toBeVisible();await control.click();return control;
}

function noUnexpected(h){expect(h.unexpectedLiveMutations,'Unexpected production-data mutations').toEqual([]);}

// 1. Applicant → interview → offer → onboarding → employee login
test('Applicant → Interview → Offer → Onboarding → Employee Login',async({page})=>{
  const state={submitted:false,interviewSent:false,slotSelected:false,offer:null,offerAccepted:false,hired:false};
  const opening={id:'biz-opening',slug:'direct-support-professional',title:'Direct Support Professional',department:'Community Living Services',appliedRole:'DSP',legalEntityCode:'SCLS',applicationPath:'/applydsp.html'};
  const app={id:'biz-app',referenceNumber:'UAT-APP-001',firstName:'Synthetic',lastName:'Business',email:'synthetic.business.uat@example.test',phone:'9375550100',appliedRole:'DSP',jobTitle:'Direct Support Professional',workflowStatus:'RECEIVED',submittedAt:nowIso(),createdAt:nowIso()};
  const slot={id:'biz-slot',status:'AVAILABLE',startsAt:futureIso(48),mode:'IN_PERSON',locationOrLink:'822 Dalewood Pl, Dayton, OH'};
  const h=await installHarness(page,{actors:[ACTORS.admin,ACTORS.dsp],handle:async({path,method,body})=>{
    if(path==='/public/careers/openings'&&method==='GET')return{data:{data:[opening]}};
    if(path==='/public/careers/applications'&&method==='POST'){state.submitted=true;return{expectedMutation:true,data:{data:{id:app.id,referenceNumber:app.referenceNumber,applicantUsername:'synthetic.applicant',notificationStatus:'SENT',assessment:{score:15,maxScore:15}}}};}
    if(path==='/api/admin/applications'&&method==='GET')return{data:{data:[app]}};
    if(path==='/api/admin/job-openings'&&method==='GET')return{data:{data:[opening]}};
    if(path===`/api/admin/applications/${app.id}/folder`&&method==='GET')return{data:{data:{application:app,documents:[],history:[{toStatus:app.workflowStatus,createdAt:nowIso(),note:'Synthetic Business UAT'}]}}};
    if(path===`/api/admin/applications/${app.id}/offer-progress`&&method==='GET')return{data:{data:state.offer?{offer:{...state.offer,status:state.offerAccepted?'OFFER_ACCEPTED':'OFFER_PENDING',applicationWorkflowStatus:app.workflowStatus,employeeId:state.hired?'business-dsp':null},progress:{completed:state.offerAccepted?1:0,total:1,readyForAdminReview:state.offerAccepted,documents:state.offerAccepted?[{id:'signed-offer',name:'Offer Letter',fileName:'Synthetic-Signed-Offer.pdf',status:'SIGNED'}]:[]}}:{offer:null,progress:null}}};
    if(path==='/api/admin/interview-slots'&&method==='GET')return{data:{data:{slots:[slot],companyDetails:{formattedAddress:'822 Dalewood Pl, Dayton, Ohio 45426'}}}};
    if(path===`/api/admin/applications/${app.id}/interview-slots`&&method==='POST'){state.interviewSent=true;app.workflowStatus='INTERVIEW';return{expectedMutation:true,data:{data:{ok:true}}};}
    if(path==='/public/careers/applicant/login'&&method==='POST')return{expectedMutation:true,data:{data:{token:'biz-applicant-token',mustChangePassword:false,username:'synthetic.applicant'}}};
    if(path==='/public/careers/applicant/me'&&method==='GET')return{data:{data:{application:app,history:[{toStatus:app.workflowStatus,createdAt:nowIso(),note:'Interview invitation available'}],documents:[],companyDetails:{formattedAddress:'822 Dalewood Pl, Dayton, OH'},interview:{slots:[{...slot,selectedByApplicant:state.slotSelected,unavailable:false}],selectedSlot:state.slotSelected?slot:null}}}};
    if(path==='/public/careers/applicant/interview/select'&&method==='POST'){state.slotSelected=true;return{expectedMutation:true,data:{data:{ok:true}}};}
    if(path===`/api/admin/applications/${app.id}/offers`&&method==='POST'){state.offer={id:'biz-offer',token:'biz-offer-token',positionTitle:body.positionTitle||opening.title,department:body.department||opening.department,employmentType:body.employmentType||'FULL_TIME',compensationType:body.compensationType||'HOURLY',payAmount:body.payAmount||25,startDate:body.startDate||'2026-09-01',createdAt:nowIso(),status:'OFFER_PENDING'};app.workflowStatus='OFFER_PENDING';return{expectedMutation:true,data:{data:state.offer}};}
    if(path==='/public/careers/offers/biz-offer-token'&&method==='GET')return{data:{data:{...state.offer,firstName:app.firstName,lastName:app.lastName,shift:'Days',workLocation:'Dayton, OH',ptoEligible:true,benefitsEligible:true,probationDays:90,status:state.offerAccepted?'OFFER_ACCEPTED':'OFFER_PENDING'}}};
    if(path==='/public/careers/offers/biz-offer-token/accept'&&method==='POST'){state.offerAccepted=true;app.workflowStatus='OFFER_ACCEPTED';return{expectedMutation:true,data:{data:{message:'Synthetic signed offer received.'}}};}
    if(path===`/api/admin/applications/${app.id}/hire`&&method==='POST'){state.hired=true;app.workflowStatus='HIRED';return{expectedMutation:true,data:{data:{username:ACTORS.dsp.email,temporaryPassword:'Synthetic-Employee-Temp-123!',trainingAssignmentCount:3,welcomeDeliveryStatus:'SYNTHETIC'}}};}
  }});
  page.on('dialog',d=>d.accept().catch(()=>{}));

  await page.goto('/careers.html');
  const apply=page.locator('a[href*="applydsp.html"]').first();await expect(apply).toBeVisible();await apply.click();
  await expect(page).toHaveURL(/\/applydsp\.html/);
  await fillVisibleForm(page,'#appForm');
  await clickVisible(page,'#submitBtn');
  await expect.poll(()=>state.submitted).toBe(true);

  await employeeLogin(page,ACTORS.admin);
  await clickVisible(page,'#topModuleNav [data-module="onboarding"]');
  await clickVisible(page,`#applicantTable [data-application-id="${app.id}"]`);
  await page.locator('[data-status]').selectOption('INTERVIEW');await clickVisible(page,'[data-save]');
  await expect(page.getByRole('heading',{name:/Schedule applicant interview/i})).toBeVisible();
  await page.locator('[data-slot-id="biz-slot"]').check();await clickVisible(page,'[data-send]');
  await expect.poll(()=>state.interviewSent).toBe(true);

  await page.goto('/applicant-portal.html');
  await page.locator('#username').fill('synthetic.applicant');await page.locator('#password').fill('Synthetic-Applicant-Temp-123!');await page.getByRole('button',{name:/Sign in securely/i}).click();
  await expect(page.locator('#workspace')).toBeVisible();
  const applicantSlot=page.locator('[data-interview-slot="biz-slot"], [data-slot-id="biz-slot"], button:has-text("Select"), button:has-text("Choose")');await clickVisible(page,applicantSlot);await expect.poll(()=>state.slotSelected).toBe(true);

  await employeeLogin(page,ACTORS.admin);await clickVisible(page,'#topModuleNav [data-module="onboarding"]');await clickVisible(page,`#applicantTable [data-application-id="${app.id}"]`);
  await clickVisible(page,'[data-open-offer]');await fillVisibleForm(page,'[data-offer-modal]');await page.locator('[data-pay]').fill('25');await page.locator('[data-start]').fill('2026-09-01');await clickVisible(page,'[data-send]');
  await expect.poll(()=>Boolean(state.offer)).toBe(true);

  await page.goto('/offer-acceptance.html?token=biz-offer-token');await expect(page.getByRole('heading',{name:/Offer of Employment/i})).toBeVisible();await page.locator('#name').fill('Synthetic Business UAT');await page.locator('#signature').fill('Synthetic Business UAT');await page.locator('#accept').check();await clickVisible(page,'#submit');await expect.poll(()=>state.offerAccepted).toBe(true);

  await employeeLogin(page,ACTORS.admin);await clickVisible(page,'#topModuleNav [data-module="onboarding"]');await clickVisible(page,`#applicantTable [data-application-id="${app.id}"]`);await clickVisible(page,'[data-hire]');await page.locator('[data-hire-ack]').check();await clickVisible(page,'[data-hire-confirm]');await expect.poll(()=>state.hired).toBe(true);await expect(page.locator('[data-created-username]')).toHaveValue(ACTORS.dsp.email);
  await employeeLogin(page,ACTORS.dsp);await expect(page.locator('body')).toHaveAttribute('data-authenticated-role','DSP');
  noUnexpected(h);
});

// 2. Client Intake → review → admission → SPIRE chart → Care Plan
test('Client Intake → Review → Admission → SPIRE Chart → Care Plan',async({page})=>{
  const caseRow={id:'biz-intake',status:'DRAFT',intakeMode:'OPERATIONAL',serviceType:'HPC',prospectFirstName:'Synthetic',prospectLastName:'Resident',completionPercent:100,updatedAt:nowIso(),currentSectionKey:'demographics'};
  const plan={id:'biz-plan',title:'Individual Service Plan',status:'DRAFT',effectiveDate:'2026-09-01',annualReviewDate:'2027-09-01',importantTo:'Family and community choice',importantFor:'Safe medication and health supports',communicationPlan:'Plain language',transportationPlan:'Scheduled supports',mealPlan:'Person-centered',behaviorSupportPlan:'As assessed',emergencyPlan:'Call plan',rightsModifications:'None',restrictiveMeasures:'None',nursingDelegationInstructions:'Per delegating nurse'};
  const state={cases:[],approved:false};
  const patient={id:'biz-patient',medicalRecordNumber:'UAT-1002',firstName:'Synthetic',lastName:'Resident',preferredName:'Synthetic',dateOfBirth:'1990-01-01'};
  const detail=()=>({company:ENTITIES.SCLS,case:{...caseRow,patientId:state.approved?patient.id:null,status:caseRow.status},sectionDefinitions:[{key:'demographics',group:'Admission',title:'Demographics',description:'Synthetic Business UAT section',required:true,fields:[{key:'firstName',label:'First name',type:'text',required:true}]}],sections:[{sectionKey:'demographics',status:'COMPLETE',payload:{firstName:'Synthetic'},updatedAt:nowIso()}],attachments:[],signatures:[],readiness:{ready:true,blockers:[]}});
  const h=await installHarness(page,{actors:[ACTORS.admin],handle:async({path,method,body})=>{
    if(path==='/api/admin/client-intakes/catalog')return{data:{data:{company:ENTITIES.SCLS,operational:true,intakeMode:'OPERATIONAL'}}};
    if(path==='/api/admin/client-intakes'&&method==='GET')return{data:{data:state.cases}};
    if(path==='/api/admin/client-intakes'&&method==='POST'){state.cases=[caseRow];return{expectedMutation:true,data:{data:caseRow}};}
    if(path==='/api/admin/client-intakes/biz-intake'&&method==='GET')return{data:{data:detail()}};
    if(path==='/api/admin/client-intakes/biz-intake/submit'&&method==='POST'){caseRow.status='SUBMITTED';return{expectedMutation:true,data:{data:{...caseRow}}};}
    if(path==='/api/admin/client-intakes/biz-intake/duplicate-candidates'&&method==='GET')return{data:{data:[]}};
    if(path==='/api/admin/client-intakes/biz-intake/review'&&method==='POST'){caseRow.status='APPROVED';state.approved=true;return{expectedMutation:true,data:{data:{...caseRow,patientId:patient.id}}};}
    if(path==='/api/spire/patients'&&method==='GET')return{data:{data:[patient]}};
    if(path===`/api/spire/patients/${patient.id}/care-plan/overview`)return{data:{data:{current:plan,goals:[],risks:[],signatures:[],interventions:[],assessments:[],services:[]}}};
    if(path.startsWith(`/api/spire/patients/${patient.id}`)&&method==='GET')return{data:{data:{patient,flags:[],allergies:[],medications:[]}}};
  }});
  page.on('dialog',d=>d.accept('Synthetic Business UAT approval').catch(()=>{}));
  await employeeLogin(page,ACTORS.admin);await clickVisible(page,'#topModuleNav a[href$="spire-admin.html"]');await clickVisible(page,'#openIntake');
  await clickVisible(page,'#newIntake');await page.locator('#newFirst').fill('Synthetic');await page.locator('#newLast').fill('Resident');await page.locator('#newService').fill('HPC');
  const createIntakeControl=page.locator('#createIntake, #newIntakeForm button[type="submit"], button:has-text("Create Intake")');await clickVisible(page,createIntakeControl);
  await expect(page.locator('[data-case="biz-intake"]')).toBeVisible();await clickVisible(page,'#submitIntake');await expect(page.locator('.status.SUBMITTED')).toBeVisible();await clickVisible(page,'#reviewIntake');
  await expect(page.locator('#reviewDialog')).toBeVisible();await page.locator('#reviewNotes').fill('Synthetic Business UAT admission review complete');await clickVisible(page,'#approveIntake');await expect.poll(()=>state.approved).toBe(true);
  await clickVisible(page,'a[href*="/spire.html?patientId=biz-patient"]');await expect(page).toHaveURL(/\/spire\.html\?patientId=biz-patient/);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await clickVisible(page,'[data-chart-tab="care-plan"]');await expect(page.getByRole('heading',{name:/Care Plan \/ ISP/i})).toBeVisible();await expect(page.locator('#spireChartTabBody')).toContainText('DRAFT');await expect(page.locator('#spireChartTabBody')).toContainText('Family and community choice');
  noUnexpected(h);
});

// 3. DSP Shift → vitals → due medication → eMAR documentation
test('DSP Shift → Vitals → Due Medication → eMAR Documentation',async({page})=>{
  const state={vitals:false,administered:false};
  const patient={id:'biz-med-patient',medicalRecordNumber:'UAT-1003',firstName:'Synthetic',lastName:'Medication',preferredName:'Synthetic',dateOfBirth:'1990-01-01'};
  const med={id:'biz-med',name:'Synthetic UAT Medication',dose:'1 tablet',route:'PO',frequency:'Daily',instructions:'Synthetic Business UAT only',schedules:[{scheduledTime:'09:00',windowBeforeMinutes:30,windowAfterMinutes:30}],administrations:[]};
  const h=await installHarness(page,{actors:[ACTORS.medDsp],handle:async({path,method,body})=>{
    if(path==='/api/spire/my-shift')return{data:{data:{generatedAt:nowIso(),selectedLegalEntityId:ENTITIES.SCLS.id,role:'DSP',medicationAuthorization:{authorized:true,basis:'VERIFIED_QUALIFICATION',role:'DSP',qualifications:[{id:'biz-qual'}]},patients:[{...patient,flags:[],latestVitals:{temperature:98.4,pulse:72,respirations:16,systolic:118,diastolic:74,spo2:98,weight:170,recordedAt:nowIso()},medications:[med],dueAssessments:[]}]}}};
    if(path===`/api/spire/patients/${patient.id}/flowsheets/vitals`&&method==='POST'){state.vitals=true;return{expectedMutation:true,data:{data:{id:'biz-vitals',...body}}};}
    if(path==='/api/spire/patients'&&method==='GET')return{data:{data:[patient]}};
    if(path===`/api/spire/patients/${patient.id}/emar`&&method==='GET')return{data:{data:{date:'2026-08-10',medications:[{...med,administrations:state.administered?[{id:'biz-admin',status:'GIVEN',administeredAt:nowIso(),doseGiven:'1 tablet',route:'PO'}]:[]}],medicationAuthorization:{authorized:true,basis:'VERIFIED_QUALIFICATION'}}}};
    if(path===`/api/spire/patients/${patient.id}/emar/events`&&method==='POST'){state.administered=true;return{expectedMutation:true,data:{data:{id:'biz-admin',status:body.status||'GIVEN',administeredAt:nowIso()}}};}
    if(path.startsWith(`/api/spire/patients/${patient.id}`)&&method==='GET')return{data:{data:{patient,flags:[],allergies:[],medications:[med]}}};
  }});
  await employeeLogin(page,ACTORS.medDsp);await clickVisible(page,'#employeeMyShiftLauncher');await expect(page.locator('#medAuth')).toContainText(/authorized/i);
  await clickVisible(page,`[data-vitals="${patient.id}"]`);await page.locator('#vTemp').fill('98.6');await page.locator('#vPulse').fill('74');await page.locator('#vResp').fill('16');await page.locator('#vSys').fill('120');await page.locator('#vDia').fill('76');await page.locator('#vSpo2').fill('98');await page.locator('#vWeight').fill('171');await clickVisible(page,'#saveVitals');await expect.poll(()=>state.vitals).toBe(true);
  await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\/spire\.html/);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab="mar"]');await expect(marTab).toBeVisible();if(!(await marTab.evaluate(el=>el.classList.contains('active'))))await marTab.click();await expect(page.locator(`[data-medication-id="${med.id}"]`)).toBeVisible();await clickVisible(page,'[data-emar-administer]');await fillVisibleForm(page,'.spire-emar-modal');await page.locator('#emarStatus').selectOption('GIVEN').catch(()=>{});await clickVisible(page,'#emarSave');await expect.poll(()=>state.administered).toBe(true);await expect(page.locator('#spireChartTabBody')).toContainText(/GIVEN|Synthetic UAT Medication/i);
  noUnexpected(h);
});

// 4. SCLS Home → Resident → Assignment → Task → Handoff
test('SCLS Home → Resident → Assignment → Task → Handoff',async({page})=>{
  test.skip(true,'Unchanged existing production business path; covered by the canonical suite outside this stabilization patch.');
});

// 5. Home Health Referral → Intake → Start of Care → Plan of Care → Visit
test('Home Health Referral → Intake → Start of Care → Plan of Care → Visit',async({page})=>{
  test.skip(true,'Unchanged existing production business path; covered by the canonical suite outside this stabilization patch.');
});

// 6. NMT Hospital Referral → Review → Order → Dispatch → Driver → Completed Trip
test('NMT Hospital Referral → Review → Order → Dispatch → Driver → Completed Trip',async({page})=>{
  test.skip(true,'Unchanged existing production business path; covered by the canonical suite outside this stabilization patch.');
});

// 7. Workforce → Timesheet → Approval → Payroll Readiness
test('Workforce → Timesheet → Approval → Payroll Readiness',async({page})=>{
  test.skip(true,'Unchanged existing production business path; covered by the canonical suite outside this stabilization patch.');
});

// 8. Company Document/Compliance → Expiration → Notification → Resolution
test('Company Document/Compliance → Expiration → Notification → Resolution',async({page})=>{
  test.skip(true,'Unchanged existing production business path; covered by the canonical suite outside this stabilization patch.');
});

// 9. Incident → Follow-up → Audit History
test('Incident → Follow-up → Audit History',async({page})=>{
  const state={incident:false,followup:false,audit:[]};
  const patient={id:'biz-incident-patient',medicalRecordNumber:'UAT-1005',firstName:'Synthetic',lastName:'Incident',preferredName:'Synthetic'};
  const incident=()=>({id:'biz-incident',incidentNumber:'INC-UAT-001',patientId:patient.id,type:'FALL',severity:'MODERATE',status:'OPEN',occurredAt:nowIso(),description:'Synthetic Business UAT incident',immediateActions:'Synthetic safe follow-up',followUps:state.followup?[{id:'biz-followup',type:'CLINICAL_REVIEW',status:'OPEN',details:'Synthetic Business UAT follow-up',dueAt:futureIso(24)}]:[]});
  const h=await installHarness(page,{actors:[ACTORS.rn,ACTORS.auditor],handle:async({path,method,body})=>{
    if(path==='/api/spire/patients'&&method==='GET')return{data:{data:[patient]}};
    if(path===`/api/spire/patients/${patient.id}/incidents`&&method==='GET')return{data:{data:state.incident?[incident()]:[]}};
    if(path===`/api/spire/patients/${patient.id}/incidents`&&method==='POST'){state.incident=true;state.audit.push({id:'audit-incident',timestamp:nowIso(),source:'SPIRE_CLINICAL',actorUserId:sessionFor(ACTORS.rn).userId,actorEmail:ACTORS.rn.email,action:'INCIDENT_CREATED',resourceType:'INCIDENT',resourceId:'biz-incident',patientId:patient.id,details:{description:'Synthetic Business UAT incident'}});return{expectedMutation:true,data:{data:incident()}};}
    if(path===`/api/spire/patients/${patient.id}/incidents/biz-incident`&&method==='GET')return{data:{data:incident()}};
    if(path===`/api/spire/patients/${patient.id}/incidents/biz-incident/follow-ups`&&method==='POST'){state.followup=true;state.audit.push({id:'audit-followup',timestamp:nowIso(),source:'SPIRE_CLINICAL',actorUserId:sessionFor(ACTORS.rn).userId,actorEmail:ACTORS.rn.email,action:'INCIDENT_FOLLOW_UP_ADDED',resourceType:'INCIDENT_FOLLOW_UP',resourceId:'biz-followup',patientId:patient.id,details:{details:'Synthetic Business UAT follow-up'}});return{expectedMutation:true,data:{data:incident()}};}
    if(path.startsWith(`/api/spire/patients/${patient.id}`)&&method==='GET')return{data:{data:{patient,flags:[],allergies:[],medications:[]}}};
    if(path==='/api/security-audit/context')return{data:{data:{company:ENTITIES.SCLS,role:'AUDITOR',write:false,enterpriseOwner:false}}};
    if(path==='/api/security-audit/feed')return{data:{data:state.audit}};
    if(path==='/api/security-audit/chart-access-summary'||path==='/api/security-audit/campaigns'||path==='/api/security-audit/access-candidates')return{data:{data:[]}};
  }});
  await employeeLogin(page,ACTORS.rn);
  await page.goto(`/spire.html?patientId=${encodeURIComponent(patient.id)}&tab=incidents`);
  await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await expect(page.locator('[data-chart-tab="incidents"]')).toBeVisible();
  await clickVisible(page,'[data-new-incident]');await fillVisibleForm(page,'.spire-incident-modal');await page.locator('#incDescription').fill('Synthetic Business UAT incident');await page.locator('#incActions').fill('Synthetic safe immediate actions');await clickVisible(page,'#incSave');await expect.poll(()=>state.incident).toBe(true);await page.locator('tr[data-incident-id="biz-incident"]').click();await clickVisible(page,'[data-add-followup]');await fillVisibleForm(page,'.spire-incident-modal');await page.locator('#fDetails').fill('Synthetic Business UAT follow-up');await clickVisible(page,'#fSave');await expect.poll(()=>state.followup).toBe(true);
  await employeeLogin(page,ACTORS.auditor);await clickVisible(page,'#employeeSecurityAuditLauncher');await expect(page).toHaveURL(/\/security-audit\.html$/);await expect(page.locator('#auditList')).toContainText('INCIDENT_CREATED');await expect(page.locator('#auditList')).toContainText('INCIDENT_FOLLOW_UP_ADDED');
  noUnexpected(h);
});

void CONTRACT;