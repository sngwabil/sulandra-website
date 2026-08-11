import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const canonicalApplicantPortal = 'https://www.sulandrahealth.com/applicant-portal.html';

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function repairFrontend(relativePath) {
  const file = path.join(root, relativePath);
  if (!(await exists(file))) return;
  let source = await readFile(file, 'utf8');
  const before = source;

  source = source
    .replaceAll('https://sulandra-website-production.up.railway.app', canonicalApi)
    .replace(/notes:\s*base\.why\s*\|\|\s*null,/g, "notes: String(base.why || '').trim() || undefined,");

  if (source !== before) await writeFile(file, source, 'utf8');
}

await repairFrontend('applydsp.html');
await repairFrontend('services/community-living/applydsp.html');

const careersPath = path.join(root, 'api/src/careers-routes.ts');
let careers = await readFile(careersPath, 'utf8');
const careersBefore = careers;
careers = careers.replace(
  "notes: z.string().max(12000).optional(),",
  "notes: z.string().max(12000).nullish(),",
);
if (careers !== careersBefore) await writeFile(careersPath, careers, 'utf8');

const entityAccessPath = path.join(root, 'api/src/entity-access.ts');
let entityAccess = await readFile(entityAccessPath, 'utf8');
const entityAccessBefore = entityAccess;
entityAccess = entityAccess.replace(
`  } else {
    const primaryDepartmentId = employments.find((employment) => employment.primaryEmployment)?.departmentId
      ?? employments.find((employment) => employment.departmentId)?.departmentId
      ?? null;`,
`  } else if (!(managesEveryDepartment && requiredCapability(request.path) === 'CAREERS')) {
    const primaryDepartmentId = employments.find((employment) => employment.primaryEmployment)?.departmentId
      ?? employments.find((employment) => employment.departmentId)?.departmentId
      ?? null;`,
);
if (entityAccess !== entityAccessBefore) await writeFile(entityAccessPath, entityAccess, 'utf8');

const workflowPath = path.join(root, 'api/src/applicant-workflow.ts');
let workflow = await readFile(workflowPath, 'utf8');
const workflowBefore = workflow;
workflow = workflow.replace(
`const configuredPortalUrl = (
  process.env.CAREERS_PORTAL_URL
  ?? 'https://www.sulandrahealth.com/applicant'
).replace(/\\/$/, '');
export const careersPortalUrl = configuredPortalUrl.replace(
  /\\/applicant-portal(?:\\.html)?$/i,
  '/applicant',
);`,
`const configuredPortalUrl = (
  process.env.CAREERS_PORTAL_URL
  ?? '${canonicalApplicantPortal}'
).replace(/\\/$/, '');
export const careersPortalUrl = configuredPortalUrl.replace(
  /\\/applicant(?:-portal)?(?:\\.html)?$/i,
  '/applicant-portal.html',
);`,
);
if (workflow !== workflowBefore) await writeFile(workflowPath, workflow, 'utf8');

const adminPath = path.join(root, 'admin-railway.js');
let admin = await readFile(adminPath, 'utf8');
const adminBefore = admin;
const companyChangeMarker = 'window.addEventListener("sulandra:company-change"';
if (!admin.includes(companyChangeMarker)) {
  admin = admin.replace(
    '    window.addEventListener("hashchange", () => activateModule(location.hash.slice(1) || localStorage.getItem(ACTIVE_MODULE_KEY) || "dashboard", false));',
    `    window.addEventListener("hashchange", () => activateModule(location.hash.slice(1) || localStorage.getItem(ACTIVE_MODULE_KEY) || "dashboard", false));
    window.addEventListener("sulandra:company-change", async () => {
      applications = [];
      jobOpenings = [];
      renderApplications();
      try {
        await Promise.all([loadApplications(), loadOpenings(), loadDashboard()]);
      } catch (error) {
        toast("Company data not refreshed", error.message);
      }
    });`,
  );
}
if (admin !== adminBefore) await writeFile(adminPath, admin, 'utf8');

if (!workflow.includes("'/applicant-portal.html'")) {
  throw new Error('Applicant portal URL repair failed: applicant emails are not pinned to applicant-portal.html');
}
if (!entityAccess.includes("managesEveryDepartment && requiredCapability(request.path) === 'CAREERS'")) {
  throw new Error('Careers visibility repair failed: company managers are still auto-filtered to one department');
}
if (!careers.includes('a."legalEntityId"=$7')) {
  throw new Error('Careers company isolation regression: applicant listing is not scoped to the selected legal company');
}
if (!admin.includes(companyChangeMarker)) {
  throw new Error('Admin company-switch repair failed: applicant data will not refresh when company context changes');
}

console.log('Recruiting flow repaired: applicant portal links, selected-company isolation, company-wide manager visibility, and company-switch refresh are enforced.');
