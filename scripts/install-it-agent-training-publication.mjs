import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'scripts','build-static-site.mjs');
let source=await readFile(target,'utf8');
if(!source.includes("'education-campaign.html'")){
  const anchor="'employee360.html','education-portal.html','time-attendance.html'";
  if(!source.includes(anchor))throw new Error('Static publication education-file anchor changed');
  source=source.replace(anchor,"'employee360.html','education-portal.html','education-campaign.html','time-attendance.html'");
}
await writeFile(target,source,'utf8');
console.log('Static publication now fails closed if the secure education campaign review/attestation page is missing.');
