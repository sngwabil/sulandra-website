import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [root, path.join(root, 'dist-web')];
const canonicalToken = "const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";
const companyHeaders = "...(window.SulandraCompanyContext?.headers?.()||{}),";

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function normalizeAdminAuth(source) {
  source = source.replace(/const\s+token\s*=\s*\(\)\s*=>[^;]+;/, canonicalToken);
  source = source.replace(/Authorization:\s*`Bearer \$\{token\(\)\}`,(?!\s*\.\.\.\(window\.SulandraCompanyContext)/g, `Authorization:\`Bearer \${token()}\`,${companyHeaders}`);
  source = source.replace(/['\"]Authorization['\"]\s*:\s*`Bearer \$\{token\(\)\}`,(?!\s*\.\.\.\(window\.SulandraCompanyContext)/g, `'Authorization':\`Bearer \${token()}\`,${companyHeaders}`);
  source = source.replace(/['\"]Authorization['\"]\s*:\s*['\"]Bearer ['\"]\s*\+\s*token\(\),(?!\s*\.\.\.\(window\.SulandraCompanyContext)/g, `'Authorization':'Bearer '+token(),${companyHeaders}`);
  return source;
}

function fixCommunicationsMount(source) {
  const destructive = "function render(){const root=host();if(!root)return;root.innerHTML=`";
  const safe = "function render(){const root=host();if(!root)return;let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`";
  if (source.includes(destructive)) source = source.replace(destructive, safe);
  if (source.includes(safe)) source = source.replaceAll("root.querySelector('#comm-", "view.querySelector('#comm-");
  const destructiveCatch = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){root.innerHTML=`<p style=\"color:#b91c1c\">${esc(error.message)}</p>`}}";
  const safeCatch = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`<div style=\"padding:12px;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;background:#fff7f7\">Communications could not load: ${esc(error.message)}</div>`}}";
  if (source.includes(destructiveCatch)) source = source.replace(destructiveCatch, safeCatch);
  return source;
}

function fixAnalyticsSyntax(source) {
  const broken = "document.getElementById('ea-export').onsubmit=exportReport}\n  async function saveDefinition";
  const fixed = "document.getElementById('ea-export').onsubmit=exportReport}}\n  async function saveDefinition";
  return source.includes(broken) ? source.replace(broken, fixed) : source;
}

const suiteAssets = [
  'admin-employee-permissions.js','admin-employee-management.js','admin-employee-compliance.js','admin-employee-collaboration.js',
  'admin-employee-performance.js','admin-employee-compensation.js','admin-employee-leave-offboarding.js','admin-employee-assets-access.js',
  'admin-employee-analytics.js','admin-employee-documents.js','admin-employee-bulk-data.js','admin-employee-workflows.js',
  'admin-employee-communications.js','admin-employee-engagement.js','admin-employee-learning.js','admin-employee-health-safety.js',
  'admin-employee360-enterprise-controls.js',
];

for (const base of roots) {
  for (const name of suiteAssets) {
    const file = path.join(base, 'assets', name);
    if (!(await exists(file))) continue;
    let source = await readFile(file, 'utf8');
    source = normalizeAdminAuth(source);
    if (name === 'admin-employee-communications.js') source = fixCommunicationsMount(source);
    if (name === 'admin-employee-analytics.js') source = fixAnalyticsSyntax(source);
    await writeFile(file, source, 'utf8');
  }
}

const badDescription = `        description: "The Chief Operating Officer (COO) serves as the primary operational leader responsible for day-to-day agency operations, clinical administration, regulatory compliance, and fiscal management under Ohio Department of Developmental Disabilities (DODD) OAC 5123 and Ohio Department of Health guidelines.\n\nKey Responsibilities:\n• Direct daily operations of residential community living homes, home health aide services, and NEMT transportation networks.\n• Enforce compliance with DODD rules, Medicaid waiver standards, Electronic Visit Verification (EVV), and Ohio Administrative Code OAC 5123.\n• Oversee Major Unusual Incident (MUI) and Unusual Incident (UI) investigations, reporting, and prevention plans.\n• Manage organizational finances, staffing ratios, line-of-credit compliance, and departmental performance.\n• Lead quality assurance audits, survey readiness, and workforce development across clinical and administrative teams.",`;
const goodDescription = `        description: \`The Chief Operating Officer (COO) serves as the primary operational leader responsible for day-to-day agency operations, clinical administration, regulatory compliance, and fiscal management under Ohio Department of Developmental Disabilities (DODD) OAC 5123 and Ohio Department of Health guidelines.\n\nKey Responsibilities:\n• Direct daily operations of residential community living homes, home health aide services, and NEMT transportation networks.\n• Enforce compliance with DODD rules, Medicaid waiver standards, Electronic Visit Verification (EVV), and Ohio Administrative Code OAC 5123.\n• Oversee Major Unusual Incident (MUI) and Unusual Incident (UI) investigations, reporting, and prevention plans.\n• Manage organizational finances, staffing ratios, line-of-credit compliance, and departmental performance.\n• Lead quality assurance audits, survey readiness, and workforce development across clinical and administrative teams.\`,`;
const badReqs = `        reqs: "• Bachelor's or Master's Degree in Healthcare Administration, Business, Nursing, or Human Services.\n• Minimum 4 years of executive or supervisory experience in developmental disabilities (DD) or home health operations.\n• Must meet DODD Director of Operations (DOO) qualifications under OAC 5123-2-08 (Age 21+, BCII/FBI criminal background check clearance, completion of DODD DOO Orientation Training).\n• Proven expertise in Medicaid billing, EVV systems, and DODD certification standards.",`;
const goodReqs = `        reqs: \`• Bachelor's or Master's Degree in Healthcare Administration, Business, Nursing, or Human Services.\n• Minimum 4 years of executive or supervisory experience in developmental disabilities (DD) or home health operations.\n• Must meet DODD Director of Operations (DOO) qualifications under OAC 5123-2-08 (Age 21+, BCII/FBI criminal background check clearance, completion of DODD DOO Orientation Training).\n• Proven expertise in Medicaid billing, EVV systems, and DODD certification standards.\`,`;
const badBenefits = `        benefits: "• Competitive Executive Base Salary + Performance Bonus Pool\n• Comprehensive Medical, Dental, and Vision Coverage\n• Paid Time Off (PTO), Paid Holidays, and Executive Professional Development\n• 401(k) Retirement Plan with Company Match\n• Significant leadership autonomy and enterprise growth opportunity"`;
const goodBenefits = `        benefits: \`• Competitive Executive Base Salary + Performance Bonus Pool\n• Comprehensive Medical, Dental, and Vision Coverage\n• Paid Time Off (PTO), Paid Holidays, and Executive Professional Development\n• 401(k) Retirement Plan with Company Match\n• Significant leadership autonomy and enterprise growth opportunity\``;

for (const base of roots) {
  const admin = path.join(base, 'admin.html');
  if (!(await exists(admin))) continue;
  let html = await readFile(admin, 'utf8');
  html = html.replace(badDescription, goodDescription).replace(badReqs, goodReqs).replace(badBenefits, goodBenefits);
  html = html
    .replace(/\s*<script src="\/assets\/time-attendance-blocked-attempts\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/time-attendance-geofence\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  await writeFile(admin, html, 'utf8');
}

console.log('Published Admin runtime repaired in source and dist-web: Employee 360 auth/company scope normalized, Communications no longer replaces the Employees module, Analytics closing brace repaired, Admin job-preset multiline strings repaired, and Admin time-attendance fetch wrapper removed.');
