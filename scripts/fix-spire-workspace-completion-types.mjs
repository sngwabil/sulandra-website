import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','spire-workspace-completion-routes.ts');
let source=await readFile(target,'utf8');
const replacements=[
  [
    ');const out=[];for(const row of rows){const patientId=',
    ');const out:Array<Record<string,unknown>>=[];for(const row of rows){const patientId=',
  ],
  [
    ')]);const out=[];for(const row of [...orders,...meds]){const patientId=',
    ')]);const out:Array<Record<string,unknown>>=[];for(const row of [...orders,...meds]){const patientId=',
  ],
];
let changed=false;
for(const [before,after] of replacements){
  if(source.includes(before)){source=source.replace(before,after);changed=true;}
}
for(const required of [
  'const out:Array<Record<string,unknown>>=[];for(const row of rows)',
  'const out:Array<Record<string,unknown>>=[];for(const row of [...orders,...meds])',
]){
  if(!source.includes(required))throw new Error(`SPIRE workspace TypeScript repair invariant missing: ${required}`);
}
if(changed)await writeFile(target,source,'utf8');
console.log(changed?'SPIRE workspace task/order row arrays now preserve Record<string, unknown> typing.':'SPIRE workspace task/order row arrays are already build-safe.');
