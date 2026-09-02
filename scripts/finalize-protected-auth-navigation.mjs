import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

async function updatePage(relativePath, transform) {
  const target = path.join(dist, relativePath);
  let html;
  try { html = await readFile(target, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  const next = transform(html);
  if (next !== html) await writeFile(target, next, 'utf8');
}

await updatePage('employee-portal.html', (html) => html
  .replace(/\s*<a\s+id=["']employeeAdminReturn["'][\s\S]*?<\/a>\s*/i, '\n')
);

await updatePage('employee-login.html', (html) => html
  .replace(/employee-login-railway\.js\?v=[^"']+/g, 'employee-login-railway.js?v=20260902-protected-session-2')
);

await updatePage('admin-login.html', (html) => html
  .replace(/admin-login-railway\.js\?v=[^"']+/g, 'admin-login-railway.js?v=20260902-protected-session-2')
);

await updatePage(path.join('spire', 'login.html'), (html) => html
  .replace(/spire-login\.js\?v=[^"']+/g, 'spire-login.js?v=20260902-spire-native-login-2')
);

await updatePage('sulandra-session.html', (html) => html
  .replace(/sulandra-protected-session\.js\?v=[^"']+/g, 'sulandra-protected-session.js?v=20260902-protected-session-2')
);

const employeePortal = await readFile(path.join(dist, 'employee-portal.html'), 'utf8').catch(() => '');
if (employeePortal.includes('id="employeeAdminReturn"') || employeePortal.includes("id='employeeAdminReturn'")) {
  throw new Error('Employee Portal publication still exposes the Admin return shortcut.');
}

const spireLogin = await readFile(path.join(dist, 'spire', 'login.html'), 'utf8').catch(() => '');
if (!spireLogin.includes('S.P.I.R.E. Sign In') || !spireLogin.includes('20260902-spire-native-login-2')) {
  throw new Error('S.P.I.R.E. native sign-in publication is missing.');
}

console.log('Protected auth navigation finalized: Employee/Admin/S.P.I.R.E. use one fullscreen session boundary and Employee Portal exposes no Admin shortcut.');
