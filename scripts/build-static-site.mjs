import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'dist-web');
const railwayApiBase = 'https://sulandra-website-production-5fc4.up.railway.app';
const spireMarAsset = '/assets/spire-mar-timeline.js?v=20260814-chart-photo-db-2';
const spireMarStyle = '/assets/spire-mar-epic-v5.css?v=20260814-chart-photo-db-2';
const spireProfileAsset = '/assets/spire-chart-profile-images.js?v=20260814-chart-photo-db-2';

await import('./install-spire-idempotent-shell.mjs');
await import('./fix-spire-master-defects.mjs');
await import('./install-spire-darkroom-summary-notes-repair-v7.mjs');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const publicExtensions = new Set([
  '.css', '.html', '.ico', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg',
  '.txt', '.webmanifest', '.xml', '.pdf',
]);
const publicRootFiles = new Set(['CNAME', 'education-catalog.json']);
const publicDirectories = ['assets', 'public', 'courses', 'education', 'services', 'spire'];

for (const entry of await readdir(repositoryRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const extension = path.extname(entry.name).toLowerCase();
  if (!publicRootFiles.has(entry.name) && !publicExtensions.has(extension)) continue;
  await cp(path.join(repositoryRoot, entry.name), path.join(outputDirectory, entry.name));
}
for (const directory of publicDirectories) {
  try { await cp(path.join(repositoryRoot, directory), path.join(outputDirectory, directory), { recursive: true }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const resultsWorkspacePath = path.join(outputDirectory, 'assets', 'spire-results-workspace.js');
try {
  let source = await readFile(resultsWorkspacePath, 'utf8');
  if (!source.includes('SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT')) {
    const anchor = 'order.forEach(k=>bar.appendChild(byKey.get(k)));buttons.forEach';
    const replacement = "/* SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT */const currentOrder=buttons.map(b=>b.dataset.chartTab);if(currentOrder.length!==order.length||currentOrder.some((key,index)=>key!==order[index]))order.forEach(k=>bar.appendChild(byKey.get(k)));buttons.forEach";
    if (!source.includes(anchor)) throw new Error('SPIRE Results tab-layout mutation anchor changed');
    source = source.replace(anchor, replacement);
  }
  if (!source.includes('SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT')) throw new Error('SPIRE Results workspace idempotent tab-layout patch is missing');
  await writeFile(resultsWorkspacePath, source, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const loginPath = path.join(outputDirectory, 'employee-login.html');
try {
  let loginHtml = await readFile(loginPath, 'utf8');
  loginHtml = loginHtml.replace('<form id="form" autocomplete="on">','<form id="form" autocomplete="on" method="post" action="https://sulandra-website-production-5fc4.up.railway.app/api/auth/login">');
  await writeFile(loginPath, loginHtml, 'utf8');
  const loginRuntimeCandidates=[path.join(outputDirectory,'assets','employee-login-railway.js'),path.join(outputDirectory,'employee-login-railway.js')];
  let loginRuntime='';
  for (const candidate of loginRuntimeCandidates) { try { loginRuntime=await readFile(candidate,'utf8'); if(loginRuntime) break; } catch {} }
  if (!loginRuntime.includes('event.preventDefault()') || !loginRuntime.includes('/api/auth/login')) throw new Error('Employee login runtime is incomplete in dist-web');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const spirePath=path.join(outputDirectory,'spire.html');
const spireStationPath=path.join(outputDirectory,'spire','client-station.html');
const spireMasterPath=path.join(outputDirectory,'spire','master.html');
const publishedSpireEntry=await readFile(spirePath,'utf8');
const publishedSpireStation=await readFile(spireStationPath,'utf8');
const publishedSpireMaster=await readFile(spireMasterPath,'utf8');
for (const marker of ['SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2','/spire/client-station.html','window.location.search','window.location.hash']) if(!publishedSpireEntry.includes(marker)) throw new Error(`Static publication regression: SPIRE canonical Client Station entry missing ${marker}`);
for (const forbidden of ['/spire/portal.html','/spire/master.html']) if(publishedSpireEntry.includes(forbidden)) throw new Error(`Static publication regression: SPIRE root entry still targets ${forbidden}`);
for (const legacyAsset of ['spire-app-v2.js','spire-canonical-bootstrap.js','spire-shell-resilience.js','spire-chart-ready.js','spire-deep-link.js','spire-home-care-redesign-loader.js','spire-clinical-workstation.css','spire-flowsheet-workspace-launcher.js']) if(publishedSpireEntry.includes(legacyAsset)) throw new Error(`Static publication regression: SPIRE canonical entry still loads legacy runtime ${legacyAsset}`);
for (const marker of ['SPIRE_CLIENT_STATION_LISTS_V2','Client Station','Client Lists','Available Homes','/assets/spire-client-station.js?v=20260813-client-station-2','/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1']) if(!publishedSpireStation.includes(marker)) throw new Error(`Static publication regression: Client Station missing ${marker}`);
for (const marker of ['<html','<head','<body','</html>',"window.SULANDRA_API_BASE='https://sulandra-website-production-5fc4.up.railway.app'",'/assets/sulandra-entity-context.js','SPIRE_MASTER_DEFECT_FIXES_V1','SPIRE_DARKROOM_SUMMARY_NOTES_REPAIR_V7',spireMarAsset,spireMarStyle,spireProfileAsset]) if(!publishedSpireMaster.includes(marker)) throw new Error(`Static publication regression: standalone SPIRE chart missing ${marker}`);

const flowsheetPath=path.join(outputDirectory,'spire','flowsheets.html');
try {
  let html=await readFile(flowsheetPath,'utf8');
  html=html.replace(/\s*<link rel="\/assets\/spire-flowsheet-master\.css(?:\?v=[^"']+)?">\s*/g,'').replace(/\s*<script src="\/assets\/spire-flowsheet-master\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'').replace('</head>','<link rel="stylesheet" href="/assets/spire-flowsheet-master.css?v=20260812-spire-flowsheet-master-1"></head>').replace('</body>','<script src="/assets/spire-flowsheet-master.js?v=20260812-spire-flowsheet-master-1"></script></body>');
  await writeFile(flowsheetPath,html,'utf8');
} catch(error){ if(error?.code!=='ENOENT') throw error; }

const educationPath=path.join(outputDirectory,'education-portal.html');
try { let html=await readFile(educationPath,'utf8'); html=html.replace("const API='',TK='sulandra:employee:access-token',SK='sulandra:employee:session';",`const API='${railwayApiBase}',TK='sulandra:employee:access-token',SK='sulandra:employee:session';`).replace(/<img src="\/favicon-48x48\.png" alt="Sulandra Health Logo">/g,'<img src="/assets/mainlogo.png" alt="Sulandra Health Logo">').replace(/href="\/intranet\.HTML"/g,'href="/intranet.html"'); await writeFile(educationPath,html,'utf8'); } catch(error){ if(error?.code!=='ENOENT') throw error; }
const educationEnhancementsPath=path.join(outputDirectory,'assets','education-portal-enhancements.js');
try { let html=await readFile(educationEnhancementsPath,'utf8'); html=html.replace("const API='',TK='sulandra:employee:access-token';",`const API='${railwayApiBase}',TK='sulandra:employee:access-token';`); await writeFile(educationEnhancementsPath,html,'utf8'); } catch(error){ if(error?.code!=='ENOENT') throw error; }
const timeAttendancePath=path.join(outputDirectory,'time-attendance.html');
try { let html=await readFile(timeAttendancePath,'utf8'); html=html.replace(/const API_BASE\s*=\s*['"][^'"]*['"]/g,`const API_BASE='${railwayApiBase}'`); await writeFile(timeAttendancePath,html,'utf8'); } catch(error){ if(error?.code!=='ENOENT') throw error; }

await import('./install-employee-self-service-frontend.mjs');
await rm(path.join(outputDirectory,'time-attendance.txt'),{force:true});

// Canonical Admin ownership invariant: Admin is deliberately not rewritten after publication.
const publishedAdminPath=path.join(outputDirectory,'admin.html');
const publishedAdmin=await readFile(publishedAdminPath,'utf8');
for (const marker of ['/assets/admin-company-context.js?v=20260809-admin-company-context-2','careers-admin-workflow.js?v=20260809-hiring-provisioning-2','admin-railway.js?v=20260804-admin-clean-4']) if(!publishedAdmin.includes(marker)) throw new Error(`Canonical Admin publication failed; missing ${marker}`);

const requiredPublishedFiles=[
  'admin.html','admin-operations.html','admin-railway.js','enterprise-apps.html','employee-login.html','employee-portal.html','employee-portal-railway.js','my-work.html','notifications.html','careers.html','applygeneral.html','applydsp.html','applylpn.html','applydoo.html','employee360.html','education-portal.html','time-attendance.html','scheduling.html','intranet.html','course-player.html','education-certificate.html','education-catalog.json','intranet.HTML','policies.html','news.html','feedback.html','payroll.html','benefits.html','employee-directory.html','leadership.html','support.html','health-safety.html','careers-admin-workflow.js','interview-admin-scheduler.js','favicon-48x48.png','assets/mainlogo.png','assets/admin-shell.css','assets/admin-shell.js','assets/admin-live-dashboard.js','assets/admin-enterprise-apps-launcher.js','assets/admin-company-settings.js','assets/admin-analog-clock.js','assets/admin-service-home-management-v2.js','assets/admin-dashboard-cleanup.js','assets/admin-achieved-archive-fix.js','assets/admin-client-service-requests.js','assets/admin-company-context.js','assets/admin-owner-context.js','assets/admin-owner-console.js','assets/admin-operations-shell.js','assets/admin-operations-context.js','assets/admin-operations-desktop.js','assets/sulandra-entity-context.js','assets/employee-work-crosslinks.js','assets/education-runtime.js','assets/education-course.css','assets/education-portal-enhancements.js','assets/spire-client-station.js','assets/spire-secure-chat.js','assets/spire-user-preferences.js','assets/spire-master-navigation.js','assets/spire-master-flowsheet-grid.js','assets/spire-flowsheet-frozen-pane.js','assets/spire-screen-controls.css','assets/spire-screen-controls.js','assets/spire-medication-order-entry.js','assets/spire-mar-timeline.js','assets/spire-mar-epic-v5.css','assets/spire-chart-profile-images.js','assets/spire-results-workspace.js','assets/spire-chart-review-v2.js','assets/spire-clinical-workstation.css','assets/spire-flowsheet-workspace-launcher.js','assets/spire-user-template-integration.css','assets/spire-user-template-integration.js','assets/spire-user-template-layout-fix.css','assets/spire-user-template-final-lock.css','assets/spire-flowsheet-master.css','assets/spire-flowsheet-master.js','assets/spire-darkroom-summary-notes-repair-v7.js','spire.html','spire/client-station.html','spire/patient-station.html','spire/secure-chat.html','spire/master.html','spire/flowsheets.html','spire-admin.html','services'
];
for (const relative of requiredPublishedFiles) { try { await stat(path.join(outputDirectory,relative)); } catch { throw new Error(`Static publication regression: missing ${relative}`); } }

const publishedSpirePreferences=await readFile(path.join(outputDirectory,'assets','spire-user-preferences.js'),'utf8');
for (const marker of ['SPIRE_USER_WORKSPACE_PREFERENCES_V2','21. Full-Screen Workspace','spire:accessibility:fullscreen','spire:accessibility:preset','requestFullscreen']) if(!publishedSpirePreferences.includes(marker)) throw new Error(`Static publication regression: shared SPIRE preference runtime missing ${marker}`);
const publishedSpireScreenControls=await readFile(path.join(outputDirectory,'assets','spire-screen-controls.js'),'utf8');
for (const marker of ['SPIRE_SCREEN_CONTROLS_LIVE_V2','/api/spire/inbasket-v2?status=OPEN','/spire/secure-chat.html','Secure Chat','Alerts & Reminders']) if(!publishedSpireScreenControls.includes(marker)) throw new Error(`Static publication regression: live SPIRE chart controls missing ${marker}`);
for (const forbidden of ['Opening Staff Messaging Portal','Notifications: 3 unread reminders for current client.']) if(publishedSpireScreenControls.includes(forbidden)) throw new Error(`Static publication regression: live SPIRE chart controls contain fake behavior ${forbidden}`);
const publishedMarTimeline=await readFile(path.join(outputDirectory,'assets','spire-mar-timeline.js'),'utf8');
for (const marker of ['SPIRE_MAR_TIMELINE_V3','Go to Now','Medication / Order','Completed / Inactive Medications']) if(!publishedMarTimeline.includes(marker)) throw new Error(`Static publication regression: SPIRE MAR timeline missing ${marker}`);
const publishedSpireProfileImages=await readFile(path.join(outputDirectory,'assets','spire-chart-profile-images.js'),'utf8');
for (const marker of ['SPIRE_CHART_PROFILE_IMAGES_V2','SPIRE_CHART_PROFILE_IMAGES_V4','SPIRE_SAVED_CLIENT_PHOTO_WINS_V1','patient-scoped chart database records','/profile-images','providerName']) if(!publishedSpireProfileImages.includes(marker)) throw new Error(`Static publication regression: SPIRE chart profile images missing ${marker}`);
const publishedResultsWorkspace=await readFile(path.join(outputDirectory,'assets','spire-results-workspace.js'),'utf8');
if(!publishedResultsWorkspace.includes('SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT')) throw new Error('Static publication regression: SPIRE Results workspace can recreate the chart-tab MutationObserver loop');
const publishedFlowsheetHtml=await readFile(flowsheetPath,'utf8');
if(!publishedFlowsheetHtml.includes('/assets/spire-flowsheet-master.css?v=20260812-spire-flowsheet-master-1')||!publishedFlowsheetHtml.includes('/assets/spire-flowsheet-master.js?v=20260812-spire-flowsheet-master-1')) throw new Error('Static publication regression: uploaded master-template flowsheet presentation/navigation is missing');

await import('./verify-enterprise-apps-launchpad.mjs');
await import('./verify-admin-company-settings-backend.mjs');
await import('./verify-admin-canonical-source.mjs');
console.log('Static website published from canonical source files; /spire.html launches Client Station, /spire/master.html remains the explicit client chart, and SPIRE medication order entry/MAR timeline are published and verified.');