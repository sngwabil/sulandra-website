import { test, expect } from '@playwright/test';

const API='https://sulandra-website-production-5fc4.up.railway.app';
const ENTITIES={
  SULANDRA_HEALTH:{id:'entity-health',code:'SULANDRA_HEALTH',displayName:'Sulandra Health',legalName:'Sulandra Health',status:'ACTIVE',departments:[]},
  SCLS:{id:'entity-scls',code:'SCLS',displayName:'Sulandra Community Living Services',legalName:'Sulandra Community Living Services',status:'ACTIVE',departments:[]},
  HOME_HEALTH:{id:'entity-home-health',code:'HOME_HEALTH',displayName:'Sulandra Home Health',legalName:'Sulandra Home Health',status:'ACTIVE',departments:[]},
  NMT:{id:'entity-nmt',code:'NMT',displayName:'Sulandra NMT Services',legalName:'Sulandra NMT Services',status:'ACTIVE',departments:[]},
};
const ALL_ENTITIES=Object.values(ENTITIES);
const ADMIN_ROLES=new Set(['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','CEO','DOO']);
const PERSONAS={
  dsp:{label:'DSP',role:'DSP',primary:'SCLS'},
  medDsp:{label:'Medication-Certified DSP',role:'DSP',primary:'SCLS',medAuthorized:true},
  lpn:{label:'LPN',role:'LPN',primary:'SCLS',medAuthorized:true},
  rn:{label:'RN',role:'RN',primary:'SCLS',medAuthorized:true},
  delegatingNurse:{label:'Delegating Nurse',role:'DELEGATING_NURSE',primary:'SCLS',medAuthorized:true},
  houseManager:{label:'House Manager',role:'HOUSE_MANAGER',primary:'SCLS'},
  programManager:{label:'Program Manager',role:'PROGRAM_MANAGER',primary:'SCLS'},
  homeHealthClinician:{label:'Home Health Clinician',role:'RN',primary:'HOME_HEALTH',medAuthorized:true},
  scheduler:{label:'Scheduler',role:'SCHEDULER',primary:'SCLS'},
  dispatcher:{label:'NMT Dispatcher',role:'SCHEDULER',primary:'NMT'},
  driver:{label:'NMT Driver',role:'DRIVER',primary:'NMT'},
  hr:{label:'HR Manager',role:'HR_MANAGER',primary:'SULANDRA_HEALTH'},
  administrator:{label:'Administrator',role:'ADMINISTRATOR',primary:'SULANDRA_HEALTH'},
  doo:{label:'Director of Operations',role:'DOO',primary:'SULANDRA_HEALTH'},
  ceo:{label:'CEO',role:'CEO',primary:'SULANDRA_HEALTH'},
  auditor:{label:'Auditor',role:'AUDITOR',primary:'SCLS'},
};

const selected=p=>ENTITIES[p.primary]||ENTITIES.SCLS;
const sessionFor=p=>{const slug=p.label.toLowerCase().replace(/[^a-z0-9]+/g,'-'),admin=ADMIN_ROLES.has(p.role);return{accessToken:`uat-${slug}`,id:`uat-${slug}`,userId:`uat-${slug}`,displayName:`UAT ${p.label}`,fullName:`UAT ${p.label}`,email:`uat-${slug}@sulandrahealth.com`,username:`uat-${slug}`,role:p.role,status:'ACTIVE',enterpriseOwner:p.role==='ADMINISTRATOR',permissions:admin?['SULANDRA_ADMINISTRATION_ACCESS']:[],access:{administration:admin},expiresAt:new Date(Date.now()+3600000).toISOString()};};
const analytics=e=>({entity:e,clients:0,intakesOpen:0,notifications:{open:0,urgent:0},compliance:{blockers:0,due60:0},dataQuality:{open:0,critical:0},revenue:{review:0,held:0,ready:0,readyEstimatedAmount:0},workforce:{timeCorrectionsPending:0,documentsReview:0},scls:{tasksOpen:0,tasksOverdue:0},homeHealth:{referralsOpen:0,episodesActive:0,visitsToday:0,visitsOpen:0},nmt:{ordersOpen:0,tripsToday:0,tripsOpen:0},spire:{highIncidentsOpen:0,carePlansReview:0}});
function shiftData(p){const licensed=['LPN','RN','DELEGATING_NURSE'].includes(p.role),authorized=licensed||p.medAuthorized===true;return{generatedAt:new Date().toISOString(),selectedLegalEntityId:selected(p).id,role:p.role,medicationAuthorization:{authorized,basis:licensed?'LICENSED_ROLE':authorized?'VERIFIED_QUALIFICATION':'NONE',role:p.role,qualifications:authorized&&!licensed?[{id:'uat-qual'}]:[]},patients:[{id:'uat-client',medicalRecordNumber:'UAT-1001',firstName:'Training',lastName:'Client',preferredName:'Training',dateOfBirth:'1990-01-01',flags:[],latestVitals:{temperature:98.4,pulse:72,respirations:16,systolic:118,diastolic:74,spo2:98,weight:170,recordedAt:new Date().toISOString()},medications:[{id:'uat-med',name:'UAT Medication',dose:'1 tab',route:'PO',frequency:'Daily',instructions:'Synthetic UAT record only',schedules:[{scheduledTime:'09:00',windowBeforeMinutes:30,windowAfterMinutes:30}],administrations:[]}],dueAssessments:[]}]};}

