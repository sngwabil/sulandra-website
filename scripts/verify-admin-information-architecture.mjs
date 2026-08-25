import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing source: ${relative}`);return''}};
const readDist=async relative=>{try{return await readFile(path.join(dist,relative),'utf8')}catch{failures.push(`Missing published file: ${relative}`);return''}};
const exists=async relative=>{try{await stat(path.join(root,relative));return true}catch{return false}};
const existsDist=async relative=>{try{await stat(path.join(dist,relative));return true}catch{return false}};

const [registrySource,inventorySource,adminSource,iaSource,onboardingSource,contextSource,appsSource,launcherSource,adminDist,registryDist,iaDist,onboardingDist]=await Promise.all([
  read('assets/admin-navigation-registry.js'),
  read('config/admin-route-inventory.json'),
  read('admin.html'),
  read('assets/admin-information-architecture.js'),
  read('assets/admin-onboarding-workflow.js'),
  read('assets/admin-company-context.js'),
  read('enterprise-apps.html'),
  read('assets/admin-enterprise-apps-launcher.js'),
  readDist('admin.html'),
  readDist('assets/admin-navigation-registry.js'),
  readDist('assets/admin-information-architecture.js'),
  readDist('assets/admin-onboarding-workflow.js'),
]);

for(const [label,source] of [['registry',registrySource],['information architecture',iaSource],['onboarding workflow',onboardingSource]]){
  try{new Function(source)}catch(error){failures.push(`Admin ${label} syntax error: ${error instanceof Error?error.message:String(error)}`)}
}

let registry={};
try{
  const sandbox={window:{},document:{documentElement:{dataset:{}}},console};
  vm.runInNewContext(registrySource,sandbox,{filename:'admin-navigation-registry.js'});
  registry=sandbox.window.SulandraAdminRouteRegistry||{};
}catch(error){failures.push(`Unable to evaluate Admin registry: ${error instanceof Error?error.message:String(error)}`)}

let inventory={routes:[]};
try{inventory=JSON.parse(inventorySource)}catch(error){failures.push(`Invalid Admin route inventory JSON: ${error instanceof Error?error.message:String(error)}`)}

assert.equal(registry.version,'2.0.0','Admin route registry version must be 2.0.0');
assert.deepEqual(Array.from(registry.folders||[],folder=>folder.id),[
  'company-management','people-hr','clients-spire','service-operations',
  'billing-revenue','compliance-quality','communications-learning','system-administration',
],'Admin folder order changed');
assert.deepEqual(Array.from(registry.onboardingLifecycle||[],stage=>stage.id),[
  'overview','openings','applications','screening','interviews','offers','prehire','activation','archive',
],'Hiring and Onboarding lifecycle order changed');

const items=Array.from(registry.allItems||[]);
const ids=items.map(item=>item.id);
const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
if(duplicateIds.length)failures.push(`Duplicate Admin registry IDs: ${duplicateIds.join(', ')}`);
if(items.length<50)failures.push(`Admin registry unexpectedly exposes only ${items.length} tools`);
if(items.some(item=>!item.href||!item.label||!item.folderId))failures.push('Every Admin registry item must have href, label and folderId');
const validCompanies=new Set(['SCLS','HOME_HEALTH','NMT']);
for(const item of items)for(const code of item.companyCodes||[])if(!validCompanies.has(code))failures.push(`Invalid company scope ${code} on ${item.id}`);

const forbiddenAdminTargets=[
  '/applicant-portal.html','/offer-acceptance.html','/patient-portal.html','/employee-login.html',
  '/home-health-referral-secure.html','/nmt-referral-secure.html',
];
for(const target of forbiddenAdminTargets)if(items.some(item=>item.href===target))failures.push(`Public/contextual route exposed globally in Admin: ${target}`);

for(const required of [
  'admin-users','role-workspaces','ohio-screening','dodd-billing','claim-exchange','evv-operations',
  'admission-history','incident-compliance','hh-soc','hh-visits','hh-sources','nmt-facilities','nmt-invitations',
]){
  if(!ids.includes(required))failures.push(`Previously buried Admin tool is still missing: ${required}`);
}
const serviceRequests=items.find(item=>item.id==='service-requests');
if(serviceRequests?.module!=='service-requests')failures.push('Service Requests is not a standalone Admin module');
if((registry.onboardingLifecycle||[]).some(stage=>stage.id==='service-requests'))failures.push('Service Requests remains inside Hiring and Onboarding');

const routeInventory=Array.isArray(inventory.routes)?inventory.routes:[];
const inventoryPaths=routeInventory.map(route=>route.path);
const duplicateInventory=[...new Set(inventoryPaths.filter((entry,index)=>inventoryPaths.indexOf(entry)!==index))];
if(duplicateInventory.length)failures.push(`Duplicate route inventory entries: ${duplicateInventory.join(', ')}`);
if(routeInventory.length<100)failures.push(`Route inventory unexpectedly contains only ${routeInventory.length} routes`);

const partial=process.env.SULANDRA_ADMIN_IA_PARTIAL_CHECKOUT==='1';
if(!partial){
  const rootHtml=(await readdir(root,{withFileTypes:true})).filter(entry=>entry.isFile()&&/\.html$/i.test(entry.name)).map(entry=>entry.name).sort();
  const recorded=[...inventoryPaths].sort();
  const missing=rootHtml.filter(route=>!recorded.includes(route));
  const stale=recorded.filter(route=>!rootHtml.includes(route));
  if(missing.length)failures.push(`Root HTML routes missing from inventory: ${missing.join(', ')}`);
  if(stale.length)failures.push(`Inventory routes missing from repository root: ${stale.join(', ')}`);
  for(const item of items){
    const pathname=String(item.href).split(/[?#]/,1)[0].replace(/^\//,'');
    if(pathname&&pathname.endsWith('.html')&&!await exists(pathname))failures.push(`Admin registry target does not exist: ${item.id} -> /${pathname}`);
    if(pathname&&pathname.endsWith('.html')&&!await existsDist(pathname))failures.push(`Published Admin registry target does not exist: ${item.id} -> /${pathname}`);
  }
}

const scriptMarkers=[
  '/assets/admin-navigation-registry.js?v=20260825-admin-ia-1',
  '/assets/admin-information-architecture.js?v=20260825-admin-ia-1',
  '/assets/admin-onboarding-workflow.js?v=20260825-admin-ia-1',
  '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
  'admin-railway.js?v=20260804-admin-clean-4',
];
let previous=-1;
for(const marker of scriptMarkers){
  const index=adminSource.indexOf(marker);
  if(index<0)failures.push(`Canonical Admin is missing ${marker}`);
  if(index<previous)failures.push(`Canonical Admin script order is invalid at ${marker}`);
  previous=index;
}
for(const marker of ['admin-ia-v2','admin-tool-search','admin-nav-folder','moveServiceRequests','data-company-module','SPIRE remains the separate clinical record application','if (document.body) bind()']){
  if(!iaSource.includes(marker))failures.push(`Admin information architecture missing ${marker}`);
}
for(const marker of ['Hiring & Onboarding Overview','Review and screening','Activation and orientation','onboardingStageGuidance','employee-ohio-screening.html',"querySelector?.('.status-pill')",'if (document.body) bind()']){
  if(!onboardingSource.includes(marker))failures.push(`Onboarding workflow missing ${marker}`);
}
if(!contextSource.includes('const REGISTRY = window.SulandraAdminRouteRegistry'))failures.push('Admin company context does not consume the canonical registry');
if(contextSource.includes('const NAVIGATION = Object.freeze({'))failures.push('Admin company context still duplicates route definitions');
if(!appsSource.includes('window.SulandraAdminRouteRegistry?.enterpriseApps'))failures.push('Enterprise Apps does not consume the canonical registry');
if(appsSource.includes('const apps=['))failures.push('Enterprise Apps still hard-codes a duplicate application catalog');
if(!launcherSource.includes("window.SulandraAdminRouteRegistry?.version === '2.0.0'"))failures.push('Legacy Enterprise Apps injector is not gated behind Admin IA v2');
if(adminSource!==adminDist)failures.push('Published Admin HTML drifted from canonical source');
if(registrySource!==registryDist)failures.push('Published Admin route registry drifted from canonical source');
if(iaSource!==iaDist)failures.push('Published Admin information architecture drifted from canonical source');
if(onboardingSource!==onboardingDist)failures.push('Published Admin onboarding workflow drifted from canonical source');

if(failures.length){
  console.error('Admin information-architecture verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`Admin information architecture verified: ${registry.folders.length} ordered folders, ${items.length} registered tools, ${registry.onboardingLifecycle.length} onboarding stages, ${routeInventory.length} inventoried root routes, company-scoped visibility and no public/token routes exposed globally.`);
