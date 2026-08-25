import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';

await import('./install-sulandra-sso-session.mjs');

const routeMap = new Map([
  ['/policies','/policies.html'],['/documents','/policies.html'],['/news','/news.html'],['/feedback','/feedback.html'],
  ['/payroll','/payroll.html'],['/benefits','/benefits.html'],['/employee-directory','/employee-directory.html'],['/leadership','/leadership.html'],
  ['/contact','/employee-directory.html'],['/support','/support.html'],['/it-request','/support.html'],['/time-attendance','/time-attendance.html'],
  ['/scheduling','/scheduling.html'],['/my-work','/my-work.html'],['/notifications','/notifications.html'],['/incident-reporting','/health-safety.html'],
  ['/health-safety','/health-safety.html'],['/caregiver-resources','/education-portal.html'],['/about','/index.html#about'],
  ['/services/community-living','/services/community-living/index.html'],['/services/waiver','/services/community-living/index.html#services'],['/logout','/employee-login.html'],
]);
const cleanRoutePages = new Map([
  ['policies','policies.html'],['documents','policies.html'],['news','news.html'],['feedback','feedback.html'],['payroll','payroll.html'],
  ['benefits','benefits.html'],['employee-directory','employee-directory.html'],['leadership','leadership.html'],['support','support.html'],
  ['it-request','support.html'],['time-attendance','time-attendance.html'],['scheduling','scheduling.html'],['my-work','my-work.html'],
  ['notifications','notifications.html'],['incident-reporting','health-safety.html'],['health-safety','health-safety.html'],
  ['admin-profile','admin-profile.html'],
]);

async function walk(directory) {
  const files=[];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const target=path.join(directory,entry.name);
    if(entry.isDirectory()) files.push(...await walk(target));
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.html')) files.push(target);
  }
  return files;
}
function replaceExactHref(html, from, to) {
  const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return html.replace(new RegExp(`href=(['"])${escaped}\\1`,'g'),`href="${to}"`);
}

async function installOwnerProfileCanonicalNavigation() {
  const registrySource=await readFile(path.join(root,'assets','admin-navigation-registry.js'),'utf8');
  if(!registrySource.includes('"id": "admin-profile"')||!registrySource.includes('"href": "/admin-profile.html"')) {
    throw new Error('Canonical Admin registry is missing the owner profile entry');
  }
  const targets=[path.join(root,'assets','admin-company-context.js'),path.join(dist,'assets','admin-company-context.js')];
  const marker="      {key:'settings',label:'Settings',sub:'Company Settings',kind:'module'},";
  const profile="      {key:'my-profile',label:'My Profile',sub:'Owner & DON',kind:'route',href:'/admin-profile.html'},";
  for(const target of targets){
    try{
      let source=await readFile(target,'utf8');
      const registryOwned=source.includes('const REGISTRY = window.SulandraAdminRouteRegistry');
      if(!registryOwned&&!source.includes("href:'/admin-profile.html'")) {
        if(!source.includes(marker)) throw new Error(`Canonical Admin settings marker missing in ${path.relative(root,target)}`);
        source=source.replace(marker,`${profile}\n${marker}`);
      }
      source=source
        .replace('/assets/sulandra-enterprise-owner.js?v=20260808-admin-profile-owner-v1','/assets/sulandra-enterprise-owner.js?v=20260814-admin-profile-owner-v3')
        .replace('/assets/sulandra-enterprise-owner.js?v=20260814-admin-profile-owner-v2','/assets/sulandra-enterprise-owner.js?v=20260814-admin-profile-owner-v3');
      await writeFile(target,source,'utf8');
    }catch(error){if(error?.code!=='ENOENT')throw error}
  }
}

async function publishOwnerProfile() {
  const source=path.join(root,'admin-profile.html');
  const published=path.join(dist,'admin-profile.html');
  await cp(source,published);
  const html=await readFile(published,'utf8');
  for(const marker of ['My Executive Profile | Sulandra Health',"api('/api/owner/profile')",'sulandra:employee:access-token']) {
    if(!html.includes(marker)) throw new Error(`Owner profile publication missing ${marker}`);
  }
}

await installOwnerProfileCanonicalNavigation();
await publishOwnerProfile();

