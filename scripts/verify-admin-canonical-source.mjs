import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];
const read = async (base, relative) => { try { return await readFile(path.join(base, relative), 'utf8'); } catch { failures.push(`Missing ${path.relative(root, base) || 'source'} file: ${relative}`); return ''; } };
const requireMarkers = (source, markers, label) => { for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing ${marker}`); };
const forbid = (source, markers, label) => { for (const marker of markers) if (source.includes(marker)) failures.push(`${label} still references ${marker}`); };

const [ownerSource,ownerPublished,operationsSource,operationsPublished,router,ownerContext,operationsContext,ownerConsole,operationsDesktop] = await Promise.all([
  read(root,'admin.html'),read(dist,'admin.html'),read(root,'admin-operations.html'),read(dist,'admin-operations.html'),
  read(root,'assets/admin-company-context.js'),read(root,'assets/admin-owner-context.js'),read(root,'assets/admin-operations-context.js'),
  read(root,'assets/admin-owner-console.js'),read(root,'assets/admin-operations-desktop.js'),
]);

if (ownerSource !== ownerPublished) failures.push('Owner admin.html drifted from canonical source');
if (operationsSource !== operationsPublished) failures.push('admin-operations.html drifted from canonical source');
for (const [label,source] of [['Admin context router',router],['Owner context',ownerContext],['Operations context',operationsContext],['Owner boundary',ownerConsole],['Operations desktop',operationsDesktop]]) {
  try { new Function(source); } catch (error) { failures.push(`${label} has JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

requireMarkers(ownerSource,['id="topModuleNav"','id="sideModuleNav"','/assets/admin-company-context.js?v=20260809-admin-company-context-2','admin-railway.js?v=20260804-admin-clean-4'],'Owner admin.html');
requireMarkers(operationsSource,['id="topModuleNav"','id="sideModuleNav"','/assets/admin-company-context.js?v=20260809-admin-company-context-2','admin-railway.js?v=20260804-admin-clean-4'],'Operations HTML');
requireMarkers(router,['admin-owner-context.js','admin-owner-console.js','admin-operations-context.js','admin-operations-desktop.js','/admin-operations\\.html$/i'],'Admin context router');

// The parent owner command center deliberately preserves the established
// command-center navigation and dashboard composition. Only its company
// selector is suppressed by the owner boundary runtime.
requireMarkers(ownerContext,['NAVIGATION = Object.freeze({','primary: Object.freeze([','admin-enterprise-apps-launcher.js','admin-live-dashboard.js'],'Owner command-center context');
requireMarkers(ownerConsole,['/api/owner/authority','ownerOperationsLauncher','/admin-operations.html','#adminCompanyContext','#adminCompanySelectorContainer'],'Owner command-center boundary');

requireMarkers(operationsContext,[
  'One authoritative Admin information-architecture registry.','topActions: Object.freeze([','folders: Object.freeze([',
  "label:'Company Management'","label:'People & HR'","label:'Clients & SPIRE'","label:'Service Operations'",
  "label:'Billing & Revenue'","label:'Compliance & Quality'","label:'Communications & Learning'","label:'System Administration'",
  'adminGlobalToolSearch',"key:'onboarding',label:'Hiring & Onboarding'","key:'admin-users',label:'Admin Users'",
  "href:'/employee-ohio-screening-workspace.html'","href:'/dodd-billing-rules.html'","href:'/revenue-claim-exchange.html'",
  "href:'/home-health-referral-inbox.html'","href:'/nmt-order-inbox.html'","href:'/spire-admission-history.html'","href:'/spire-incident-compliance.html'",
  'onboardingLifecycle:Object.freeze([',"key:'overview',label:'Overview'","key:'employee-activation',label:'Employee Activation'",
  "serviceModule.id = 'module-service-requests'",'installInformationArchitectureStyles()',
],'Operations navigation/bootstrap');
forbid(operationsContext,['admin-enterprise-apps-launcher.js','admin-navigation-overflow.js','NAVIGATION.primary','NAVIGATION.leftOnly','Platform Portals','Quick Operations'],'Operations navigation/bootstrap');
requireMarkers(operationsDesktop,['allowedOperatingEntities','hasActiveEmployment',"entity?.entityType === 'HOLDING'",'PARENT_CODES','Company Operations','data-open-ops-folder'],'Operations desktop boundary');

const folderStart = operationsContext.indexOf('folders: Object.freeze([');
const lifecycleStart = operationsContext.indexOf('onboardingLifecycle:Object.freeze([');
const registry = folderStart >= 0 && lifecycleStart > folderStart ? operationsContext.slice(folderStart,lifecycleStart) : '';
for (const workflowRoute of ['/careers.html','/applicant-portal.html','/offer-acceptance.html','/patient-portal.html','/service-request.html','/course-player.html','/employee-portal.html']) {
  if (registry.includes(workflowRoute)) failures.push(`Contextual workflow leaked into Operations folders: ${workflowRoute}`);
}
for (const href of [...new Set([...registry.matchAll(/href:'(\/[^']+)'/g)].map((match) => match[1]))]) {
  const pathname = href.split(/[?#]/,1)[0].replace(/^\//,'');
  if (!pathname?.endsWith('.html')) continue;
  try { await stat(path.join(root, pathname)); } catch { failures.push(`Operations registry route does not exist: ${href}`); }
}

for (const relative of [
  'admin.html','admin-operations.html','assets/admin-company-context.js','assets/admin-owner-context.js','assets/admin-operations-context.js',
  'assets/admin-owner-console.js','assets/admin-operations-desktop.js','assets/admin-shell.css','assets/admin-shell.js',
]) {
  try { await stat(path.join(dist, relative)); } catch { failures.push(`Admin publication missing ${relative}`); }
}

if (failures.length) { console.error('Canonical Admin split verification failed:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('Canonical Admin split verified: the existing Sulandra Health owner command center is preserved, Operations owns the eight-folder company administration desktop, and the parent company is excluded from the Operations selector boundary.');
