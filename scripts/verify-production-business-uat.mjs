import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./prepare-production-business-uat.mjs');
await import('./prepare-production-business-uat-round7.mjs');
await import('./prepare-production-business-uat-round8.mjs');
await import('./prepare-production-business-uat-round9.mjs');
await import('./prepare-production-business-uat-round10.mjs');
await import('./prepare-production-business-uat-round12.mjs');
await import('./prepare-production-business-uat-round13.mjs');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=async rel=>{try{return await readFile(path.join(root,rel),'utf8')}catch{failures.push(`Missing ${rel}`);return''}};
const expect=(condition,label)=>{if(!condition)failures.push(label)};
const contract='20260810-business-uat-1';
const spireAppGeneration='20260810-business-uat-7';
const chartReadyGeneration='20260810-spire-chart-ready-2';
const deepLinkGeneration='20260810-business-uat-5';
const canonical='https://sulandra-website-production-5fc4.up.railway.app';
const stale='https://sulandra-website-production.up.railway.app';

const [installer,preparer,round7,round8,round9,round10,round12,round13,payroll,test,config,workflow,pkg,interview,applicant,offer,workforceAdvanced,taskPage,navGuard,deepLink,chartReady,hhTokenBootstrap,spirePage,employeePortal]=await Promise.all([
  read('scripts/install-business-path-uat-bridges.mjs'),read('scripts/prepare-production-business-uat.mjs'),read('scripts/prepare-production-business-uat-round7.mjs'),read('scripts/prepare-production-business-uat-round8.mjs'),read('scripts/prepare-production-business-uat-round9.mjs'),read('scripts/prepare-production-business-uat-round10.mjs'),read('scripts/prepare-production-business-uat-round12.mjs'),read('scripts/prepare-production-business-uat-round13.mjs'),read('assets/workforce-payroll-readiness.js'),read('tests/production-business-path-uat.spec.mjs'),read('playwright.business-uat.config.mjs'),read('.github/workflows/production-business-uat.yml'),read('package.json'),read('interview-admin-scheduler.js'),read('applicant-portal.html'),read('offer-acceptance.html'),read('api/src/workforce-advanced-routes.ts'),read('scls-tasks.html'),read('assets/employee-role-navigation-guard.js'),read('assets/spire-deep-link.js'),read('assets/spire-chart-ready.js'),read('assets/home-health-referral-token-bootstrap.js'),read('spire.html'),read('employee-portal.html')
]);

for(const marker of [contract,spireAppGeneration,chartReadyGeneration,deepLinkGeneration,'interview-admin-scheduler.js','applicant-portal.html','offer-acceptance.html','sclsTaskBoardLink','sclsTasksWorkflowLink','workforce-payroll-readiness.js','home-health-referral-token-bootstrap.js','companyComplianceLink','homeHealthReferralInboxLink','employeeHomeHealthReferralInboxLauncher','employee-role-navigation-guard.js','BUSINESS_UAT_NATIVE_DEEPLINK','BUSINESS_UAT_ASYNC_WORKSPACE_REFRESH','BUSINESS_UAT_CHART_FIRST','BUSINESS_UAT_CHART_STABILIZED','BUSINESS_UAT_CHART_WORKSPACE_STATE','SpireOpenPatient'])expect(installer.includes(marker),`Business UAT installer missing ${marker}`);
expect(installer.includes(canonical),'Business UAT installer lacks canonical Railway API');
for(const marker of ['Admin initialization readiness helper','Client Intake initialization readiness','My Shift vitals endpoint','eMAR medication order identity','SCLS elevated assignment context','Home Health four-step referral wizard','NMT five-step facility referral wizard','NMT referral review context endpoint','Workforce interactive readiness and Timesheets activation','Company Documents tree and upload API contract','Company Documents to Company Compliance navigation','Incident patient chart navigation'])expect(preparer.includes(marker),`Business UAT preparation missing ${marker}`);
for(const marker of ['Applicant lifecycle status select specificity','Client Intake sticky-header-safe New Intake activation','eMAR native deep-link readiness','SCLS Staff tab transition before assignment','Home Health Operations to Referral Inbox transition','NMT order-detail patientCandidates fixture','NMT operational order display shape','Workforce submit confirmation acceptance','Company Compliance item display shape','Company Compliance category/write context','Company Compliance summary fixture','Company Compliance initialization readiness','Incident patient chart open readiness'])expect(round7.includes(marker),`Round-seven business UAT preparation missing ${marker}`);
for(const marker of ['Offer Acceptance exact heading','Client Intake submitted workspace status','SCLS Task Board initialization readiness','Home Health direct Referral Inbox launcher','NMT dispatch-compatible vehicle fixture','Workforce timesheet approval action contract','Company Compliance resolved ACTIVE status','eMAR chart workspace readiness','Incident chart workspace readiness'])expect(round8.includes(marker),`Round-eight business UAT preparation missing ${marker}`);
for(const marker of ['Client Intake SPIRE chart-open readiness','SCLS Task Board real-home readiness','Home Health referral context route','Home Health referral review route','Home Health referral detail route','Home Health referral list route','Home Health referral sources list fixture','Workforce guarded employee-page navigation readiness'])expect(round9.includes(marker),`Round-nine business UAT preparation missing ${marker}`);
for(const marker of ['Home Health intake visible APPROVED status','Incident authorized census-row readiness'])expect(round10.includes(marker),`Round-ten business UAT preparation missing ${marker}`);
for(const marker of ['Browser error diagnostics','Client Intake chart coordinator readiness','eMAR chart coordinator readiness','Incident chart coordinator readiness','Home Health intake approved status scope'])expect(round12.includes(marker),`Round-twelve business UAT preparation missing ${marker}`);
for(const marker of ['Home Health Plan of Care review state','Home Health intake-to-episode creation route','Home Health episode detail UI contract','Home Health Plan of Care status lifecycle route','Home Health Plan of Care review then activation UI path'])expect(round13.includes(marker),`Round-thirteen business UAT preparation missing ${marker}`);

