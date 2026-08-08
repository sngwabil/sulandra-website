import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const expect = (label, ok) => { if (!ok) failures.push(label); };

const careers = await readFile(path.join(root, 'api/src/careers-routes.ts'), 'utf8');
expect('RN backend route uses applyrn.html', careers.includes("if (role === 'RN') return `/applyrn.html?opening=${encodeURIComponent(row.slug)}&role=RN`;"));
expect('RN routing precedes stored legacy applicationPath', careers.indexOf("if (role === 'RN')") < careers.indexOf('if (row.applicationPath) return row.applicationPath'));
expect('LPN retains applylpn.html', careers.includes("role === 'LPN' || role === 'DELEGATING_NURSE'") && careers.includes('/applylpn.html?opening='));

const generated = path.join(root, 'applyrn.html');
try { await access(generated); } catch { failures.push('root applyrn.html generated'); }
if (!failures.includes('root applyrn.html generated')) {
  const rn = await readFile(generated, 'utf8');
  expect('RN page heading', rn.includes('Application for: Registered Nurse (RN)'));
  expect('RN page defaults to RN', rn.includes('params.get("role") || "RN"'));
  expect('RN draft storage isolated', rn.includes('scls_apply_rn_v2_draft'));
  expect('RN license wording', rn.includes('RN license number'));
  expect('RN experience wording', rn.includes('Years of RN experience'));
}

const published = path.join(root, 'dist-web', 'applyrn.html');
try { await access(published); } catch { failures.push('dist-web/applyrn.html published'); }
if (!failures.includes('dist-web/applyrn.html published')) {
  const rn = await readFile(published, 'utf8');
  expect('published RN page uses canonical API', rn.includes('https://sulandra-website-production-5fc4.up.railway.app'));
  expect('published RN page is branded RN', rn.includes('Registered Nurse (RN)'));
}

if (failures.length) {
  console.error(`RN Careers routing verification failed (${failures.length}):`);
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('RN Careers routing verification passed.');
