import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const dooPath = path.join(dist, 'applydoo.html');
const legacyPath = path.join(dist, 'applycoo.html');

const doo = await readFile(dooPath, 'utf8');
const legacy = await readFile(legacyPath, 'utf8');

if (!doo.includes('Director of Operations (DOO)')) throw new Error('Published DOO application is missing its role identity.');
if (!doo.includes("appliedRole:'DOO'")) throw new Error('Published DOO application does not submit the DOO role.');
if (!doo.includes('https://sulandra-website-production-5fc4.up.railway.app')) throw new Error('Published DOO application does not use the canonical Railway API.');
if (!legacy.includes('/applydoo.html')) throw new Error('Legacy executive application route does not redirect to the DOO application.');

const findings = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { await walk(target); continue; }
    if (!entry.isFile() || !['.html','.js','.css'].includes(path.extname(entry.name).toLowerCase())) continue;
    const source = await readFile(target, 'utf8');
    if (/Chief Operating Officer|\bCOO\b/.test(source)) findings.push(path.relative(dist, target));
  }
}
await walk(dist);
if (findings.length) throw new Error(`Retired executive-role wording remains in published files: ${findings.slice(0,20).join(', ')}`);

console.log('Director of Operations publishing verified: DOO application, role submission, legacy redirect, and user-facing terminology are consistent.');
