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
  'One authoritative Admin information-architecture registry.',
  'topActions: Object.freeze([','folders: Object.freeze([',
  "label:'Company Management'","label:'People & HR'","label:'Clients & SPIRE'","label:'Service Operations'",
  "label:'Billing & Revenue'","label:'Compliance & Quality'","label:'Communications & Learning'","label:'System Administration'",
  "key:'dashboard',label:'Dashboard'","key:'my-work',label:'My Work'","key:'notifications',label:'Notifications'","key:'profile',label:'Profile'",
  'adminGlobalToolSearch','NAVIGATION.folders.map(folderMarkup).join',
  "key:'onboarding',label:'Hiring & Onboarding'","key:'admin-users',label:'Admin Users'","key:'role-workspaces',label:'Roles, Permissions & Workspaces'",
  "href:'/employee-ohio-screening-workspace.html'","href:'/dodd-billing-rules.html'","href:'/revenue-claim-exchange.html'","href:'/spire-evv-test-console.html'",
  "href:'/home-health-referral-inbox.html'","href:'/nmt-order-inbox.html'","href:'/spire-admission-history.html'","href:'/spire-incident-compliance.html'",
  'onboardingLifecycle:Object.freeze([',"key:'overview',label:'Overview'","key:'openings',label:'Job Openings'","key:'applicants',label:'Applicants'",
  "key:'screening',label:'Screening'","key:'interviews',label:'Interviews'","key:'offers',label:'Offers'",
  "key:'pre-employment',label:'Pre-employment'","key:'new-hire-paperwork',label:'New-hire Paperwork'","key:'orientation',label:'Orientation'",
  "key:'employee-activation',label:'Employee Activation'","key:'archived',label:'Archive'",
  "serviceModule.id = 'module-service-requests'","servicePanel.classList.remove('onboarding-panel','active')",
  'window.SulandraAdminNavigation',"'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'",
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'","'/assets/admin-client-service-requests.js?v=20260809-company-intake-3'",
  'loadEmployeeSuite','data-company-modules','installInformationArchitectureStyles()',
],'Canonical Admin navigation/bootstrap');

forbid(context,[
  'admin-enterprise-apps-launcher.js','admin-navigation-overflow.js','NAVIGATION.primary','NAVIGATION.leftOnly',
  'right.innerHTML =','Platform Portals','Quick Operations',
],'Canonical Admin navigation/bootstrap');
forbid(shellJs,['ensureNavigationOverflow','admin-navigation-overflow.js','ensurePlatformBar','sulandraNewsTrack','NEWS_REFRESH_MS'],'Canonical Admin shell runtime');
requireMarkers(shellJs,[
  'ensureCanonicalSso()','/assets/sulandra-sso-session.js?v=20260806-sso-1','data-canonical-admin-sso',
  'ensureModuleHosts()',"employee.id = 'module-employees'",'removeLegacyNavigationArtifacts()',
  'weather-mini-clock',"timeZone:'America/New_York'","adminInformationArchitecture = 'canonical-folders-v1'",
],'Canonical Admin shell runtime');

const folderStart = context.indexOf('folders: Object.freeze([');
const lifecycleStart = context.indexOf('onboardingLifecycle:Object.freeze([');
const folderRegistry = folderStart >= 0 && lifecycleStart > folderStart ? context.slice(folderStart,lifecycleStart) : '';
for (const publicRoute of ['/careers.html','/applicant-portal.html','/offer-acceptance.html','/patient-portal.html','/service-request.html','/course-player.html','/employee-portal.html']) {
  if (folderRegistry.includes(publicRoute)) failures.push(`Public/contextual workflow leaked into Admin folders: ${publicRoute}`);
}
for (const duplicate of [
  ["'/home-health-referrals.html':'/home-health-referral-inbox.html'",'Home Health referrals alias'],
  ["'/nmt-orders.html':'/nmt-order-inbox.html'",'NMT order alias'],
  ["'/spire-demo.html':'/spire-training.html'",'SPIRE training alias'],
  ["'/transportation.html':'/nmt-dispatch.html'",'Transportation alias'],
  ["'/intranet.HTML':'/intranet.html'",'Intranet case alias'],
]) if (!context.includes(duplicate[0])) failures.push(`Canonical Admin registry missing ${duplicate[1]}`);

const routeMatches = [...folderRegistry.matchAll(/href:'(\/[^']+)'/g)].map(match => match[1]);
for (const href of [...new Set(routeMatches)]) {
  const pathname = href.split(/[?#]/,1)[0].replace(/^\//,'');
  if (!pathname || !pathname.endsWith('.html')) continue;
  try { await stat(path.join(root, pathname)); } catch { failures.push(`Admin registry route does not exist: ${href}`); }
}

forbid(buildScript,["restore-modern-admin-portal.mjs","finalize-admin-fullscreen-layout.mjs","install-employee-management-frontend.mjs","fix-admin-company-settings-backend.mjs"],'Static build');
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
console.log('Canonical Admin source verified: one eight-folder registry owns Admin navigation, the top bar is limited to global actions, Service Requests are separated from Hiring & Onboarding, and legacy overflow/drawer/Enterprise Apps navigation injection is disabled.');
