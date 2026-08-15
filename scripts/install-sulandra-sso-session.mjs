import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const marker='/assets/sulandra-sso-session.js?v=20260815-privileged-session-1';
const internalNames=new Set([
  // Admin itself owns SSO from assets/admin-shell.js; the routes launched from
  // Admin receive the shared SSO runtime so privileged tab-only/idle security
  // continues while moving between workspaces.
  'employee-portal.html','employee360.html','education.html','education-portal.html','course-player.html','education-certificate.html',
  'time-attendance.html','intranet.html','intranet-control.html','policies.html','news.html','feedback.html','payroll.html','benefits.html',
  'employee-directory.html','leadership.html','support.html','health-safety.html','spire.html','spire-admin.html','spire-workspace.html',
  'admin-profile.html','client-intake.html','company-documents.html','workforce-admin.html','scheduling.html','spire-medication-qualifications.html',
  'spire-training.html','home-health-referrals.html','home-health.html','nmt-orders.html','nmt-dispatch.html'
]);

async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await walk(p));else if(entry.isFile()&&entry.name.endsWith('.html'))out.push(p)}return out}
let installed=0;
for(const file of await walk(dist)){
  const rel=path.relative(dist,file).replaceAll('\\','/');
  const base=path.basename(rel);
  const isCourse=rel.startsWith('courses/')||/^sh-(cap|med|beh)-/i.test(base);
  if(!internalNames.has(base)&&!isCourse)continue;
  let html=await readFile(file,'utf8');
  html=html.replace(/\s*<script src=["']\/assets\/sulandra-sso-session\.js[^"']*["']><\/script>\s*/g,'\n');
  const tag=`<script src="${marker}"></script>`;
  if(html.includes('</head>'))html=html.replace('</head>',`  ${tag}\n</head>`);
  else if(html.includes('<body'))html=html.replace('<body',`${tag}\n<body`);
  else continue;
  await writeFile(file,html,'utf8');installed++;
}
console.log(`Sulandra single sign-on session cache installed across ${installed} internal page(s); Admin is owned by its canonical shell runtime.`);