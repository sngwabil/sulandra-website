import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'dist-web');
const railwayApiBase = 'https://sulandra-website-production-5fc4.up.railway.app';

// The business-path installer exposes the canonical SpireEnsureShell hook before
// this publication step. Make that same runtime idempotent before dist-web is
// copied so a later DOM-ready/recovery callback cannot reconstruct an open chart.
await import('./install-spire-idempotent-shell.mjs');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const publicExtensions = new Set([
  '.css', '.html', '.ico', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg',
  '.txt', '.webmanifest', '.xml', '.pdf',
]);
const publicRootFiles = new Set(['CNAME', 'education-catalog.json']);
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

// SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT: the Results workspace observes body child
// mutations so it can enhance a newly opened Results tab. Its legacy tab-layout
// pass appendChild()-ed every existing chart tab on every observer callback even
// when order was already correct. Moving those nodes generated the next child-list
// mutation and created the chart-opening CPU loop. Patch the final published asset
// so it mutates tab order only when the actual key order differs.
const resultsWorkspacePath = path.join(outputDirectory, 'assets', 'spire-results-workspace.js');
try {
  let source = await readFile(resultsWorkspacePath, 'utf8');
  if (!source.includes('SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT')) {
    const anchor = 'order.forEach(k=>bar.appendChild(byKey.get(k)));buttons.forEach';
    const replacement = "/* SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT */const currentOrder=buttons.map(b=>b.dataset.chartTab);if(currentOrder.length!==order.length||currentOrder.some((key,index)=>key!==order[index]))order.forEach(k=>bar.appendChild(byKey.get(k)));buttons.forEach";
    if (!source.includes(anchor)) throw new Error('SPIRE Results tab-layout mutation anchor changed');
    source = source.replace(anchor, replacement);
  }
  if (!source.includes('SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT')) throw new Error('SPIRE Results workspace idempotent tab-layout patch is missing');
  await writeFile(resultsWorkspacePath, source, 'utf8');
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

const spirePath = path.join(outputDirectory, 'spire.html');
try {
  let spireHtml = await readFile(spirePath, 'utf8');
  const version = '20260808-spire-workflow-13';
  const versionFor = (asset) => {
    if (asset === 'spire-results-workspace') return '20260811-spire-results-workspace-2';
    if (asset === 'spire-chart-review-v2') return '20260811-spire-chart-review-v2-2';
    if (asset === 'spire-screen-controls') return '20260811-spire-screen-controls-3';
    return version;
  };
  const styles = [
    'spire-workflow', 'spire-results-workspace', 'spire-chart-review-v2',
    'spire-order-composer', 'spire-emar', 'spire-care-plan', 'spire-incidents',
    'spire-assessments-flowsheets', 'spire-scheduling', 'spire-authorizations-evv',
    'spire-documents-external-records', 'spire-communications-inbasket',
    // Keep viewport protection last so other SPIRE modules cannot reintroduce horizontal overflow.
    'spire-screen-controls',
  ];
  const scripts = [...styles];
  for (const asset of styles) {
    spireHtml = spireHtml.replace(new RegExp(`\\s*<link rel="stylesheet" href="\\/assets\\/${asset}\\.css(?:\\?v=[^"']+)?">\\s*`, 'g'), '');
  }
  for (const asset of scripts) {
    spireHtml = spireHtml.replace(new RegExp(`\\s*<script src="\\/assets\\/${asset}\\.js(?:\\?v=[^"']+)?"><\\/script>\\s*`, 'g'), '');
  }
  spireHtml = spireHtml
    .replace('</head>', styles.map(asset => `<link rel="stylesheet" href="/assets/${asset}.css?v=${versionFor(asset)}">`).join('') + '</head>')
    .replace('</body>', scripts.map(asset => `<script src="/assets/${asset}.js?v=${versionFor(asset)}"></script>`).join('') + '</body>')
    // The business-path installer pins app generation nine. The content of that
    // runtime is hardened by install-spire-idempotent-shell.mjs after the pinning
    // step, so publish it under a fresh URL or browsers may reuse the old pre-fix
    // generation-nine bytes from cache.
    .replace(/\/assets\/spire-app-v2\.js\?v=20260811-business-uat-9(?:&startup=[^"']+)?/g, '/assets/spire-app-v2.js?v=20260811-business-uat-9&startup=20260811-domready-1');
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
await rm(path.join(outputDirectory, 'time-attendance.txt'), { force: true });

// Admin is deliberately not rewritten after publication. admin.html is copied as-is;
// assets/admin-company-context.js owns the canonical navigation registry and loads
// the canonical Admin shell/dashboard modules at runtime.
const publishedAdminPath = path.join(outputDirectory, 'admin.html');
const publishedAdmin = await readFile(publishedAdminPath, 'utf8');
for (const marker of [
  '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
  'careers-admin-workflow.js?v=20260809-hiring-provisioning-2',
  'admin-railway.js?v=20260804-admin-clean-4',
]) {
  if (!publishedAdmin.includes(marker)) throw new Error(`Canonical Admin publication failed; missing ${marker}`);
}

const requiredPublishedFiles = [
  'admin.html', 'admin-railway.js', 'enterprise-apps.html', 'employee-login.html', 'employee-portal.html', 'employee-portal-railway.js',
  'my-work.html', 'notifications.html',
  'careers.html', 'applygeneral.html', 'applydsp.html', 'applylpn.html', 'applydoo.html',
  'employee360.html', 'education-portal.html', 'time-attendance.html', 'scheduling.html', 'intranet.html',
  'course-player.html', 'education-certificate.html', 'education-catalog.json',
  'intranet.HTML', 'policies.html', 'news.html', 'feedback.html', 'payroll.html',
  'benefits.html', 'employee-directory.html', 'leadership.html', 'support.html',
  'health-safety.html', 'careers-admin-workflow.js', 'interview-admin-scheduler.js',
  'favicon-48x48.png', 'assets/mainlogo.png',
  'assets/admin-shell.css', 'assets/admin-shell.js',
  'assets/admin-live-dashboard.js', 'assets/admin-enterprise-apps-launcher.js', 'assets/admin-company-settings.js', 'assets/admin-analog-clock.js',
  'assets/admin-service-home-management-v2.js', 'assets/admin-dashboard-cleanup.js', 'assets/admin-achieved-archive-fix.js',
  'assets/admin-client-service-requests.js', 'assets/admin-company-context.js', 'assets/sulandra-entity-context.js', 'assets/employee-work-crosslinks.js',
  'assets/education-runtime.js', 'assets/education-course.css', 'assets/education-portal-enhancements.js',
  'assets/spire-screen-controls.css', 'assets/spire-screen-controls.js',
  'assets/spire-results-workspace.js',
  'spire.html', 'spire-admin.html', 'services',
];
for (const relative of requiredPublishedFiles) {
  try { await stat(path.join(outputDirectory, relative)); }
  catch { throw new Error(`Static publication regression: missing ${relative}`); }
}

const publishedResultsWorkspace = await readFile(path.join(outputDirectory, 'assets', 'spire-results-workspace.js'), 'utf8');
if (!publishedResultsWorkspace.includes('SPIRE_RESULTS_IDEMPOTENT_TAB_LAYOUT')) {
  throw new Error('Static publication regression: SPIRE Results workspace can recreate the chart-tab MutationObserver loop');
}

await import('./verify-enterprise-apps-launchpad.mjs');
await import('./verify-admin-company-settings-backend.mjs');
await import('./verify-admin-canonical-source.mjs');

console.log('Static website published from canonical source files; SPIRE Results tab ordering is idempotent and cannot recreate the chart-opening mutation loop.');