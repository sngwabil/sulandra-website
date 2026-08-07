import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

const requiredFiles = [
  'index.html','intranet.html','employee-login.html','employee-portal.html','admin.html','employee360.html',
  'education-portal.html','time-attendance.html','policies.html','news.html','feedback.html','payroll.html',
  'benefits.html','employee-directory.html','leadership.html','support.html','services/community-living/index.html',
  'assets/intranet-live-integration.js','assets/policies-app.js','assets/news-app.js','assets/feedback-app.js',
  'assets/payroll-app.js','assets/benefits-app.js','assets/employee-directory-app.js','assets/support-app.js'
];
const cleanRoutes = ['policies','documents','news','feedback','payroll','benefits','employee-directory','leadership','support','it-request','time-attendance','scheduling'];
const forbiddenBackendHtml = /href=["']https:\/\/sulandra-website-production-5fc4\.up\.railway\.app\/(?!api\/|public\/)/i;
const knownDeadRoutes = ['/policies','/documents','/news','/feedback','/payroll','/benefits','/employee-directory','/leadership','/support','/it-request','/scheduling','/time-attendance','/caregiver-resources','/about','/services/community-living','/services/waiver'];

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

if (failures.length) {
  console.error('Platform integration verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Platform integration verified: core pages, clean routes, static navigation, and frontend/backend ownership are coherent.');