async function fixtures(page,p){
  const session=sessionFor(p),entity=selected(p),mutations=[];
  await page.route(`${API}/**`,route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method().toUpperCase();
    const reply=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    const ok=data=>reply(200,data);
    if(path==='/live'&&method==='GET')return ok({ok:true});
    if(path==='/api/auth/login'&&method==='POST'){
      let body={};try{body=req.postDataJSON()||{}}catch{}
      if(body.portal==='EMPLOYEE'){
        if(String(body.username||'').toLowerCase()!==session.username)return reply(400,{error:'Employee Portal requires your assigned employee username, not an email address'});
        return ok({session});
      }
      if(body.portal==='ADMIN'){
        if(String(body.email||'').toLowerCase()!==session.email)return reply(400,{error:'Administrator sign-in requires a @sulandrahealth.com work email'});
        if(!ADMIN_ROLES.has(p.role))return reply(403,{error:'This account does not have Sulandra administrator or management access'});
        return ok({session});
      }
      return reply(400,{error:'Explicit portal mode is required by UAT'});
    }
    if(path==='/api/entity-context')return ok({data:{entities:ALL_ENTITIES,primaryEntityId:entity.id,enterpriseOwner:p.role==='ADMINISTRATOR'}});
    if(['/api/session','/api/auth/session','/api/auth/me'].includes(path))return ok({data:session,session});
    if(!['GET','HEAD'].includes(method)){mutations.push(`${method} ${path}`);return reply(409,{error:'UAT blocks live mutations'});}
    if(path==='/api/work/notifications/summary')return ok({data:{open:0,urgent:0}});
    if(['/api/spire/inbasket','/api/scls/tasks','/api/home-health/my-visits','/api/nmt/driver/my-trips','/api/nmt/my-trips','/api/workforce/time/corrections'].includes(path))return ok({data:[]});
    if(path==='/api/spire/my-shift')return ok({data:shiftData(p)});
    if(path==='/api/home-health/context')return ok({data:{company:{id:ENTITIES.HOME_HEALTH.id,displayName:ENTITIES.HOME_HEALTH.displayName,code:'HOME_HEALTH',operational:true},role:p.role,staffProfile:{discipline:p.role==='LPN'?'LPN':'RN'}}});
    if(['/api/admin/nmt/trips','/api/admin/nmt/orders','/api/admin/nmt/vehicles','/api/admin/nmt/drivers'].includes(path))return ok({data:[]});
    if(path==='/api/enterprise-analytics/overview')return ok({data:{enterpriseOwner:p.role==='ADMINISTRATOR',selectedLegalEntityId:entity.id,generatedAt:new Date().toISOString(),portfolio:{clients:0,intakesOpen:0,notificationsOpen:0,notificationsUrgent:0,complianceBlockers:0,dataQualityOpen:0,dataQualityCritical:0,revenueReview:0,revenueHeld:0,revenueReady:0,revenueReadyEstimatedAmount:0},entities:[analytics(entity)]}});
    if(path==='/api/enterprise-analytics/activity')return ok({data:{legalEntityId:entity.id,days:Number(url.searchParams.get('days')||30),series:[]}});
    if(path==='/api/security-audit/context')return ok({data:{company:entity,role:p.role,write:p.role!=='AUDITOR',enterpriseOwner:p.role==='ADMINISTRATOR'}});
    if(['/api/security-audit/feed','/api/security-audit/chart-access-summary','/api/security-audit/campaigns','/api/security-audit/access-candidates'].includes(path))return ok({data:[]});
    if(path==='/api/admin/employees')return ok({data:{employees:[{...session,id:session.userId,jobTitle:p.label,department:'UAT'}]}});
    if(path.includes('/api/admin/employee360/enterprise-gap-dashboard'))return ok({data:{metrics:{blockedAssignments:0,failedCommunications:0},assignments:[],corrections:[],signoffs:[],communications:[],security:[],audit:[]}});
    if(path.includes('/api/admin/employee360/secure-files'))return ok({data:[]});
    if(path==='/api/scls/homes'||path.startsWith('/api/scls/homes/'))return ok({data:[]});
    return ok({data:[]});
  });
  return mutations;
}

