import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repositoryRoot, 'dist-web');
const staleHost = 'https://sulandra-website-production.up.railway.app';
const liveHost = 'https://sulandra-website-production-5fc4.up.railway.app';
const editableExtensions = new Set(['.html', '.js', '.json', '.css']);
let changedFiles = 0;

async function patchDirectory(directory) {
  for (const entry of await readdir(directory)) {
    const fullPath = path.join(directory, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      await patchDirectory(fullPath);
      continue;
    }
    if (!editableExtensions.has(path.extname(entry).toLowerCase())) continue;
    const source = await readFile(fullPath, 'utf8');
    if (!source.includes(staleHost)) continue;
    await writeFile(fullPath, source.replaceAll(staleHost, liveHost), 'utf8');
    changedFiles += 1;
  }
}

await patchDirectory(outputRoot);
if (!changedFiles) {
  throw new Error('No stale Railway API host references were found in dist-web.');
}
console.log(`Updated Railway API host in ${changedFiles} static website file(s).`);
