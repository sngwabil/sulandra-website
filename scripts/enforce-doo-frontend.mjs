import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedExtensions = new Set(['.html', '.js', '.css']);
const skipDirectories = new Set(['.git', 'node_modules', 'api', 'prisma', 'scripts']);
let updated = 0;

function revise(source) {
  return source
    .replaceAll('/applycoo.html', '/applydoo.html')
    .replaceAll('applycoo.html', 'applydoo.html')
    .replaceAll('chief-operating-officer-coo', 'director-of-operations-doo')
    .replace(/Chief Operating Officer/gi, 'Director of Operations')
    .replace(/\bCOO\b/g, 'DOO')
    .replace(/\bcoo\b/g, 'doo');
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(target);
      continue;
    }
    if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const original = await readFile(target, 'utf8');
    const revised = revise(original);
    if (revised !== original) {
      await writeFile(target, revised, 'utf8');
      updated += 1;
    }
  }
}

await walk(root);

const dooPath = path.join(root, 'applydoo.html');
const doo = await readFile(dooPath, 'utf8');
if (!doo.includes('Director of Operations (DOO)')) throw new Error('Director of Operations application is missing its DOO identity.');
if (!doo.includes("appliedRole:'DOO'")) throw new Error('Director of Operations application is not submitting the DOO role.');
if (!doo.includes('/public/careers/applications')) throw new Error('Director of Operations application is not connected to Careers intake.');
if (/Chief Operating Officer|\bCOO\b/.test(doo)) throw new Error('Retired executive-role wording remains in the DOO application.');

console.log(`Director of Operations frontend enforcement updated ${updated} user-facing file(s).`);
