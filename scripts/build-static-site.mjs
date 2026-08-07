import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'dist-web');
const railwayApiBase = 'https://sulandra-website-production-5fc4.up.railway.app';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const roots = [
  'index.html','about.html','careers.html','Careers.html','contact.html','services.html','reviews.html','resources.html','consultation.html','employee-login.html','employee-portal.html','admin.html','applicant-portal.html','intranet.html','education-portal.html','time-attendance.html','spire.html','favicon.ico'
];
for (const file of roots) {
  try { await cp(path.join(repositoryRoot, file), path.join(outputDirectory, file), { recursive: true }); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
for (const dir of ['assets','public']) {
  try { await cp(path.join(repositoryRoot, dir), path.join(outputDirectory, dir), { recursive: true }); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

const employeeAssetPath = path.join(outputDirectory, 'assets', 'employee-360.js');
try {
  let employeeAsset = await readFile(employeeAssetPath, 'utf8');
  const findHostAnchor = `  function findHost() {\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
  const fixedFindHost = `  function findHost() {\n    const explicitHost = document.getElementById('module-employees');\n    if (explicitHost) return explicitHost;\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
  if (!employeeAsset.includes(findHostAnchor)) throw new Error('Unable to patch the Employee 360 host lookup in the static build');
  employeeAsset = employeeAsset.replace(findHostAnchor, fixedFindHost);
  await writeFile(employeeAssetPath, employeeAsset, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

const spirePath = path.join(outputDirectory, 'spire.html');
try {
  let spireHtml = await readFile(spirePath, 'utf8');
  const spireWorkflowVersion = '20260807-spire-workflow-5';
  spireHtml = spireHtml
    .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-workflow\.css(?:\?v=[^"']+)?">\s*/g, '')
    .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-results-workspace\.css(?:\?v=[^"']+)?">\s*/g, '')
    .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-chart-review-v2\.css(?:\?v=[^"']+)?">\s*/g, '')
    .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-order-composer\.css(?:\?v=[^"']+)?">\s*/g, '')
    .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-emar\.css(?:\?v=[^"']+)?">\s*/g, '')
    .replace(/\s*<script src="\/assets\/spire-workflow\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '')
    .replace(/\s*<script src="\/assets\/spire-results-workspace\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '')
    .replace(/\s*<script src="\/assets\/spire-chart-review-v2\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '')
    .replace(/\s*<script src="\/assets\/spire-order-composer\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '')
    .replace(/\s*<script src="\/assets\/spire-emar\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '');
  spireHtml = spireHtml.replace('</head>', `<link rel="stylesheet" href="/assets/spire-workflow.css?v=${spireWorkflowVersion}"><link rel="stylesheet" href="/assets/spire-results-workspace.css?v=${spireWorkflowVersion}"><link rel="stylesheet" href="/assets/spire-chart-review-v2.css?v=${spireWorkflowVersion}"><link rel="stylesheet" href="/assets/spire-order-composer.css?v=${spireWorkflowVersion}"><link rel="stylesheet" href="/assets/spire-emar.css?v=${spireWorkflowVersion}"></head>`);
  spireHtml = spireHtml.replace('</body>', `<script src="/assets/spire-workflow.js?v=${spireWorkflowVersion}"></script><script src="/assets/spire-results-workspace.js?v=${spireWorkflowVersion}"></script><script src="/assets/spire-chart-review-v2.js?v=${spireWorkflowVersion}"></script><script src="/assets/spire-order-composer.js?v=${spireWorkflowVersion}"></script><script src="/assets/spire-emar.js?v=${spireWorkflowVersion}"></script></body>`);
  await writeFile(spirePath, spireHtml, 'utf8');
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
  timeAttendanceHtml = timeAttendanceHtml.replace(/const API_BASE\s*=\s*['"][^'"]*['"]/g, `const API_BASE='${railwayApiBase}'`);
  await writeFile(timeAttendancePath, timeAttendanceHtml, 'utf8');
} catch (error) { if (error?.code !== 'ENOENT') throw error; }

await import('./install-employee-self-service-frontend.mjs');
await import('./install-employee-management-frontend.mjs');
await rm(path.join(outputDirectory, 'time-attendance.txt'), { force: true });
console.log('Static website prepared with live Admin command center, persistent module navigation, Service Homes, Employee 360, Time and Attendance, Spire encounter documentation, personalized Results Review, Chart Review 2.0, CPOE Order Composer, eMAR medication management, and enterprise-owner identity.');
