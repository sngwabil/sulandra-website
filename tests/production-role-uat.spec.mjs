import { test, expect } from '@playwright/test';

const API = 'https://sulandra-website-production-5fc4.up.railway.app';
const UAT_CONTRACT = '20260810-role-uat-1';

const ENTITIES = Object.freeze({
  SULANDRA_HEALTH: { id:'entity-health', code:'SULANDRA_HEALTH', displayName:'Sulandra Health', legalName:'Sulandra Health', status:'ACTIVE', departments:[] },
  SCLS: { id:'entity-scls', code:'SCLS', displayName:'Sulandra Community Living Services', legalName:'Sulandra Community Living Services', status:'ACTIVE', departments:[] },
  HOME_HEALTH: { id:'entity-home-health', code:'HOME_HEALTH', displayName:'Sulandra Home Health', legalName:'Sulandra Home Health', status:'ACTIVE', departments:[] },
  NMT: { id:'entity-nmt', code:'NMT', displayName:'Sulandra NMT Services', legalName:'Sulandra NMT Services', status:'ACTIVE', departments:[] },
});
const ALL_ENTITIES = Object.values(ENTITIES);

const PERSONAS = Object.freeze({
  dsp: { label:'DSP', role:'DSP', primary:'SCLS' },
  medDsp: { label:'Medication-Certified DSP', role:'DSP', primary:'SCLS', medAuthorized:true },
  lpn: { label:'LPN', role:'LPN', primary:'SCLS', medAuthorized:true },
  rn: { label:'RN', role:'RN', primary:'SCLS', medAuthorized:true },
  delegatingNurse: { label:'Delegating Nurse', role:'DELEGATING_NURSE', primary:'SCLS', medAuthorized:true },
  houseManager: { label:'House Manager', role:'HOUSE_MANAGER', primary:'SCLS' },
  programManager: { label:'Program Manager', role:'PROGRAM_MANAGER', primary:'SCLS' },
  homeHealthClinician: { label:'Home Health Clinician', role:'RN', primary:'HOME_HEALTH', medAuthorized:true },
  scheduler: { label:'Scheduler', role:'SCHEDULER', primary:'SCLS' },
  dispatcher: { label:'NMT Dispatcher', role:'SCHEDULER', primary:'NMT' },
  driver: { label:'NMT Driver', role:'DRIVER', primary:'NMT' },
  hr: { label:'HR Manager', role:'HR_MANAGER', primary:'SULANDRA_HEALTH' },
  administrator: { label:'Administrator', role:'ADMINISTRATOR', primary:'SULANDRA_HEALTH', executive:true },
  doo: { label:'Director of Operations', role:'DOO', primary:'SULANDRA_HEALTH', executive:true },
  ceo: { label:'CEO', role:'CEO', primary:'SULANDRA_HEALTH', executive:true },
  auditor: { label:'Auditor', role:'AUDITOR', primary:'SCLS' },
});

function sessionFor(persona) {
  const slug = persona.label.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  return {
    accessToken:`uat-token-${slug}`,
    id:`uat-${slug}`,
    userId:`uat-${slug}`,
    displayName:`UAT ${persona.label}`,
    fullName:`UAT ${persona.label}`,
    email:`uat-${slug}@sulandrahealth.test`,
    username:`uat-${slug}`,
    role:persona.role,
    status:'ACTIVE',
    enterpriseOwner:persona.executive === true,
    expiresAt:new Date(Date.now()+60*60*1000).toISOString(),
  };
}

function selectedEntity(persona) { return ENTITIES[persona.primary] || ENTITIES.SCLS; }

function analyticsBundle(entity) {
  return {
    entity,
    clients:0,
    intakesOpen:0,
    notifications:{open:0,urgent:0},
    compliance:{blockers:0,due60:0},
    dataQuality:{open:0,critical:0},
    revenue:{review:0,held:0,ready:0,readyEstimatedAmount:0},
    workforce:{timeCorrectionsPending:0,documentsReview:0},
    scls:{tasksOpen:0,tasksOverdue:0},
    homeHealth:{referralsOpen:0,episodesActive:0,visitsToday:0,visitsOpen:0},
    nmt:{ordersOpen:0,tripsToday:0,tripsOpen:0},
    spire:{highIncidentsOpen:0,carePlansReview:0},
  };
}

