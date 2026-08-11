import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedExtensions = new Set(['.html', '.js', '.css']);
// dist-web is generated output. Never mutate it here: this script runs more than
// once in build:web, including after build-static-site.mjs, and post-copy Admin
// changes violate the canonical Admin source contract.
const skipDirectories = new Set(['.git', 'node_modules', 'api', 'prisma', 'scripts', 'dist-web']);
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

// Admin's Director of Operations job preset historically stored multiline text in
// ordinary double-quoted JavaScript strings. Browsers reject literal line breaks
// in those strings (the admin.html:881 Invalid or unexpected token seen in
// production). Keep the content unchanged but serialize those three values with
// escaped newlines before static publication.
const adminPath = path.join(root, 'admin.html');
let admin = await readFile(adminPath, 'utf8');
const presetStart = admin.indexOf('const jobPresets = {');
const dspStart = presetStart >= 0 ? admin.indexOf('      dsp:', presetStart) : -1;
if (presetStart >= 0 && dspStart > presetStart) {
  const before = admin.slice(0, presetStart);
  let firstPreset = admin.slice(presetStart, dspStart);
  const after = admin.slice(dspStart);
  firstPreset = firstPreset.replace(
    /(description:\s*)"([\s\S]*?)"(,\s*\n\s*reqs:)/,
    (_match, lead, value, tail) => `${lead}${JSON.stringify(value)}${tail}`,
  );
  firstPreset = firstPreset.replace(
    /(reqs:\s*)"([\s\S]*?)"(,\s*\n\s*benefits:)/,
    (_match, lead, value, tail) => `${lead}${JSON.stringify(value)}${tail}`,
  );
  firstPreset = firstPreset.replace(
    /(benefits:\s*)"([\s\S]*?)"(\s*\n\s*},)/,
    (_match, lead, value, tail) => `${lead}${JSON.stringify(value)}${tail}`,
  );
  const repaired = before + firstPreset + after;
  if (repaired !== admin) {
    admin = repaired;
    await writeFile(adminPath, admin, 'utf8');
    updated += 1;
  }
}

const dooPath = path.join(root, 'applydoo.html');
const doo = await readFile(dooPath, 'utf8');
if (!doo.includes('Director of Operations (DOO)')) throw new Error('Director of Operations application is missing its DOO identity.');
if (!doo.includes("appliedRole:'DOO'")) throw new Error('Director of Operations application is not submitting the DOO role.');
if (!doo.includes('/public/careers/applications')) throw new Error('Director of Operations application is not connected to Careers intake.');
if (/Chief Operating Officer|\bCOO\b/.test(doo)) throw new Error('Retired executive-role wording remains in the DOO application.');

console.log(`Director of Operations frontend enforcement updated ${updated} canonical user-facing file(s), including valid Admin job-preset JavaScript; generated dist-web is never mutated.`);