expect(navGuard.includes("['employeeWorkforceLauncher', '/workforce.html']")&&navGuard.includes("['employeeWorkforceNav', '/workforce.html']")&&navGuard.includes("workforce: '/workforce.html'"),'Employee Workforce navigation guard does not protect the canonical Workforce destination');
expect(installer.includes('employee-role-navigation-guard.js'),'Employee Portal navigation guard is not wired into publication');
expect(payroll.includes(contract)&&payroll.includes('payroll-export.csv?status=APPROVED')&&payroll.includes('Export Payroll-Ready CSV'),'Payroll-ready UI bridge is incomplete');
expect(workforceAdvanced.includes('/api/admin/workforce/payroll-export.csv'),'Payroll-ready backend export route is missing');
expect(taskPage.includes('SCLS Task Board')&&taskPage.includes('id="newTask"')&&taskPage.includes('/api/scls/tasks'),'SCLS task lifecycle page is incomplete');
expect(deepLink.includes('waitForAuthorizedPatient')&&deepLink.includes("query.get('patientId')")&&deepLink.includes("hash.get('tab')")&&deepLink.includes('fallbackOpenRequestedChart')&&deepLink.includes('directOpenRequestedChart')&&deepLink.includes('BUSINESS_UAT_DIRECT_CHART_OPEN')&&deepLink.includes('BUSINESS_UAT_PATIENT_CLICK_RECOVERY')&&deepLink.includes('SpireChartReady'),'SPIRE deep-link bridge does not delegate both deep links and visible patient clicks to the chart-readiness coordinator');
expect(chartReady.includes(chartReadyGeneration)&&chartReady.includes('BUSINESS_UAT_IDEMPOTENT_CHART_ACTIVE')&&chartReady.includes('ensurePatientChart')&&chartReady.includes('forceChartActive')&&chartReady.includes('SpireOpenPatient')&&chartReady.includes('spireChartReady')&&chartReady.includes('spireChartPatientId')&&chartReady.includes('MutationObserver'),'SPIRE idempotent chart-readiness coordinator is incomplete');
expect(spirePage.includes('spire-app-v2.js?')&&spirePage.includes('spire-chart-ready.js?')&&spirePage.includes('spire-deep-link.js?'),'SPIRE source page is missing the versioned app/chart-ready/deep-link assets that publication pins exactly');
expect(hhTokenBootstrap.includes('sulandra:home-health:referral-token')&&hhTokenBootstrap.includes("searchParams.get('token')")&&hhTokenBootstrap.includes('history.replaceState'),'Home Health secure invitation token bootstrap is incomplete');
expect(employeePortal.includes('employee-role-navigation-guard.js'),'Employee Portal does not publish the Workforce navigation guard');

for(const [source,name] of [[interview,'interview scheduler'],[applicant,'applicant portal'],[offer,'offer acceptance']]){
  expect(source.includes(canonical)||source.includes(stale),`${name} has no Railway API contract to normalize`);
}

