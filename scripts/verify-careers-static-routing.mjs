import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const expect = (label, condition) => { checks.push(label); if (!condition) failures.push(label); };
const read = relative => readFile(path.join(root, relative), 'utf8');
const exists = async relative => { try { await access(path.join(root, relative)); return true; } catch { return false; } };

const staticBase = 'https://www.sulandrahealth.com';
const apiBase = 'https://sulandra-website-production-5fc4.up.railway.app';

for (const file of ['index.html','careers.html','applygeneral.html']) {
  expect(`${file} exists`, await exists(file));
}

const index = await read('index.html');
expect('home Careers navigation uses static frontend', index.includes(`${staticBase}/careers.html`));
expect('home does not use case-sensitive missing Careers.html route', !index.includes('/Careers.html'));

const careers = await read('careers.html');
expect('Careers page uses correct API base', careers.includes(`var API_BASE="${apiBase}"`));
expect('Careers page stays on static frontend', careers.includes(`${staticBase}/careers.html`));
expect('Careers application links are normalized to static frontend', careers.includes('STATIC_BASE+staticApplicationPath(job)'));
expect('Careers page rejects backend HTML destinations', careers.includes('if(parsed.origin===STATIC_BASE)'));
expect('Careers page loads public openings from API', careers.includes('/public/careers/openings'));
expect('Careers page contains no obsolete backend host', !careers.includes('sulandra-website-production.up.railway.app'));

const general = await read('applygeneral.html');
expect('general application uses correct API base', general.includes(`const API_BASE='${apiBase}'`));
expect('general application returns to static Careers page', general.includes(`${staticBase}/careers.html`));
expect('general application submits to public careers API', general.includes('/public/careers/applications'));

const build = await read('package.json');
expect('static routing repair runs before web build', build.includes('build:web') && build.includes('node scripts/fix-careers-static-routing.mjs'));
const repair = await read('scripts/fix-careers-static-routing.mjs');
expect('repair script resolves root from import.meta.url', repair.includes('fileURLToPath(import.meta.url)'));
expect('repair script pins static and API ownership', repair.includes(staticBase) && repair.includes(apiBase));

const owner = await read('api/src/owner-authority-routes.ts');
expect('owner trigger initialization is idempotent', owner.includes('IF NOT EXISTS') && owner.includes('pg_trigger'));

if (await exists('dist-web/careers.html')) {
  const dist = await read('dist-web/careers.html');
  expect('generated Careers page uses correct API base', dist.includes(apiBase));
  expect('generated Careers page uses static application links', dist.includes(staticBase));
}

if (failures.length) {
  console.error(`Careers static-routing verification failed (${failures.length}/${checks.length}):`);
  failures.forEach(item => console.error(` - ${item}`));
  process.exit(1);
}
console.log(`Careers static-routing verification passed (${checks.length} checks).`);
