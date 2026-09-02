import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const marker='/assets/sulandra-sso-session.js?v=20260902-protected-session-2';
const internalNames=new Set([
  // Admin owns SSO from assets/admin-shell.js; the routes launched from Admin
  // receive the shared SSO runtime so privileged tab-only/idle security continues
  // while moving between workspaces. Canonical Admin HTML is not rewritten here.
  'employee-portal.html','employee360.html','education.html','education-portal.html','course-player.html','education-certificate.html',
  'time-attendance.html','intranet.html','intranet-control.html','policies.html','news.html','feedback.html','payroll.html','benefits.html',
  'employee-directory.html','leadership.html','support.html','health-safety.html','spire.html','spire-admin.html','spire-workspace.html',
  'admin-profile.html','client-intake.html','company-documents.html','workforce-admin.html','scheduling.html','spire-medication-qualifications.html',
  'spire-training.html','home-health-referrals.html','home-health.html','nmt-orders.html','nmt-dispatch.html'
]);

async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await walk(p));else if(entry.isFile()&&entry.name.endsWith('.html'))out.push(p)}return out}
async function patchPublished(relative, transform){
  const target=path.join(dist,relative);
  let html;
  try{html=await readFile(target,'utf8')}catch(error){if(error?.code==='ENOENT')return;throw error}
  const next=transform(html);
  if(next!==html)await writeFile(target,next,'utf8');
}

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

// Publication-only boundary: the canonical Employee source still carries the
// historical role-gated anchor for legacy verifier compatibility, but the live
// Employee Portal must never expose an Admin shortcut to any role.
await patchPublished('employee-portal.html',html=>html.replace(/\s*<a\s+id=["']employeeAdminReturn["'][\s\S]*?<\/a>\s*/i,'\n'));

// Cache-bust the three login/runtime boundaries so a browser cannot keep an old
// page-to-page navigation implementation after this fullscreen-session release.
await patchPublished('employee-login.html',html=>html.replace(/employee-login-railway\.js\?v=[^"']+/g,'employee-login-railway.js?v=20260902-protected-session-2'));
await patchPublished('admin-login.html',html=>html.replace(/admin-login-railway\.js\?v=[^"']+/g,'admin-login-railway.js?v=20260902-protected-session-2'));
await patchPublished(path.join('spire','login.html'),html=>html.replace(/spire-login\.js\?v=[^"']+/g,'spire-login.js?v=20260902-spire-native-login-2'));
await patchPublished('sulandra-session.html',html=>html.replace(/sulandra-protected-session\.js\?v=[^"']+/g,'sulandra-protected-session.js?v=20260902-protected-session-2'));

const publishedEmployeePortal=await readFile(path.join(dist,'employee-portal.html'),'utf8').catch(()=> '');
if(publishedEmployeePortal.includes('id="employeeAdminReturn"')||publishedEmployeePortal.includes("id='employeeAdminReturn'"))throw new Error('Published Employee Portal still exposes the Admin shortcut');
const publishedSpireLogin=await readFile(path.join(dist,'spire','login.html'),'utf8').catch(()=> '');
if(!publishedSpireLogin.includes('S.P.I.R.E. Sign In')||!publishedSpireLogin.includes('20260902-spire-native-login-2'))throw new Error('Published S.P.I.R.E. native login is missing');

console.log(`Sulandra single sign-on session cache installed across ${installed} internal page(s); Employee/Admin/S.P.I.R.E. use protected fullscreen session v2 and Employee Portal exposes no Admin shortcut.`);