async function loginEmployee(page,p){
  const mutations=await fixtures(page,p);
  await page.goto('/employee-login.html');
  await expect(page).toHaveTitle(/Employee Login/i);
  await page.getByLabel('Employee username').fill(sessionFor(p).username);
  await page.getByLabel('Password').fill('Synthetic-UAT-Password-Only');
  await page.getByRole('button',{name:/Sign In to Employee Portal/i}).click();
  await expect(page).toHaveURL(/\/employee-portal\.html$/);
  await expect(page.locator('body')).toHaveAttribute('data-role-uat-ready','true');
  await expect(page.locator('body')).toHaveAttribute('data-authenticated-role',p.role);
  return mutations;
}

async function loginAdmin(page,p){
  const mutations=await fixtures(page,p);
  await page.goto('/admin-login.html');
  await expect(page).toHaveTitle(/Administrator Sign In/i);
  await page.getByLabel('Sulandra work email').fill(sessionFor(p).email);
  await page.getByLabel('Password').fill('Synthetic-UAT-Password-Only');
  await page.getByRole('button',{name:/Sign In to Admin/i}).click();
  const expected=p.role==='ADMINISTRATOR'?/\/admin\.html(?:#.*)?$/:/\/admin-operations\.html(?:#.*)?$/;
  await expect(page).toHaveURL(expected);
  return mutations;
}

const labelPattern=label=>String(label).toUpperCase()==='SPIRE'?/S\.?P\.?I\.?R\.?E\.?/i:new RegExp(label,'i');
async function open(page,selector,path,label){const control=page.locator(selector).first();await expect(control).toBeVisible();await control.click();await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));if(label){const pattern=labelPattern(label);const heading=page.getByRole('heading',{name:pattern,exact:false}).first();if(await heading.count())await expect(heading).toBeVisible();else await expect(page).toHaveTitle(pattern);}}
const absent=async(page,...selectors)=>{for(const s of selectors)await expect(page.locator(s)).toHaveCount(0);};
const expectAdminDoor=async page=>{const link=page.locator('#employeeAdminReturn');await expect(link).toBeVisible();await expect(link).toHaveAttribute('href',/\/admin-login\.html/);await expect(link).toHaveAttribute('target','_blank');};

