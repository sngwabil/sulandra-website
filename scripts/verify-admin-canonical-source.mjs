import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing canonical source: ${relative}`);return''}};
const published=async relative=>{try{return await readFile(path.join(dist,relative),'utf8')}catch{failures.push(`Missing published file: ${relative}`);return''}};
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing ${marker}`)};
const forbid=(source,markers,label)=>{for(const marker of markers)if(source.includes(marker))failures.push(`${label} still references ${marker}`)};

const [adminSource,adminPublished,registry,ia,onboarding,context,shellJs,shellCss,buildScript,packageJson,serviceRequestPublisher,ssoPublisher,platformFinalizer]=await Promise.all([
  read('admin.html'),published('admin.html'),read('assets/admin-navigation-registry.js'),read('assets/admin-information-architecture.js'),
  read('assets/admin-onboarding-workflow.js'),read('assets/admin-company-context.js'),read('assets/admin-shell.js'),read('assets/admin-shell.css'),
  read('scripts/build-static-site.mjs'),read('package.json'),read('scripts/install-client-service-request-frontend.mjs'),
  read('scripts/install-sulandra-sso-session.mjs'),read('scripts/finalize-platform-navigation.mjs'),
]);

if(adminSource!==adminPublished)failures.push('dist-web/admin.html drifted from canonical admin.html; post-copy Admin mutation occurred');
for(const [label,source] of [['Admin route registry',registry],['Admin information architecture',ia],['Admin onboarding workflow',onboarding],['Admin company context',context],['Admin shell runtime',shellJs]]){
  try{new Function(source)}catch(error){failures.push(`${label} has JavaScript syntax error: ${error instanceof Error?error.message:String(error)}`)}
}

requireMarkers(adminSource,[
  'id="topModuleNav"','id="sideModuleNav"',
  '/assets/admin-navigation-registry.js?v=20260825-admin-ia-1',
  '/assets/admin-information-architecture.js?v=20260825-admin-ia-1',
  '/assets/admin-onboarding-workflow.js?v=20260825-admin-ia-1',
  '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
  'admin-railway.js?v=20260804-admin-clean-4',
],'Canonical admin.html');
const ordered=[
  '/assets/admin-navigation-registry.js?v=20260825-admin-ia-1',
  '/assets/admin-information-architecture.js?v=20260825-admin-ia-1',
  '/assets/admin-onboarding-workflow.js?v=20260825-admin-ia-1',
  '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
  'admin-railway.js?v=20260804-admin-clean-4',
];
let previous=-1;
for(const marker of ordered){const index=adminSource.indexOf(marker);if(index<previous)failures.push(`Canonical Admin script order is invalid at ${marker}`);previous=index;}

requireMarkers(registry,[
  '"version": "2.0.0"','"id": "company-management"','"id": "people-hr"','"id": "clients-spire"',
  '"id": "service-operations"','"id": "billing-revenue"','"id": "compliance-quality"',
  '"id": "communications-learning"','"id": "system-administration"',
  '"id": "admin-users"','"id": "role-workspaces"','"id": "ohio-screening"','"id": "evv-operations"',
  'legacyNavigation','enterpriseApps','onboardingLifecycle',
],'Canonical Admin registry');
requireMarkers(ia,['admin-ia-v2','admin-tool-search','admin-nav-folder','moveServiceRequests','data-company-module','window.SulandraAdminIA','if (document.body) bind()'],'Admin information architecture');
requireMarkers(onboarding,['Hiring & Onboarding Overview','Review and screening','Activation and orientation','window.SulandraOnboardingLifecycle',"querySelector?.('.status-pill')",'if (document.body) bind()'],'Admin onboarding workflow');
requireMarkers(context,[
  'const REGISTRY = window.SulandraAdminRouteRegistry','const NAVIGATION = REGISTRY.legacyNavigation',
  'data-company-module','renderRightDrawer','window.SulandraAdminNavigation',
  "'/assets/admin-shell.js?v=20260810-canonical-admin-1'",
  "'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'",
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'",
  "'/assets/admin-achieved-archive-fix.js?v=20260808-achieved-archive-1'",
  "'/assets/admin-client-service-requests.js?v=20260809-company-intake-3'",'loadEmployeeSuite',
],'Canonical Admin bootstrap');
forbid(context,['const NAVIGATION = Object.freeze({','installWorkspaceLinks()','const topLink =','admin-platform-routing.js'],'Canonical Admin bootstrap');

requireMarkers(shellCss,['html,body{width:100%!important','max-width:none!important','.sulandra-platform-bar','@keyframes sulandraNewsTicker','@keyframes sulandraLiveBlink'],'Canonical Admin shell CSS');
requireMarkers(shellJs,['NEWS_REFRESH_MS = 10 * 60 * 1000','ensureCanonicalSso()','ensureModuleHosts()',"employee.id = 'module-employees'",'ensurePlatformBar()','weather-mini-clock'] ,'Canonical Admin shell runtime');

forbid(buildScript,['restore-modern-admin-portal.mjs','finalize-admin-fullscreen-layout.mjs','install-employee-management-frontend.mjs','fix-admin-company-settings-backend.mjs'],'Static build');
requireMarkers(buildScript,["await import('./verify-admin-canonical-source.mjs')","await import('./verify-admin-information-architecture.mjs')","'assets/admin-navigation-registry.js'","'assets/admin-information-architecture.js'","'assets/admin-onboarding-workflow.js'",'Admin is deliberately not rewritten after publication'],'Static build');
forbid(packageJson,['scripts/fix-admin-time-attendance-link.mjs','scripts/restore-modern-admin-portal.mjs','scripts/install-employee-management-frontend.mjs','scripts/finalize-admin-fullscreen-layout.mjs'],'package.json build pipeline');

if(serviceRequestPublisher.includes("path.join(dist,'admin.html')"))failures.push('Client Service Request publisher still mutates dist-web/admin.html');
if(!serviceRequestPublisher.includes('Admin service-request integration is canonical'))failures.push('Client Service Request publisher does not document canonical Admin ownership');
if(ssoPublisher.includes("'admin.html'"))failures.push('Global SSO HTML publisher still rewrites Admin');
requireMarkers(ssoPublisher,['Admin owns SSO from assets/admin-shell.js'],'SSO publisher');
requireMarkers(platformFinalizer,["if (path.basename(file).toLowerCase() === 'admin.html') continue",'canonical Admin navigation is protected'],'Global platform navigation publisher');

for(const relative of [
  'assets/admin-shell.css','assets/admin-shell.js','assets/admin-navigation-registry.js','assets/admin-information-architecture.js',
  'assets/admin-onboarding-workflow.js','assets/admin-company-context.js','assets/sulandra-sso-session.js',
]){
  try{await stat(path.join(dist,relative))}catch{failures.push(`Canonical Admin publication missing ${relative}`)}
}

if(failures.length){console.error('Canonical Admin source verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Canonical Admin source verified: one route registry owns eight folders, global actions, company visibility, Enterprise Apps and the ordered Hiring & Onboarding lifecycle; build publishers cannot rewrite Admin.');
