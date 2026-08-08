import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'dist-web');
const railwayApiBase = 'https://sulandra-website-production-5fc4.up.railway.app';

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const publicExtensions = new Set([
  '.css', '.html', '.ico', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg',
  '.txt', '.webmanifest', '.xml', '.pdf',
]);
const publicRootFiles = new Set(['CNAME', 'vercel.json']);
const publicDirectories = ['assets', 'public', 'courses', 'education', 'services'];

for (const entry of await readdir(repositoryRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const extension = path.extname(entry.name).toLowerCase();
  if (!publicRootFiles.has(entry.name) && !publicExtensions.has(extension)) continue;
  await cp(path.join(repositoryRoot, entry.name), path.join(outputDirectory, entry.name));
}
for (const directory of publicDirectories) {
  try {
    await cp(path.join(repositoryRoot, directory), path.join(outputDirectory, directory), { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const employeeAssetPath = path.join(outputDirectory, 'assets', 'employee-360.js');
try {
  let employeeAsset = await readFile(employeeAssetPath, 'utf8');
  const before = `  function findHost() {\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
  const after = `  function findHost() {\n    const explicitHost = document.getElementById('module-employees');\n    if (explicitHost) return explicitHost;\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
  if (employeeAsset.includes(before)) employeeAsset = employeeAsset.replace(before, after);
  await writeFile(employeeAssetPath, employeeAsset, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const loginPath = path.join(outputDirectory, 'employee-login.html');
try {
  let loginHtml = await readFile(loginPath, 'utf8');
  loginHtml = loginHtml.replace(
    '<form id="form" autocomplete="on">',
    '<form id="form" autocomplete="on" method="post" action="https://sulandra-website-production-5fc4.up.railway.app/api/auth/login">',
  );
  await writeFile(loginPath, loginHtml, 'utf8');
  const loginRuntimeCandidates = [
    path.join(outputDirectory, 'assets', 'employee-login-railway.js'),
    path.join(outputDirectory, 'employee-login-railway.js'),
  ];
  let loginRuntime = '';
  for (const candidate of loginRuntimeCandidates) {
    try { loginRuntime = await readFile(candidate, 'utf8'); if (loginRuntime) break; } catch {}
  }
  if (!loginRuntime.includes('event.preventDefault()') || !loginRuntime.includes('/api/auth/login')) {
    throw new Error('Employee login runtime is incomplete in dist-web');
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

// Spire remains additive: it is a clinical application inside Sulandra Health.
const spirePath = path.join(outputDirectory, 'spire.html');
try {
  let spireHtml = await readFile(spirePath, 'utf8');
  const version = '20260808-spire-workflow-13';
  const styles = [
    'spire-workflow', 'spire-results-workspace', 'spire-chart-review-v2',
    'spire-order-composer', 'spire-emar', 'spire-care-plan', 'spire-incidents',
    'spire-assessments-flowsheets', 'spire-scheduling', 'spire-authorizations-evv',
    'spire-documents-external-records', 'spire-communications-inbasket',
  ];
  const scripts = [...styles];
  for (const asset of styles) {
    spireHtml = spireHtml.replace(new RegExp(`\\s*<link rel="stylesheet" href="\\/assets\\/${asset}\\.css(?:\\?v=[^"']+)?">\\s*`, 'g'), '');
  }
  for (const asset of scripts) {
    spireHtml = spireHtml.replace(new RegExp(`\\s*<script src="\\/assets\\/${asset}\\.js(?:\\?v=[^"']+)?"><\\/script>\\s*`, 'g'), '');
  }
  spireHtml = spireHtml
    .replace('</head>', styles.map(asset => `<link rel="stylesheet" href="/assets/${asset}.css?v=${version}">`).join('') + '</head>')
    .replace('</body>', scripts.map(asset => `<script src="/assets/${asset}.js?v=${version}"></script>`).join('') + '</body>');
  await writeFile(spirePath, spireHtml, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const educationPath = path.join(outputDirectory, 'education-portal.html');
try {
  let html = await readFile(educationPath, 'utf8');
  html = html
    .replace("const API='',TK='sulandra:employee:access-token',SK='sulandra:employee:session';", `const API='${railwayApiBase}',TK='sulandra:employee:access-token',SK='sulandra:employee:session';`)
    .replace(/<img src="\/favicon-48x48\.png" alt="Sulandra Health Logo">/g, '<img src="/assets/mainlogo.png" alt="Sulandra Health Logo">')
    .replace(/href="\/intranet\.HTML"/g, 'href="/intranet.html"');
  await writeFile(educationPath, html, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const educationEnhancementsPath = path.join(outputDirectory, 'assets', 'education-portal-enhancements.js');
try {
  let html = await readFile(educationEnhancementsPath, 'utf8');
  html = html.replace("const API='',TK='sulandra:employee:access-token';", `const API='${railwayApiBase}',TK='sulandra:employee:access-token';`);
  await writeFile(educationEnhancementsPath, html, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const timeAttendancePath = path.join(outputDirectory, 'time-attendance.html');
try {
  let html = await readFile(timeAttendancePath, 'utf8');
  html = html.replace(/const API_BASE\s*=\s*['"][^'"]*['"]/g, `const API_BASE='${railwayApiBase}'`);
  await writeFile(timeAttendancePath, html, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await import('./install-employee-self-service-frontend.mjs');
await import('./install-employee-management-frontend.mjs');
await import('./restore-modern-admin-portal.mjs');
await import('./finalize-admin-fullscreen-layout.mjs');
await rm(path.join(outputDirectory, 'time-attendance.txt'), { force: true });

const publishedAdmin = await readFile(path.join(outputDirectory, 'admin.html'), 'utf8');
for (const marker of [
  'sulandra-platform-bar',
  '/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v4',
  '/assets/sulandra-enterprise-owner.js?v=20260808-admin-command-center-v4',
  '/assets/admin-service-home-management-v2.js?v=20260808-admin-command-center-v4',
  '/assets/admin-platform-routing.js?v=20260808-admin-command-center-v4',
  'id="admin-fullscreen-layout"',
]) {
  if (!publishedAdmin.includes(marker)) throw new Error(`Modern Admin publication failed; missing ${marker}`);
}

const requiredPublishedFiles = [
  'admin.html', 'admin-railway.js', 'employee-login.html', 'employee-portal.html',
  'employee360.html', 'education-portal.html', 'time-attendance.html', 'intranet.html',
  'intranet.HTML', 'policies.html', 'news.html', 'feedback.html', 'payroll.html',
  'benefits.html', 'employee-directory.html', 'leadership.html', 'support.html',
  'health-safety.html', 'careers-admin-workflow.js', 'interview-admin-scheduler.js',
  'favicon-48x48.png', 'assets/mainlogo.png', 'assets/admin-platform-routing.js',
  'assets/admin-service-home-management-v2.js', 'spire.html', 'spire-admin.html',
  'courses', 'education', 'services',
];
for (const relative of requiredPublishedFiles) {
  try { await stat(path.join(outputDirectory, relative)); }
  catch { throw new Error(`Static publication regression: missing ${relative}`); }
}

console.log('Static website restored to the complete pre-Spire publication surface while preserving modern Admin, live Service Homes, Time and Attendance, Scheduling, Employee 360, Education, Intranet, Careers and all Spire clinical modules.');
