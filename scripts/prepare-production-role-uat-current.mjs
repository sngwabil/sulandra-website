import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-role-uat.spec.mjs');
const source=await readFile(target,'utf8');

const requiredCurrentContract=[
  "#employeeStaticMyShift",
  "#employeeStaticSpire",
  "#employeeStaticSclsOperations",
  "#employeeStaticScheduling",
  "#employeeStaticNmtDispatch",
  "#employeeStaticNmtDriver",
  "#employeeStaticCompanyDocuments",
  "#employeeStaticEmployee360",
  "Sulandra management work email",
  "page.locator('#username')",
];

for(const marker of requiredCurrentContract){
  if(!source.includes(marker))throw new Error(`Production Role UAT current contract marker missing: ${marker}`);
}

if(source.includes('#employeeMyShiftLauncher')||source.includes('#employeeLiveSpireLauncher')){
  throw new Error('Production Role UAT still contains retired Employee Portal launcher selectors');
}

console.log('Production Role UAT current contract is already canonical; no runtime source rewriting is required.');
