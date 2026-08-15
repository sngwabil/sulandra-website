import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'api', 'src');
let updated = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;

    const original = await readFile(fullPath, 'utf8');
    const revised = original
      .replaceAll('UserRole.COO', 'UserRole.DOO')
      .replaceAll("'COO'", "'DOO'")
      .replaceAll('"COO"', '"DOO"')
      .replaceAll('Chief Operating Officer', 'Director of Operations')
      .replaceAll('chief operating officer', 'director of operations')
      .replaceAll('chief-operating-officer-coo', 'director-of-operations-doo')
      .replaceAll('/applycoo.html', '/applydoo.html')
      .replaceAll('applycoo.html', 'applydoo.html')
      .replaceAll('\\bcoo\\b', '\\bdoo\\b');

    if (revised !== original) {
      await writeFile(fullPath, revised, 'utf8');
      updated += 1;
    }
  }
}

await walk(root);
await import('./install-spire-medication-safety-platform.mjs');
console.log(`Director of Operations role enforcement applied to ${updated} TypeScript file(s); SPIRE medication safety routes installed.`);