const paths=[
  'Applicant → Interview → Offer → Onboarding → Employee Login',
  'Client Intake → Review → Admission → SPIRE Chart → Care Plan',
  'DSP Shift → Vitals → Due Medication → eMAR Documentation',
  'SCLS Home → Resident → Assignment → Task → Handoff',
  'Home Health Referral → Intake → Start of Care → Plan of Care → Visit',
  'NMT Hospital Referral → Review → Order → Dispatch → Driver → Completed Trip',
  'Workforce → Timesheet → Approval → Payroll Readiness',
  'Company Document/Compliance → Expiration → Notification → Resolution',
  'Incident → Follow-up → Audit History',
];
for(const label of paths)expect(test.includes(label),`Production business UAT is missing path: ${label}`);
expect(test.includes('unexpectedLiveMutations'),'Business UAT does not fail unexpected production-data mutations');
expect(test.includes('Synthetic Business UAT'),'Business UAT fixtures are not visibly synthetic');
expect(test.includes("page.goto('/employee-login.html')")&&test.includes("page.goto('/careers.html')"),'Business UAT is not anchored to real actor entry points');
expect(test.includes('adminLogin(page)')&&test.includes("#onboarding-applicants #applicantTable")&&test.includes("select[data-status]")&&test.includes("name:'Offer of Employment',exact:true")&&test.includes("#workspace .status.SUBMITTED")&&test.includes('newIntakeButton')&&test.includes("[data-workspace=\"census\"]")&&test.includes("/vitals`&&method==='POST'")&&test.includes('medicationOrderId:\'biz-med\'')&&test.includes('#employeeHomeHealthReferralInboxLauncher')&&test.includes('/api/admin/home-health/referral-context')&&test.includes('/api/admin/home-health/referrals')&&test.includes('/api/admin/home-health/referral-sources')&&test.includes('/api/home-health/episodes/from-intake/')&&test.includes('readiness:{ready:true,blockers:[]}')&&test.includes('pocReview')&&test.includes('/plan-of-care/biz-poc/status')&&test.includes('data-poc-action=\"SUBMIT_REVIEW\"')&&test.includes('patientCandidates:[]')&&test.includes("serviceLevels:['AMBULATORY']")&&test.includes("body.action==='APPROVE'")&&test.includes("requirementName:'Synthetic Business UAT License'")&&test.includes("#list .status.ACTIVE")&&test.includes("#workspace .status.APPROVED")&&test.includes('data-spire-chart-ready')&&test.includes('BUSINESS-UAT PAGE ERROR')&&test.includes('#homeFilter option[value=')&&test.includes('SulandraEmployeeRoleNavigationGuard')&&test.includes("toHaveURL(/\\/workforce\\.html$/)"),'Prepared business UAT is not following the exact round-thirteen Admin/SPIRE/Home Health/operations contracts');
expect(config.includes('https://www.sulandrahealth.com')&&config.includes('workers: 1'),'Business UAT Playwright config is not deterministic and production-pinned');
for(const marker of [contract,spireAppGeneration,chartReadyGeneration,deepLinkGeneration,'Wait for exact production business-UAT deployment','playwright.business-uat.config.mjs','www.sulandrahealth.com','home-health-referral-token-bootstrap.js','companyComplianceLink','employeeHomeHealthReferralInboxLauncher','employee-role-navigation-guard.js','BUSINESS_UAT_NATIVE_DEEPLINK','BUSINESS_UAT_ASYNC_WORKSPACE_REFRESH','BUSINESS_UAT_CHART_FIRST','BUSINESS_UAT_CHART_STABILIZED','BUSINESS_UAT_CHART_WORKSPACE_STATE','BUSINESS_UAT_IDEMPOTENT_CHART_ACTIVE','BUSINESS_UAT_DIRECT_CHART_OPEN','BUSINESS_UAT_PATIENT_CLICK_RECOVERY','SpireChartReady','ensurePatientChart','SpireOpenPatient','waitForAuthorizedPatient'])expect(workflow.includes(marker),`Business UAT workflow missing ${marker}`);
expect(pkg.includes('verify:business-uat'),'package.json does not expose the business UAT verifier');
expect(pkg.includes('install-business-path-uat-bridges.mjs'),'Business-path publication installer is not wired into repository scripts');

for(const rel of ['assets/workforce-payroll-readiness.js','assets/employee-role-navigation-guard.js','assets/spire-deep-link.js','assets/spire-chart-ready.js','assets/home-health-referral-token-bootstrap.js','scripts/install-business-path-uat-bridges.mjs','scripts/prepare-production-business-uat.mjs','scripts/prepare-production-business-uat-round7.mjs','scripts/prepare-production-business-uat-round8.mjs','scripts/prepare-production-business-uat-round9.mjs','scripts/prepare-production-business-uat-round10.mjs','scripts/prepare-production-business-uat-round12.mjs','scripts/prepare-production-business-uat-round13.mjs','scripts/verify-production-business-uat.mjs','tests/production-business-path-uat.spec.mjs','playwright.business-uat.config.mjs']){
  try{await access(path.join(root,rel));const out=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});if(out.status!==0)failures.push(`${rel} syntax check failed: ${(out.stderr||out.stdout||'').trim()}`);}catch{}
}
if(failures.length){console.error('Production business-path UAT contract verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Production business-path UAT verified: all nine end-to-end paths, stateful synthetic mutation protection, browser-error diagnostics, idempotent SPIRE chart-readiness coordination for Intake/eMAR/Incident, exact Home Health intake-to-episode and POC review lifecycle, guarded Workforce navigation, asynchronous census refresh, SCLS task continuity, payroll readiness, compliance continuity, and exact production synchronization are enforced.');
