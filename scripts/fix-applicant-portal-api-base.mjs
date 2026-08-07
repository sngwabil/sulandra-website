import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'applicant-portal.html');
const canonical='https://sulandra-website-production-5fc4.up.railway.app';
const stale='https://sulandra-website-production.up.railway.app';
let source=await readFile(target,'utf8');
source=source.replaceAll(stale,canonical);
if(!source.includes(canonical))throw new Error('Applicant Portal does not reference the canonical Railway API');
await writeFile(target,source,'utf8');
console.log('Applicant Portal API base is canonical.');
