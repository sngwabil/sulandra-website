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

const portalPath=path.join(root,'it-solutions.html');
let portal=await readFile(portalPath,'utf8');
const educationAutonomy='Routine work executes from your instruction. Education stays in one reviewable campaign until you say “send.” Only approval-required system changes show decision buttons.';
const releaseContract='Routine authorized work executes immediately. Routine work executes from your instruction. Education stays in one reviewable campaign until you say “send.” Only approval-required system changes show decision buttons; only major changes pause for owner approval.';
if(portal.includes(educationAutonomy))portal=portal.replace(educationAutonomy,releaseContract);
else if(!portal.includes('Routine authorized work executes immediately')||!portal.includes('only major changes pause for owner approval'))throw new Error('IT Solutions autonomy publication contract changed');
await writeFile(portalPath,portal,'utf8');

console.log('Static publication requires the education campaign review page and preserves the Section 9D immediate-routine/owner-major-change autonomy contract.');
