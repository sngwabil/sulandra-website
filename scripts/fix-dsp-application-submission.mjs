import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';

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
await repairFrontend('applicant-portal.html');

const careersPath = path.join(root, 'api/src/careers-routes.ts');
let careers = await readFile(careersPath, 'utf8');
const careersBefore = careers;
careers = careers.replace(
  "notes: z.string().max(12000).optional(),",
  "notes: z.string().max(12000).nullish(),",
);
if (careers !== careersBefore) await writeFile(careersPath, careers, 'utf8');

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

const staticBuildPath = path.join(root, 'scripts/build-static-site.mjs');
let staticBuild = await readFile(staticBuildPath, 'utf8');
const staticBefore = staticBuild;
if (!staticBuild.includes("'applicant-portal.html'")) {
  staticBuild = staticBuild.replace(
    "  'careers.html', 'applygeneral.html', 'applydsp.html', 'applylpn.html', 'applydoo.html',",
    "  'careers.html', 'applicant-portal.html', 'applygeneral.html', 'applydsp.html', 'applylpn.html', 'applydoo.html',",
  );
}
const applicantAliasMarker = "path.join(outputDirectory, 'applicant', 'index.html')";
if (!staticBuild.includes(applicantAliasMarker)) {
  staticBuild = staticBuild.replace(
    "const loginPath = path.join(outputDirectory, 'employee-login.html');",
    `await mkdir(path.join(outputDirectory, 'applicant'), { recursive: true });
await cp(
  path.join(repositoryRoot, 'applicant-portal.html'),
  path.join(outputDirectory, 'applicant', 'index.html'),
);

const loginPath = path.join(outputDirectory, 'employee-login.html');`,
  );
}
if (staticBuild !== staticBefore) await writeFile(staticBuildPath, staticBuild, 'utf8');

if (!careers.includes('a."legalEntityId"=$7')) {
  throw new Error('Careers company isolation regression: applicant listing is not scoped to the selected legal company');
}
if (!admin.includes(companyChangeMarker)) {
  throw new Error('Admin company-switch repair failed: applicant data will not refresh when company context changes');
}
if (!staticBuild.includes("'applicant-portal.html'") || !staticBuild.includes(applicantAliasMarker)) {
  throw new Error('Applicant portal publication repair failed: the direct page or /applicant alias is missing');
}

console.log('Recruiting frontend repaired: applicant portal publication, legacy /applicant alias, canonical API routing, selected-company UI refresh, and existing company isolation are enforced.');