function myShiftFixture(persona) {
  const authorized = persona.medAuthorized === true || ['LPN','RN','DELEGATING_NURSE'].includes(persona.role);
  const basis = ['LPN','RN','DELEGATING_NURSE'].includes(persona.role) ? 'LICENSED_ROLE' : (authorized ? 'VERIFIED_QUALIFICATION' : 'NONE');
  return {
    generatedAt:new Date().toISOString(),
    selectedLegalEntityId:selectedEntity(persona).id,
    role:persona.role,
    medicationAuthorization:{authorized,basis,role:persona.role,qualifications:authorized && basis==='VERIFIED_QUALIFICATION' ? [{id:'uat-med-qual',qualificationType:'MEDICATION_ADMINISTRATION'}] : []},
    patients:[{
      id:'uat-patient-1',medicalRecordNumber:'UAT-1001',firstName:'Training',lastName:'Client',preferredName:'Training',dateOfBirth:'1990-01-01',
      flags:[],latestVitals:{temperature:98.4,pulse:72,respirations:16,systolic:118,diastolic:74,spo2:98,weight:170,recordedAt:new Date().toISOString()},
      medications:[{id:'uat-med-1',name:'UAT Medication',dose:'1 tab',route:'PO',frequency:'Daily',instructions:'Synthetic UAT record only',dueTimes:['09:00'],schedules:[{scheduledTime:'09:00',windowBeforeMinutes:30,windowAfterMinutes:30}],administrations:[]}],
      dueAssessments:[],
    }],
  };
}

