import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('api/src');
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
      .replaceAll('"COO"', '"DOO"');

    if (revised !== original) {
      await writeFile(fullPath, revised, 'utf8');
      updated += 1;
    }
  }
}

await walk(root);
console.log(`DOO role compatibility repair applied to ${updated} TypeScript file(s).`);