for (const file of await walk(dist)) {
  // Admin owns navigation in assets/admin-company-context.js. Generic route
  // normalization must never rewrite the canonical Admin publication.
  if (path.basename(file).toLowerCase() === 'admin.html') continue;
  let html=await readFile(file,'utf8');
  const original=html;
  for(const [from,to] of routeMap) html=replaceExactHref(html,from,to);
  if(html!==original) await writeFile(file,html,'utf8');
}

for(const [route,source] of cleanRoutePages){
  const sourcePath=path.join(dist,source);
  try{await stat(sourcePath)}catch{continue}
  const routeDir=path.join(dist,route);await mkdir(routeDir,{recursive:true});await cp(sourcePath,path.join(routeDir,'index.html'));
}

const servicesPath=path.join(dist,'services.html');
try{
  let html=await readFile(servicesPath,'utf8');
  const links=new Map([['Reviews','/reviews.html'],['Resources','/resources.html'],['Free Consultation','/consultation.html'],['About Us','/about.html'],['Careers','/careers.html'],['Contact','/contact.html'],['View All Services','/services.html']]);
  for(const [label,target] of links){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');html=html.replace(new RegExp(`<a href="#"([^>]*)>${escaped}<\\/a>`,'g'),`<a href="${target}"$1>${label}</a>`)}
  await writeFile(servicesPath,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error}

const timePath=path.join(dist,'time-attendance.html');
try{
  let html=await readFile(timePath,'utf8');
  const oldApi="const API=(localStorage.getItem('sulandra_api_url')||window.SULANDRA_API_URL||'').replace(/\\/$/,'');";
  const oldToken="const token=localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";
  if(html.includes(oldApi))html=html.replace(oldApi,`const API='${canonicalApi}';`);
  if(html.includes(oldToken))html=html.replace(oldToken,"const token=sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';");
  html=html.replace(/\s*<script src="\/assets\/time-attendance-route-restore\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n').replace('</body>','  <script src="/assets/time-attendance-route-restore.js?v=20260808-platform-restore-1"></script>\n</body>');
  if(!html.includes(canonicalApi))throw new Error('Time & Attendance is not connected to the canonical Railway API');
  await writeFile(timePath,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error}

const employee360Path=path.join(dist,'employee360.html');
try{
  let html=await readFile(employee360Path,'utf8');
  html=html.replace(/\s*<script src="\/assets\/employee360-hash-routing\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n').replace('</body>','  <script src="/assets/employee360-hash-routing.js?v=20260808-platform-restore-1"></script>\n</body>');
  await writeFile(employee360Path,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error}

await import('./finalize-spire-client-station-publication.mjs');
// verify-platform-integration historically expected /spire.html -> /spire/master.html.
// Normalize only that obsolete section after the canonical SPIRE publication so
// the broad platform verifier checks the current login/Client Station contract.
await import('./fix-platform-integration-spire-contract.mjs');
// Publish the approved standalone chart as the direct target of authorized SPIRE launchers.
// /spire.html remains the authenticated Client Station entry, while the launch buttons can
// open /spire/master.html directly because the master itself still enforces session auth.
await import('./publish-spire-standalone-launch.mjs');
// Add the role/template chooser only after the canonical master and standalone launch
// publication are finished, so later publication passes cannot remove the selector.
await import('./install-spire-flowsheet-role-selector.mjs');
// Publish responsive activity tabs last so screen-width overflow and the More menu
// cannot be removed by an earlier SPIRE publication pass.
await import('./install-spire-adaptive-chart-tabs.mjs');
// Company Chronicles owns white-label branding across all published non-Admin HTML and
// is loaded inside Admin by the canonical shell rather than by direct HTML injection.
await import('./install-company-chronicles-publication.mjs');
// Sulandra 1.1 Admin uses the left menu for core folders, the top bar for global operations,
// and the right drawer for day-to-day dispatch, EVV and intake actions.
await import('./install-admin-global-ui-restructure.mjs');
await import('./verify-employee-work-center.mjs');

const finalOwnerProfile=await readFile(path.join(dist,'admin-profile.html'),'utf8');
if(!finalOwnerProfile.includes("api('/api/owner/profile')")) throw new Error('Final static owner profile lost its live API wiring');
await stat(path.join(dist,'admin-profile','index.html'));

console.log('Static platform navigation normalized for non-Admin surfaces; canonical Admin navigation is protected, the owner profile is explicitly published at /admin-profile.html and /admin-profile/, the SPIRE role flowsheet selector and adaptive chart-tab More menu are published after the standalone chart, and authorized SPIRE launchers publish the standalone live master chart directly.');