for(const [key,p] of Object.entries(PERSONAS))test(`${p.label}: username stays in Employee Portal`,async({page})=>{
  const mutations=await loginEmployee(page,p);
  if(key==='dsp'){await absent(page,'#employeeCompanyDocumentsLauncher');await open(page,'#employeeMyShiftLauncher','/spire-shift.html','My Shift');await expect(page.locator('#medAuth')).toContainText('view-only');}
  else if(key==='medDsp'){await open(page,'#employeeMyShiftLauncher','/spire-shift.html','My Shift');await expect(page.locator('#medAuth')).toContainText('Medication administration authorized');await expect(page.getByRole('link',{name:'Open eMAR'})).toBeVisible();}
  else if(key==='lpn'){await open(page,'#employeeMyShiftLauncher','/spire-shift.html','My Shift');await expect(page.locator('#medAuth')).toContainText(/LICENSED ROLE/i);}
  else if(key==='rn')await open(page,'#employeeLiveSpireLauncher','/spire.html','SPIRE');
  else if(key==='delegatingNurse')await open(page,'#employeeSclsOperationsLauncher','/scls-residential.html','SCLS Residential Operations');
  else if(key==='houseManager'){const roleWorkspace=page.locator('#employeeRoleWorkspaceLauncher');await expect(roleWorkspace).toBeVisible();await expect(roleWorkspace).toContainText(/Manage My Home Team/i);await open(page,'#employeeSclsOperationsLauncher','/scls-residential.html','SCLS Residential Operations');}
  else if(key==='programManager'){await expectAdminDoor(page);await expect(page.locator('#employeeSclsOperationsLauncher')).toBeVisible();await open(page,'#employeeAnalyticsLauncher','/enterprise-analytics.html','Enterprise Operating Analytics');}
  else if(key==='homeHealthClinician'){await expect(page.locator('#employeeHomeHealthOperationsLauncher')).toBeVisible();await open(page,'#employeeHomeHealthVisitsLauncher','/home-health-visits.html','My Home Health Visits');}
  else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control');}
  else if(key==='dispatcher'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher');await open(page,'#employeeNmtDispatchLauncher','/nmt-dispatch.html','NMT Dispatch');}
  else if(key==='driver'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeNmtTripsLauncher','/nmt-driver.html','My NMT Trips');}
  else if(key==='hr'){await expectAdminDoor(page);await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher');await expect(page.locator('#employeeCompanyDocumentsLauncher')).toBeVisible();await open(page,'#employeeHr360Launcher','/employee360.html','Employee 360');}
  else if(key==='auditor'){await absent(page,'#employeeMyShiftLauncher');await expect(page.locator('#employeeLiveSpireLauncher')).toBeVisible();await open(page,'#employeeSecurityAuditLauncher','/security-audit.html','Security');}
  else if(['administrator','ceo','doo'].includes(key)){await expectAdminDoor(page);await expect(page.locator('#employeeCompanyDocumentsLauncher')).toBeVisible();}
  expect(mutations,`Unexpected live-data mutation for ${p.label}`).toEqual([]);
});

for(const p of [PERSONAS.administrator,PERSONAS.programManager,PERSONAS.hr,PERSONAS.ceo,PERSONAS.doo])test(`${p.label}: Sulandra email opens entitled Admin workspace`,async({page})=>{
  const mutations=await loginAdmin(page,p);
  expect(mutations,`Unexpected live-data mutation for Admin ${p.label}`).toEqual([]);
});

test('Employee Login rejects email even for an Administrator',async({page})=>{
  await fixtures(page,PERSONAS.administrator);
  await page.goto('/employee-login.html');
  await page.getByLabel('Employee username').fill(sessionFor(PERSONAS.administrator).email);
  await page.getByLabel('Password').fill('Synthetic-UAT-Password-Only');
  await page.getByRole('button',{name:/Sign In to Employee Portal/i}).click();
  await expect(page).toHaveURL(/\/employee-login\.html$/);
  await expect(page.locator('#msg')).toContainText(/assigned employee username/i);
});

test('Admin Login rejects a non-management employee',async({page})=>{
  await fixtures(page,PERSONAS.dsp);
  await page.goto('/admin-login.html');
  await page.getByLabel('Sulandra work email').fill(sessionFor(PERSONAS.dsp).email);
  await page.getByLabel('Password').fill('Synthetic-UAT-Password-Only');
  await page.getByRole('button',{name:/Sign In to Admin/i}).click();
  await expect(page).toHaveURL(/\/admin-login\.html$/);
  await expect(page.locator('#adminLoginMessage')).toContainText(/does not have Sulandra administrator or management access/i);
});

test.describe('representative mobile production UAT',()=>{
  for(const [label,p,selector,target] of [
    ['DSP',PERSONAS.dsp,'#employeeMyShiftLauncher','/spire-shift.html'],
    ['NMT Dispatcher',PERSONAS.dispatcher,'#employeeNmtDispatchLauncher','/nmt-dispatch.html'],
    ['HR Manager',PERSONAS.hr,'#employeeHr360Launcher','/employee360.html'],
    ['Administrator',PERSONAS.administrator,'#employeeStaticEmployee360','/employee360.html'],
  ])test(`${label}: mobile username login-first navigation`,async({page})=>{await page.setViewportSize({width:390,height:844});const mutations=await loginEmployee(page,p);await open(page,selector,target);expect(mutations).toEqual([]);});
});