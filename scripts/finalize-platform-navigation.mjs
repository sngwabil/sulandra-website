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
await import('./verify-employee-work-center.mjs');
console.log('Static platform navigation normalized for non-Admin surfaces; canonical Admin navigation is protected, SPIRE is finalized by one Client Station publication owner, and the broad platform verifier now checks the authenticated SPIRE workflow.');
