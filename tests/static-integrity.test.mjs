import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('builds are deterministic and do not rewrite source or compiled output', async () => {
  const [rootPackage, apiPackage] = await Promise.all([read('package.json'), read('api/package.json')]);
  for (const obsolete of ['patch-admin-interview-calendar', 'inject-clinical-routes', 'fix-audit-enum-casts', 'install-department-routing']) {
    assert.equal(rootPackage.includes(obsolete) || apiPackage.includes(obsolete), false, obsolete);
  }
  assert.match(rootPackage, /"build:web": "node scripts\/build-static-site\.mjs"/);
  assert.match(apiPackage, /"build": "tsc -p tsconfig\.json"/);
});

test('production workflows fail closed and use live persistence endpoints', async () => {
  const [employee, workspace, applicant, login] = await Promise.all([
    read('employee-portal.html'),
    read('spire-workspace.html'),
    read('applicant-portal.html'),
    read('employee-login.html'),
  ]);
  assert.doesNotMatch(employee, /submitted \(demo\)|saved as draft \(demo\)/i);
  assert.doesNotMatch(workspace, /function demo\(|Assigned Client.*Morning medications/);
  assert.match(workspace, /\/api\/spire\/notes/);
  assert.match(workspace, /\/api\/spire\/vitals/);
  assert.match(applicant, /escapeHtml\(item\.note/);
  assert.doesNotMatch(login, /Development preview access|Open S\.P\.I\.R\.E\. Demo/);
});

test('browser-local administrator previews are not deployed', async () => {
  for (const page of ['admin-setup.html', 'admin-users.html', 'admin-profile.html', 'spire-demo.html']) {
    await assert.rejects(access(new URL(`../${page}`, import.meta.url)));
  }
});

test('public forms and recovery have registered backend routes', async () => {
  const bootstrap = await read('api/src/onboarding-bootstrap.ts');
  assert.match(bootstrap, /registerConsultationRoutes\(app, prisma\)/);
  assert.match(bootstrap, /registerAuthRecoveryRoutes\(app, prisma\)/);
  assert.match(bootstrap, /express\.json\(\{ limit: '1mb' \}\)/);
});

test('deployment publishes the full static site and same-origin API proxy', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.equal(config.outputDirectory, 'dist-web');
  assert.ok(config.rewrites.some((rewrite) => rewrite.source === '/api/:path*'));
  assert.ok(config.rewrites.some((rewrite) => rewrite.source === '/public/:path*'));
});
