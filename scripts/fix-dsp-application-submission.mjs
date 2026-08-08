import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function repairFrontend(relativePath) {
  const file = path.join(root, relativePath);
  if (!(await exists(file))) return;
  let source = await readFile(file, 'utf8');
  const before = source;

  source = source
    .replaceAll('https://sulandra-website-production.up.railway.app', canonicalApi)
    .replace(/notes:\s*base\.why\s*\|\|\s*null,/g, "notes: String(base.why || '').trim() || undefined,");

  if (source !== before) await writeFile(file, source, 'utf8');
}

await repairFrontend('applydsp.html');
await repairFrontend('services/community-living/applydsp.html');

const careersPath = path.join(root, 'api/src/careers-routes.ts');
let careers = await readFile(careersPath, 'utf8');
const careersBefore = careers;
careers = careers.replace(
  "notes: z.string().max(12000).optional(),",
  "notes: z.string().max(12000).nullish(),",
);
if (careers !== careersBefore) await writeFile(careersPath, careers, 'utf8');

console.log('DSP application submission repaired: canonical API routing and nullable/blank notes validation are compatible.');
