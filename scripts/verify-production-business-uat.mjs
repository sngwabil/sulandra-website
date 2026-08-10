import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./prepare-production-business-uat.mjs');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=async rel=>{try{return await readFile(path.join(root,rel),'utf8')}catch{failures.push(`Missing ${rel}`);return''}};
const expect=(condition,label)=>{if(!condition)failures.push(label)};
const contract='20260810-business-uat-1';
const canonical='https://sulandra-website-production-5fc4.up.railway.app';
const stale='https://sulandra-website-production.up.railway.app';

const [installer,preparer,payroll,test,config,workflow,pkg,interview,applicant,offer,workforceAdvanced,taskPage,navGuard]=await Promise.all([
  read('scripts/install-business-path-uat-bridges.mjs'),read('scripts/prepare-production-business-uat.mjs'),read('assets/workforce-payroll-readiness.js'),read('tests/production-business-path-uat.spec.mjs'),read('playwright.business-uat.config.mjs'),read('.github/workflows/production-business-uat.yml'),read('package.json'),read('interview-admin-scheduler.js'),read('applicant-portal.html'),read('offer-acceptance.html'),read('api/src/workforce-advanced-routes.ts'),read('scls-tasks.html'),read('assets/employee-role-navigation-guard.js')
]);

for(const marker of [contract,'interview-admin-scheduler.js','applicant-portal.html','offer-acceptance.html','sclsTaskBoardLink','sclsTasksWorkflowLink','workforce-payroll-readiness.js'])expect(installer.includes(marker),`Business UAT installer missing ${marker}`);
expect(installer.includes(canonical),'Business UAT installer lacks canonical Railway API');
expect(preparer.includes('Admin applicant panel navigation')&&preparer.includes('My Shift vitals endpoint')&&preparer.includes('Home Health four-step referral wizard')&&preparer.includes('NMT five-step facility referral wizard')&&preparer.includes('Company Documents tree and upload API contract')&&preparer.includes('Incident patient chart navigation'),'Business UAT preparation does not preserve the live workflow contract corrections');
expect(navGuard.includes("['employeeWorkforceLauncher', '/workforce.html']")&&navGuard.includes("['employeeWorkforceNav', '/workforce.html']")&&navGuard.includes("workforce: '/workforce.html'"),'Employee Workforce navigation is not protected from legacy Time & Attendance interception');
expect(payroll.includes(contract)&&payroll.includes('payroll-export.csv?status=APPROVED')&&payroll.includes('Export Payroll-Ready CSV'),'Payroll-ready UI bridge is incomplete');
expect(workforceAdvanced.includes('/api/admin/workforce/payroll-export.csv'),'Payroll-ready backend export route is missing');
expect(taskPage.includes('SCLS Task Board')&&taskPage.includes('id="newTask"')&&taskPage.includes('/api/scls/tasks'),'SCLS task lifecycle page is incomplete');

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
expect(test.includes("[data-workspace=\"census\"]")&&test.includes('/vitals`&&method===\'POST\''),'Prepared business UAT is not following the actual SPIRE patient/vitals contracts');
expect(config.includes('https://www.sulandrahealth.com')&&config.includes('workers: 1'),'Business UAT Playwright config is not deterministic and production-pinned');
for(const marker of [contract,'Wait for exact production business-UAT deployment','playwright.business-uat.config.mjs','www.sulandrahealth.com'])expect(workflow.includes(marker),`Business UAT workflow missing ${marker}`);
expect(pkg.includes('verify:business-uat'),'package.json does not expose the business UAT verifier');
expect(pkg.includes('install-business-path-uat-bridges.mjs'),'Business-path publication installer is not wired into repository scripts');

for(const rel of ['assets/workforce-payroll-readiness.js','assets/employee-role-navigation-guard.js','scripts/install-business-path-uat-bridges.mjs','scripts/prepare-production-business-uat.mjs','scripts/verify-production-business-uat.mjs','tests/production-business-path-uat.spec.mjs','playwright.business-uat.config.mjs']){
  try{await access(path.join(root,rel));const out=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});if(out.status!==0)failures.push(`${rel} syntax check failed: ${(out.stderr||out.stdout||'').trim()}`);}catch{}
}
if(failures.length){console.error('Production business-path UAT contract verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Production business-path UAT verified: all nine end-to-end business paths, stateful synthetic mutation protection, applicant API normalization, protected Workforce navigation, SCLS task continuity, payroll readiness, and exact production synchronization are enforced.');
