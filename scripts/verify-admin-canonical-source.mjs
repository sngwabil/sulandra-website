import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];
const read = async relative => { try { return await readFile(path.join(root, relative), 'utf8'); } catch { failures.push(`Missing canonical source: ${relative}`); return ''; } };
const readPublished = async relative => { try { return await readFile(path.join(dist, relative), 'utf8'); } catch { failures.push(`Missing published file: ${relative}`); return ''; } };
const requireMarkers = (source, markers, label) => { for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing ${marker}`); };
const forbid = (source, markers, label) => { for (const marker of markers) if (source.includes(marker)) failures.push(`${label} still references ${marker}`); };

const [adminSource,adminPublished,context,shellJs,shellCss,buildScript,packageJson,serviceRequestPublisher,ssoPublisher,platformFinalizer] = await Promise.all([
  read('admin.html'),readPublished('admin.html'),read('assets/admin-company-context.js'),read('assets/admin-shell.js'),read('assets/admin-shell.css'),
  read('scripts/build-static-site.mjs'),read('package.json'),read('scripts/install-client-service-request-frontend.mjs'),
  read('scripts/install-sulandra-sso-session.mjs'),read('scripts/finalize-platform-navigation.mjs'),
]);

if (adminSource !== adminPublished) failures.push('dist-web/admin.html drifted from canonical admin.html; post-copy Admin mutation occurred');
for (const [label,source] of [['Admin company/navigation context',context],['Admin shell runtime',shellJs]]) {
  try { new Function(source); } catch (error) { failures.push(`${label} has JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

requireMarkers(adminSource,['id="topModuleNav"','id="sideModuleNav"','/assets/admin-company-context.js?v=20260809-admin-company-context-2','admin-railway.js?v=20260804-admin-clean-4'],'Canonical admin.html');
requireMarkers(context,[
  'const NAVIGATION = Object.freeze({',"{key:'dashboard',label:'Dashboard'","{key:'service-homes',label:'Service Homes'","{key:'employees',label:'Employees'",
  "href:'/scheduling.html'","href:'/time-attendance.html#admin'","href:'/employee360.html#files'","href:'/employee360.html#audit'","href:'/spire-admin.html'",
  "{key:'onboarding',label:'Onboarding'","href:'/client-intake.html'","href:'/home-health-referrals.html'","href:'/home-health.html'",
  "href:'/nmt-orders.html'","href:'/nmt-dispatch.html'","href:'/workforce-admin.html'","href:'/spire-medication-qualifications.html'","href:'/company-documents.html'",
  "href:'/spire-training.html'","href:'/intranet-control.html'","href:'/employee-portal.html'","href:'/education-portal.html'",
  'top.innerHTML = NAVIGATION.primary.map(topMarkup).join',"side.innerHTML = [...NAVIGATION.leftOnly, ...NAVIGATION.primary].map(sideMarkup).join",
  'data-company-module','renderRightDrawer','window.SulandraAdminNavigation',"'/assets/admin-shell.js?v=20260810-canonical-admin-1'",
  "'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'","'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'","'/assets/admin-achieved-archive-fix.js?v=20260808-achieved-archive-1'",
  "'/assets/admin-client-service-requests.js?v=20260809-company-intake-3'",'loadEmployeeSuite',
],'Canonical Admin navigation/bootstrap');
if (!context.includes("{key:'settings',label:'Settings'") && !context.includes("{key:'settings',label:'Company Chronicles'")) {
  failures.push('Canonical Admin navigation/bootstrap missing Settings or Company Chronicles root configuration module');
}
forbid(context,['installWorkspaceLinks()','const topLink =','const sideButton =','admin-platform-routing.js'],'Canonical Admin navigation/bootstrap');

requireMarkers(shellCss,['html,body{width:100%!important','max-width:none!important','.sulandra-platform-bar','@keyframes sulandraNewsTicker','@keyframes sulandraLiveBlink','body .edge-toggle{width:24px!important;height:104px!important'],'Canonical Admin shell CSS');
requireMarkers(shellJs,[
  'NEWS_REFRESH_MS = 10 * 60 * 1000','Dayton%20Ohio%20when%3A1d','ensureCanonicalSso()',
  '/assets/sulandra-sso-session.js?v=20260806-sso-1','data-canonical-admin-sso','ensureModuleHosts()',"employee.id = 'module-employees'",
  'ensurePlatformBar()','weather-mini-clock',"timeZone:'America/New_York'",
],'Canonical Admin shell runtime');

forbid(buildScript,["restore-modern-admin-portal.mjs","finalize-admin-fullscreen-layout.mjs","install-employee-management-frontend.mjs","admin-achieved-archive-fix.js?v=20260808-achieved-archive-1\"></script>","fix-admin-company-settings-backend.mjs"],'Static build');
requireMarkers(buildScript,["await import('./verify-admin-canonical-source.mjs')","'assets/admin-shell.css'","'assets/admin-shell.js'",'Admin is deliberately not rewritten after publication'],'Static build');
forbid(packageJson,['scripts/fix-admin-time-attendance-link.mjs','scripts/restore-modern-admin-portal.mjs','scripts/install-employee-management-frontend.mjs','scripts/finalize-admin-fullscreen-layout.mjs'],'package.json build pipeline');

if (serviceRequestPublisher.includes("path.join(dist,'admin.html')")) failures.push('Client Service Request publisher still mutates dist-web/admin.html');
if (!serviceRequestPublisher.includes('Admin service-request integration is canonical')) failures.push('Client Service Request publisher does not document canonical Admin ownership');
if (ssoPublisher.includes("'admin.html'")) failures.push('Global SSO HTML publisher still rewrites Admin instead of canonical shell ownership');
requireMarkers(ssoPublisher,['Admin owns SSO from assets/admin-shell.js'],'SSO publisher');
requireMarkers(platformFinalizer,["if (path.basename(file).toLowerCase() === 'admin.html') continue",'canonical Admin navigation is protected'],'Global platform navigation publisher');

for (const relative of ['assets/admin-shell.css','assets/admin-shell.js','assets/admin-company-context.js','assets/sulandra-sso-session.js']) {
  try { await stat(path.join(dist, relative)); } catch { failures.push(`Canonical Admin publication missing ${relative}`); }
}
if (failures.length) { console.error('Canonical Admin source verification failed:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('Canonical Admin source verified: one navigation registry owns top/left/company-specific/portal routes, modern shell and SSO are source-controlled, and generic/post-build publishers are forbidden from rewriting Admin.');