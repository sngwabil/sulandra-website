import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const employeePath = path.join(root, 'assets', 'employee-compliance-self-service.js');
const adminPath = path.join(root, 'assets', 'admin-employee-compliance.js');

let employee = await readFile(employeePath, 'utf8');
employee = employee
  .replace(
    '    const completed = Number(summary.compliant || 0);',
    '    const completed = Number(summary.currentlyCompliant ?? summary.compliant ?? 0);',
  )
  .replace(
    '<div class="self-compliance-stat"><span>Compliant</span><strong>${completed}</strong></div>',
    '<div class="self-compliance-stat"><span>Currently Compliant</span><strong>${completed}</strong></div>',
  )
  .replace(
    '${percent}% currently compliant based on approved Employee 360 evidence.',
    '${percent}% currently compliant, including approved records that are due for renewal soon.',
  );
await writeFile(employeePath, employee, 'utf8');

let admin = await readFile(adminPath, 'utf8');
admin = admin
  .replace(
    "data.assignments.filter(item=>item.status==='COMPLIANT'||item.status==='EXEMPT').length",
    "data.assignments.filter(item=>['COMPLIANT','DUE_SOON','EXEMPT'].includes(item.status)).length",
  )
  .replace(
    '<span>Compliant</span><strong>${data.assignments.filter(item=>[\'COMPLIANT\',\'DUE_SOON\',\'EXEMPT\'].includes(item.status)).length}</strong>',
    '<span>Currently Compliant</span><strong>${data.assignments.filter(item=>[\'COMPLIANT\',\'DUE_SOON\',\'EXEMPT\'].includes(item.status)).length}</strong>',
  );
await writeFile(adminPath, admin, 'utf8');

// Employee 360 is loaded dynamically inside admin.html. Every Admin specialty
// module must use the same authenticated session key and selected legal-entity
// scope as the canonical Admin shell before build-static-site copies assets into
// dist-web. Several legacy modules still read employeeToken/adminToken/token and
// were therefore producing real 401s even while the administrator was signed in.
const canonicalToken = "const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";
const companyHeaders = "...(window.SulandraCompanyContext?.headers?.()||{}),";
const employeeSuiteAssets = [
  'admin-employee-permissions.js',
  'admin-employee-management.js',
  'admin-employee-compliance.js',
  'admin-employee-collaboration.js',
  'admin-employee-performance.js',
  'admin-employee-compensation.js',
  'admin-employee-leave-offboarding.js',
  'admin-employee-assets-access.js',
  'admin-employee-analytics.js',
  'admin-employee-documents.js',
  'admin-employee-bulk-data.js',
  'admin-employee-workflows.js',
  'admin-employee-communications.js',
  'admin-employee-engagement.js',
  'admin-employee-learning.js',
  'admin-employee-health-safety.js',
  'admin-employee360-enterprise-controls.js',
];

async function fileExists(file) {
  try { await access(file); return true; } catch { return false; }
}

function canonicalizeAdminRequest(source) {
  source = source.replace(/const\s+token\s*=\s*\(\)\s*=>[^;]+;/, canonicalToken);
  source = source.replace(
    /Authorization:\s*`Bearer \$\{token\(\)\}`,(?!\s*\.\.\.\(window\.SulandraCompanyContext)/g,
    `Authorization:\`Bearer \${token()}\`,${companyHeaders}`,
  );
  source = source.replace(
    /['\"]Authorization['\"]\s*:\s*`Bearer \$\{token\(\)\}`,(?!\s*\.\.\.\(window\.SulandraCompanyContext)/g,
    `'Authorization':\`Bearer \${token()}\`,${companyHeaders}`,
  );
  source = source.replace(
    /['\"]Authorization['\"]\s*:\s*['\"]Bearer ['\"]\s*\+\s*token\(\),(?!\s*\.\.\.\(window\.SulandraCompanyContext)/g,
    `'Authorization':'Bearer '+token(),${companyHeaders}`,
  );
  return source;
}

function makeCommunicationsNonDestructive(source) {
  const destructiveRender = "function render(){const root=host();if(!root)return;root.innerHTML=`";
  const scopedRender = "function render(){const root=host();if(!root)return;let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`";
  if (source.includes(destructiveRender)) source = source.replace(destructiveRender, scopedRender);
  if (source.includes(scopedRender)) source = source.replaceAll("root.querySelector('#comm-", "view.querySelector('#comm-");

  const destructiveError = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){root.innerHTML=`<p style=\"color:#b91c1c\">${esc(error.message)}</p>`}}";
  const scopedError = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`<div style=\"padding:12px;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;background:#fff7f7\">Communications could not load: ${esc(error.message)}</div>`}}";
  if (source.includes(destructiveError)) source = source.replace(destructiveError, scopedError);
  return source;
}