async function installApiFixtures(page, persona) {
  const session = sessionFor(persona);
  const entity = selectedEntity(persona);
  const unexpectedMutations = [];
  page.__uatUnexpectedMutations = unexpectedMutations;

  await page.route(`${API}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const json = body => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });

    if (path === '/api/auth/login' && method === 'POST') return json({ session });
    if (path === '/api/entity-context') return json({ data:{ entities:ALL_ENTITIES, primaryEntityId:entity.id, enterpriseOwner:persona.executive===true } });
    if (path === '/api/session' || path === '/api/auth/session' || path === '/api/auth/me') return json({ data:session, session });

    if (method !== 'GET' && method !== 'HEAD') {
      unexpectedMutations.push(`${method} ${path}`);
      return route.fulfill({ status:409, contentType:'application/json', body:JSON.stringify({ error:'Production role UAT blocks non-login mutations.' }) });
    }

    if (path === '/api/work/notifications/summary') return json({ data:{open:0,urgent:0} });
    if (path === '/api/spire/inbasket') return json({ data:[] });
    if (path === '/api/scls/tasks') return json({ data:[] });
    if (path === '/api/home-health/my-visits') return json({ data:[] });
    if (path === '/api/nmt/driver/my-trips' || path === '/api/nmt/my-trips') return json({ data:[] });
    if (path === '/api/workforce/time/corrections') return json({ data:[] });
    if (path === '/api/spire/my-shift') return json({ data:myShiftFixture(persona) });

    if (path === '/api/home-health/context') return json({ data:{ company:{id:ENTITIES.HOME_HEALTH.id,displayName:ENTITIES.HOME_HEALTH.displayName,code:'HOME_HEALTH',operational:true}, role:persona.role, staffProfile:{discipline:persona.role==='LPN'?'LPN':'RN'} } });
    if (path === '/api/admin/nmt/trips' || path === '/api/admin/nmt/orders' || path === '/api/admin/nmt/vehicles' || path === '/api/admin/nmt/drivers') return json({ data:[] });

    if (path === '/api/enterprise-analytics/overview') {
      return json({ data:{ enterpriseOwner:persona.executive===true, selectedLegalEntityId:entity.id, generatedAt:new Date().toISOString(), portfolio:{clients:0,intakesOpen:0,notificationsOpen:0,notificationsUrgent:0,complianceBlockers:0,dataQualityOpen:0,dataQualityCritical:0,revenueReview:0,revenueHeld:0,revenueReady:0,revenueReadyEstimatedAmount:0}, entities:[analyticsBundle(entity)] } });
    }
    if (path === '/api/enterprise-analytics/activity') return json({ data:{legalEntityId:entity.id,days:Number(url.searchParams.get('days')||30),series:[]} });

    if (path === '/api/security-audit/context') return json({ data:{company:entity,role:persona.role,write:persona.role!=='AUDITOR',enterpriseOwner:persona.executive===true} });
    if (path === '/api/security-audit/feed' || path === '/api/security-audit/chart-access-summary' || path === '/api/security-audit/campaigns' || path === '/api/security-audit/access-candidates') return json({ data:[] });

    if (path === '/api/admin/employees') return json({ data:{employees:[{...session,id:session.userId,jobTitle:persona.label,department:'UAT'}]} });
    if (path.includes('/api/admin/employee360/enterprise-gap-dashboard')) return json({ data:{metrics:{blockedAssignments:0,failedCommunications:0},assignments:[],corrections:[],signoffs:[],communications:[],security:[],audit:[]} });
    if (path.includes('/api/admin/employee360/secure-files')) return json({ data:[] });

    if (path === '/api/scls/homes' || path.startsWith('/api/scls/homes/')) return json({ data:[] });
    if (path.startsWith('/api/workforce/') || path.startsWith('/api/employee/') || path.startsWith('/api/admin/time-attendance/') || path.startsWith('/api/admin/scheduling/')) return json({ data:[] });

    return json({ data:[] });
  });
}

async function loginFromVisibleForm(page, persona) {
  await installApiFixtures(page, persona);
  await page.goto('/employee-login.html');
  await expect(page).toHaveTitle(/Employee Login/i);
  await expect(page.getByRole('heading',{name:'Employee sign in'})).toBeVisible();
  await page.getByLabel('Employee email or username').fill(sessionFor(persona).email);
  await page.getByLabel('Password').fill('Synthetic-UAT-Password-Only');
  await page.getByRole('button',{name:'Sign In'}).click();

  if (persona.executive) {
    await expect(page).toHaveURL(/\/admin\.html(?:#.*)?$/);
    await expect(page.locator('#topModuleNav')).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/employee-portal\.html$/);
    await expect(page.locator('body')).toHaveAttribute('data-role-uat-ready','true');
    await expect(page.locator('body')).toHaveAttribute('data-authenticated-role',persona.role);
  }
  return page.__uatUnexpectedMutations;
}

async function clickLauncher(page, selector, expectedPath, headingOrTitle) {
  const control = page.locator(selector).first();
  await expect(control).toBeVisible();
  await control.click();
  await expect(page).toHaveURL(new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  if (headingOrTitle) {
    const heading = page.getByRole('heading',{name:headingOrTitle,exact:false}).first();
    if (await heading.count()) await expect(heading).toBeVisible();
    else await expect(page).toHaveTitle(new RegExp(headingOrTitle,'i'));
  }
}

async function expectNoRestrictedPortalLinks(page, selectors) {
  for (const selector of selectors) await expect(page.locator(selector)).toBeHidden();
}

for (const [key, persona] of Object.entries(PERSONAS)) {
  test(`${persona.label}: login-first production navigation UAT`, async ({page}) => {
    const mutations = await loginFromVisibleForm(page, persona);

    if (key === 'dsp') {
      await expect(page.locator('#employeeCompanyDocumentsLauncher')).toHaveCount(0);
      await clickLauncher(page,'#employeeMyShiftLauncher','/spire-shift.html','My Shift');
      await expect(page.locator('#medAuth')).toContainText('view-only');
    } else if (key === 'medDsp') {
      await clickLauncher(page,'#employeeMyShiftLauncher','/spire-shift.html','My Shift');
      await expect(page.locator('#medAuth')).toContainText('Medication administration authorized');
      await expect(page.getByRole('link',{name:'Open eMAR'})).toBeVisible();
    } else if (key === 'lpn') {
      await clickLauncher(page,'#employeeMyShiftLauncher','/spire-shift.html','My Shift');
      await expect(page.locator('#medAuth')).toContainText('LICENSED ROLE',{ignoreCase:true});
    } else if (key === 'rn') {
      await clickLauncher(page,'#employeeLiveSpireLauncher','/spire.html','SPIRE');
    } else if (key === 'delegatingNurse') {
      await clickLauncher(page,'#employeeSclsOperationsLauncher','/scls-residential.html','SCLS Residential Operations');
    } else if (key === 'houseManager') {
      await expect(page.locator('#employeeCompanyDocumentsLauncher')).toHaveCount(0);
      await clickLauncher(page,'#employeeSclsOperationsLauncher','/scls-residential.html','SCLS Residential Operations');
    } else if (key === 'programManager') {
      await expect(page.locator('#employeeSclsOperationsLauncher')).toBeVisible();
      await clickLauncher(page,'#employeeAnalyticsLauncher','/enterprise-analytics.html','Enterprise Operating Analytics');
    } else if (key === 'homeHealthClinician') {
      await expect(page.locator('#employeeHomeHealthOperationsLauncher')).toBeVisible();
      await clickLauncher(page,'#employeeHomeHealthVisitsLauncher','/home-health-visits.html','My Home Health Visits');
    } else if (key === 'scheduler') {
      await expectNoRestrictedPortalLinks(page,['#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher']);
      await clickLauncher(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control');
    } else if (key === 'dispatcher') {
      await expectNoRestrictedPortalLinks(page,['#employeeMyShiftLauncher','#employeeLiveSpireLauncher']);
      await clickLauncher(page,'#employeeNmtDispatchLauncher','/nmt-dispatch.html','NMT Dispatch');
    } else if (key === 'driver') {
      await expectNoRestrictedPortalLinks(page,['#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher']);
      await clickLauncher(page,'#employeeNmtTripsLauncher','/nmt-driver.html','My NMT Trips');
    } else if (key === 'hr') {
      await expectNoRestrictedPortalLinks(page,['#employeeMyShiftLauncher','#employeeLiveSpireLauncher']);
      await expect(page.locator('#employeeCompanyDocumentsLauncher')).toBeVisible();
      await clickLauncher(page,'#employeeHr360Launcher','/employee360.html','Employee 360 Enterprise Workspace');
    } else if (key === 'auditor') {
      await expect(page.locator('#employeeMyShiftLauncher')).toHaveCount(0);
      await expect(page.locator('#employeeLiveSpireLauncher')).toBeVisible();
      await clickLauncher(page,'#employeeSecurityAuditLauncher','/security-audit.html','Security');
    } else if (persona.executive) {
      const spireAdmin = page.locator('#topModuleNav a[href="/spire-admin.html"]').first();
      await expect(spireAdmin).toBeVisible();
      await spireAdmin.click();
      await expect(page).toHaveURL(/\/spire-admin\.html$/);
      await expect(page).toHaveTitle(/SPIRE/i);
    }

    expect(mutations, `Unexpected production-data mutations for ${persona.label}`).toEqual([]);
  });
}

test.describe('representative mobile role UAT', () => {
  const mobileCases = [
    ['DSP', PERSONAS.dsp, '#employeeMyShiftLauncher', '/spire-shift.html'],
    ['NMT Dispatcher', PERSONAS.dispatcher, '#employeeNmtDispatchLauncher', '/nmt-dispatch.html'],
    ['HR Manager', PERSONAS.hr, '#employeeHr360Launcher', '/employee360.html'],
    ['Administrator', PERSONAS.administrator, '#topModuleNav a[href="/spire-admin.html"]', '/spire-admin.html'],
  ];
  for (const [label, persona, selector, target] of mobileCases) {
    test(`${label}: mobile login and visible-button navigation`, async ({page}) => {
      await page.setViewportSize({width:390,height:844});
      const mutations = await loginFromVisibleForm(page, persona);
      const control = page.locator(selector).first();
      await expect(control).toBeVisible();
      await control.click();
      await expect(page).toHaveURL(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      expect(mutations).toEqual([]);
    });
  }
});

test('production portal exposes the expected role-UAT contract marker', async ({page}) => {
  await page.goto('/employee-portal.html');
  await expect(page.locator('meta[name="sulandra-role-uat-contract"]')).toHaveAttribute('content',UAT_CONTRACT);
});
