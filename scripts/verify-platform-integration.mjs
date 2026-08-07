import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

const requiredFiles = [
  'index.html','services.html','resources.html','service-request.html','intranet.html','employee-login.html','employee-portal.html','admin.html','employee360.html','spire.html',
  'education-portal.html','time-attendance.html','policies.html','news.html','feedback.html','payroll.html',
  'benefits.html','employee-directory.html','leadership.html','support.html','health-safety.html','intranet-control.html','services/community-living/index.html',
  'services/home-health/index.html','services/transportation/index.html','services/respite-care/index.html','services/rehab/index.html','services/behavioral-health/index.html','services/companion-care/index.html',
  'assets/intranet-live-integration.js','assets/intranet-content-app.js','assets/intranet-control-app.js','assets/employee-portal-deep-integration.js',
  'assets/policies-app.js','assets/news-app.js','assets/feedback-app.js','assets/payroll-app.js','assets/benefits-app.js','assets/employee-directory-app.js','assets/support-app.js','assets/health-safety-app.js',
  'assets/client-service-request-app.js','assets/admin-client-service-requests.js','assets/public-consultation-service-request-bridge.js','assets/public-services-navigation.js','assets/sulandra-sso-session.js'
];
const cleanRoutes = ['policies','documents','news','feedback','payroll','benefits','employee-directory','leadership','support','it-request','time-attendance','scheduling','incident-reporting','health-safety','service-request','resources'];
const forbiddenBackendHtml = /href=["']https:\/\/sulandra-website-production-5fc4\.up\.railway\.app\/(?!api\/|public\/)/i;
const knownDeadRoutes = ['/policies','/documents','/news','/feedback','/payroll','/benefits','/employee-directory','/leadership','/support','/it-request','/scheduling','/time-attendance','/incident-reporting','/health-safety','/caregiver-resources','/about','/services/community-living','/services/waiver'];
const ssoPages=['admin.html','employee-portal.html','employee360.html','intranet.html','education-portal.html','time-attendance.html','policies.html','payroll.html','benefits.html','support.html','spire.html'];

const failures = [];
for (const relative of requiredFiles) {
  try { await stat(path.join(dist, relative)); } catch { failures.push(`Missing published file: ${relative}`); }
}
for (const route of cleanRoutes) {
  try { await stat(path.join(dist, route, 'index.html')); } catch { failures.push(`Missing clean-route fallback: /${route}`); }
}

async function walk(directory) {
  const files=[];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const target=path.join(directory,entry.name);
    if(entry.isDirectory()) files.push(...await walk(target));
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.html')) files.push(target);
  }
  return files;
}
for (const file of await walk(dist)) {
  const html=await readFile(file,'utf8');
  const rel=path.relative(dist,file);
  if(forbiddenBackendHtml.test(html)) failures.push(`${rel} links to the backend service as an HTML destination`);
  for (const route of knownDeadRoutes) {
    const escaped=route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`href=(['"])${escaped}\\1`).test(html)) failures.push(`${rel} still contains unresolved route ${route}`);
  }
}
for(const relative of ssoPages){
  try{const html=await readFile(path.join(dist,relative),'utf8');if(!html.includes('/assets/sulandra-sso-session.js'))failures.push(`${relative} does not load the shared SSO session cache`)}catch{}
}

try {
  const employeePortal=await readFile(path.join(dist,'employee-portal.html'),'utf8');
  if(!employeePortal.includes('/assets/employee-portal-deep-integration.js')) failures.push('Employee Portal does not load the live-module integration bridge');
} catch {}
try {
  const spire=await readFile(path.join(dist,'spire.html'),'utf8');
  for(const marker of ['/time-attendance.html','/employee360.html','/education-portal.html','/health-safety.html']) if(!spire.includes(marker)) failures.push(`Spire hub is missing live module destination ${marker}`);
} catch {}
try {
  const index=await readFile(path.join(dist,'index.html'),'utf8');
  if(!index.includes('/assets/public-consultation-service-request-bridge.js')) failures.push('Public homepage consultation is not connected to Client Service Requests');
} catch {}
try {
  const services=await readFile(path.join(dist,'services.html'),'utf8');
  if(!services.includes('/assets/public-services-navigation.js')) failures.push('Services page does not load live public navigation');
  for(const label of ['Free Consultation','Careers','Contact']) if(new RegExp(`<a href="#"[^>]*>${label}<\\/a>`).test(services)) failures.push(`Services page still has placeholder link: ${label}`);
} catch {}

if (failures.length) {
  console.error('Platform integration verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Platform integration verified: single sign-on, public services and intake, Spire hub, live Employee Portal routes, clean routes, static navigation, and frontend/backend ownership are coherent.');