function repairAnalyticsSyntax(source) {
  const broken = "document.getElementById('ea-export').onsubmit=exportReport}\n  async function saveDefinition";
  const fixed = "document.getElementById('ea-export').onsubmit=exportReport}}\n  async function saveDefinition";
  return source.includes(broken) ? source.replace(broken, fixed) : source;
}

for (const assetName of employeeSuiteAssets) {
  const target = path.join(root, 'assets', assetName);
  if (!(await fileExists(target))) continue;
  let source = await readFile(target, 'utf8');
  source = canonicalizeAdminRequest(source);
  if (assetName === 'admin-employee-communications.js') source = makeCommunicationsNonDestructive(source);
  if (assetName === 'admin-employee-analytics.js') source = repairAnalyticsSyntax(source);
  await writeFile(target, source, 'utf8');
}

// install-time-attendance-platform.mjs historically injected its global blocked-
// punch fetch wrapper into admin.html. That wrapper belongs only to the dedicated
// Time & Attendance surface and made every unrelated Admin API failure appear in
// DevTools as time-attendance-blocked-attempts.js. Remove those Admin-only tags;
// the dedicated time-attendance.html publication remains unchanged.
const adminHtmlPath = path.join(root, 'admin.html');
let adminHtml = await readFile(adminHtmlPath, 'utf8');
adminHtml = adminHtml
  .replace(/\s*<script src="\/assets\/time-attendance-blocked-attempts\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/time-attendance-geofence\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');

// Repair the multiline Director of Operations preset without depending on the
// exact COO/DOO wording. Plain quoted JavaScript strings cannot contain literal
// newlines; this was the admin.html:881 Invalid or unexpected token seen in the
// browser console. JSON.stringify preserves the text while emitting valid escapes.
const presetsStart = adminHtml.indexOf('const jobPresets = {');
const dspStart = presetsStart >= 0 ? adminHtml.indexOf('      dsp:', presetsStart) : -1;
if (presetsStart >= 0 && dspStart > presetsStart) {
  const prefix = adminHtml.slice(0, presetsStart);
  let firstPreset = adminHtml.slice(presetsStart, dspStart);
  const suffix = adminHtml.slice(dspStart);
  firstPreset = firstPreset.replace(
    /(description:\s*)"([\s\S]*?)"(,\s*\n\s*reqs:)/,
    (_match, lead, value, tail) => `${lead}${JSON.stringify(value)}${tail}`,
  );
  firstPreset = firstPreset.replace(
    /(reqs:\s*)"([\s\S]*?)"(,\s*\n\s*benefits:)/,
    (_match, lead, value, tail) => `${lead}${JSON.stringify(value)}${tail}`,
  );
  firstPreset = firstPreset.replace(
    /(benefits:\s*)"([\s\S]*?)"(\s*\n\s*},)/,
    (_match, lead, value, tail) => `${lead}${JSON.stringify(value)}${tail}`,
  );
  adminHtml = prefix + firstPreset + suffix;
}
await writeFile(adminHtmlPath, adminHtml, 'utf8');

console.log('Employee compliance plus canonical Admin Employee 360 runtime prepared before static publication: shared bearer token/company scope, non-destructive specialty mounting, Analytics syntax repair, Admin job-preset syntax repair, and Time & Attendance fetch isolation.');
