import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'dist-web');
const publicDirectories = ['assets', 'courses', 'education', 'services'];
const publicExtensions = new Set(['.css','.html','.ico','.js','.png','.svg','.txt','.webmanifest','.xml']);
const publicRootFiles = new Set(['CNAME', 'vercel.json']);
const railwayApiBase = 'https://sulandra-website-production-5fc4.up.railway.app';
const staticBase = 'https://www.sulandrahealth.com';
const attendanceAdminTarget = `${staticBase}/time-attendance.html#admin`;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const entries = await readdir(repositoryRoot, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const extension = path.extname(entry.name).toLowerCase();
  if (!publicRootFiles.has(entry.name) && !publicExtensions.has(extension)) continue;
  await cp(path.join(repositoryRoot, entry.name), path.join(outputDirectory, entry.name));
}
for (const directory of publicDirectories) {
  try { await cp(path.join(repositoryRoot, directory), path.join(outputDirectory, directory), { recursive: true }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const adminPath = path.join(outputDirectory, 'admin.html');
try {
  let adminHtml = await readFile(adminPath, 'utf8');
  const version = '20260807-admin-command-center-v3';
  if (!adminHtml.includes('http-equiv="Cache-Control"')) {
    adminHtml = adminHtml.replace('<head>', '<head>\n  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">');
  }
  adminHtml = adminHtml
    .replace(/\s*<script src="admin-restored-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="admin-applicant-lifecycle-filter\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/admin-service-home-management(?:-v2)?\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/admin-employee-permissions\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/admin-employee-management\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/admin-live-dashboard\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/<a\s+data-module=["']time["']\s*>\s*Time\s*&(?:amp;)?\s*Attendance\s*<\/a>/gi, `<a href="${attendanceAdminTarget}" id="adminTimeAttendanceTopLink">Time &amp; Attendance</a>`)
    .replace(/<button([^>]*?)data-module=["']time["']([^>]*)>\s*Time\s*&(?:amp;)?\s*Attendance([\s\S]*?)<\/button>/gi, `<button$1id="adminTimeAttendanceSideLink"$2 type="button">Time &amp; Attendance$3</button>`);

  if (!adminHtml.includes('id="module-employees"')) {
    const employeeModule = `
        <!-- Employee 360 Module -->
        <section class="card module" id="module-employees" aria-label="Employee management workspace">
          <h1>Employees</h1>
          <p class="sub">Loading employee directory, scoped permissions, confidential-record controls, compliance, education, timekeeping, communications, and account tools…</p>
        </section>

`;
    const onboardingAnchor = '        <!-- Onboarding Module (Primary Suite) -->';
    const settingsAnchor = '        <!-- Settings Module -->';
    if (adminHtml.includes(onboardingAnchor)) {
      adminHtml = adminHtml.replace(onboardingAnchor, `${employeeModule}${onboardingAnchor}`);
    } else if (adminHtml.includes(settingsAnchor)) {
      adminHtml = adminHtml.replace(settingsAnchor, `${employeeModule}${settingsAnchor}`);
    } else {
      throw new Error('Unable to locate an insertion point for the Employee 360 module');
    }
  }

  const directNavigation = `
<script id="admin-time-attendance-hard-route">
(() => {
  const target = '${attendanceAdminTarget}';
  const redirect = (event) => { if (event) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); } window.location.href = target; };
  const wire = () => {
    const top = document.getElementById('adminTimeAttendanceTopLink');
    const side = document.getElementById('adminTimeAttendanceSideLink');
    if (top) { top.href = target; top.removeAttribute('data-module'); top.onclick = redirect; }
    if (side) { side.removeAttribute('data-module'); side.onclick = redirect; }
  };
  wire(); document.addEventListener('DOMContentLoaded', wire); window.addEventListener('load', wire);
  document.addEventListener('click', (event) => { const control = event.target.closest('#adminTimeAttendanceTopLink,#adminTimeAttendanceSideLink'); if (control) redirect(event); }, true);
})();
</script>`;
  adminHtml = adminHtml.replace(/\s*<script id="admin-time-attendance-hard-route">[\s\S]*?<\/script>\s*/g, '\n');
  adminHtml = adminHtml.replace('</body>', `  <script src="admin-restored-navigation.js?v=${version}"></script>\n  <script src="admin-applicant-lifecycle-filter.js?v=${version}"></script>\n  <script src="/assets/admin-service-home-management-v2.js?v=${version}"></script>\n  <script src="/assets/admin-employee-permissions.js?v=${version}"></script>\n  <script src="/assets/admin-employee-management.js?v=${version}"></script>\n  <script src="/assets/admin-live-dashboard.js?v=${version}"></script>\n  ${directNavigation}\n</body>`);
  await writeFile(adminPath, adminHtml, 'utf8');

  const employeeAssetPath = path.join(outputDirectory, 'assets', 'admin-employee-management.js');
  let employeeAsset = await readFile(employeeAssetPath, 'utf8');
  if (!employeeAsset.includes("const explicitHost = document.getElementById('module-employees')")) {
    const findHostAnchor = `  function findHost() {\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
    const fixedFindHost = `  function findHost() {\n    const explicitHost = document.getElementById('module-employees');\n    if (explicitHost) return explicitHost;\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
    if (!employeeAsset.includes(findHostAnchor)) {
      throw new Error('Unable to patch the Employee 360 host lookup in the static build');
    }
    employeeAsset = employeeAsset.replace(findHostAnchor, fixedFindHost);
  }
  await writeFile(employeeAssetPath, employeeAsset, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const educationPath = path.join(outputDirectory, 'education-portal.html');
try {
  let educationHtml = await readFile(educationPath, 'utf8');
  educationHtml = educationHtml.replace("const API='',TK='sulandra:employee:access-token',SK='sulandra:employee:session';", `const API='${railwayApiBase}',TK='sulandra:employee:access-token',SK='sulandra:employee:session';`);
  await writeFile(educationPath, educationHtml, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const educationEnhancementsPath = path.join(outputDirectory, 'assets', 'education-portal-enhancements.js');
try {
  let educationEnhancements = await readFile(educationEnhancementsPath, 'utf8');
  educationEnhancements = educationEnhancements.replace("const API='',TK='sulandra:employee:access-token';", `const API='${railwayApiBase}',TK='sulandra:employee:access-token';`);
  await writeFile(educationEnhancementsPath, educationEnhancements, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const timeAttendancePath = path.join(outputDirectory, 'time-attendance.html');
try {
  let timeAttendanceHtml = await readFile(timeAttendancePath, 'utf8');
  timeAttendanceHtml = timeAttendanceHtml
    .replace("const API=(localStorage.getItem('sulandra_api_url')||window.SULANDRA_API_URL||'').replace(/\\/$/,'');", `const API=(window.SULANDRA_API_URL||'${railwayApiBase}').replace(/\\/$/,'');`)
    .replace("const token=localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';", "const token=sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';");
  timeAttendanceHtml = timeAttendanceHtml
    .replace(/\s*<script src="\/assets\/time-attendance-employee-identity\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/time-attendance-blocked-attempts\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/time-attendance-admin-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/time-attendance-geofence\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace('</body>', '  <script src="/assets/time-attendance-blocked-attempts.js?v=20260806-service-homes-v2-1"></script>\n  <script src="/assets/time-attendance-location-scheduler.js?v=20260806-service-homes-v2-1"></script>\n  <script src="/assets/time-attendance-geofence.js?v=20260806-service-homes-v2-1"></script>\n</body>');
  await writeFile(timeAttendancePath, timeAttendanceHtml, 'utf8');
  const cleanRouteDirectory = path.join(outputDirectory, 'time-attendance');
  await mkdir(cleanRouteDirectory, { recursive: true });
  await writeFile(path.join(cleanRouteDirectory, 'index.html'), timeAttendanceHtml, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const ownerAsset = '<script src="/assets/sulandra-enterprise-owner.js?v=20260806-owner-1"></script>';
async function injectOwnerAsset(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { await injectOwnerAsset(target); continue; }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.html') continue;
    let html = await readFile(target, 'utf8');
    html = html.replace(/\s*<script src="\/assets\/sulandra-enterprise-owner\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
    if (html.includes('</body>')) html = html.replace('</body>', `  ${ownerAsset}\n</body>`);
    await writeFile(target, html, 'utf8');
  }
}
await injectOwnerAsset(outputDirectory);
await import('./install-employee-self-service-frontend.mjs');
await import('./install-employee-management-frontend.mjs');

await rm(path.join(outputDirectory, 'time-attendance.txt'), { force: true });
console.log('Static website prepared with live Admin command center, persistent module navigation, dual slide-out operations panels, Service Homes, scoped Employee 360 permissions, compliance, employee self-service, Team Hub collaboration, approval workflows, feedback, recognition, notifications, schedules, clocking, and enterprise-owner identity.');
