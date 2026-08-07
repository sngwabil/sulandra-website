import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'api', 'src');
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { await walk(target); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const source = await readFile(target, 'utf8');
    if (/Chief Operating Officer|\bCOO\b/.test(source)) findings.push(path.relative(root, target));
  }
}

await walk(root);
if (findings.length) throw new Error(`Retired executive-role wording remains in active backend sources after DOO enforcement: ${findings.join(', ')}`);
console.log('Active backend role terminology verified: Director of Operations / DOO only.');
