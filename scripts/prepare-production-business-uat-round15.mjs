import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-business-path-uat.spec.mjs');
let source=await readFile(target,'utf8');

function replaceExact(from,to,label){
  if(source.includes(to)&&!source.includes(from))return;
  if(!source.includes(from))throw new Error(`Round-fifteen business UAT anchor missing: ${label}`);
  source=source.replace(from,to);
}

replaceExact(
  "async function clickVisible(page,matcher){\n  const control=typeof matcher==='string'?page.locator(matcher).first():page.getByRole(matcher.role||'button',{name:matcher.name,exact:matcher.exact??false}).first();\n  await expect(control).toBeVisible();await control.click();return control;\n}",
  "async function clickVisible(page,matcher){\n  const matches=typeof matcher==='string'?page.locator(matcher):page.getByRole(matcher.role||'button',{name:matcher.name,exact:matcher.exact??false});\n  const count=await matches.count();\n  for(let i=0;i<count;i++){\n    const control=matches.nth(i);\n    if(await control.isVisible().catch(()=>false)){await control.click();return control;}\n  }\n  const control=matches.first();\n  await expect(control).toBeVisible();await control.click();return control;\n}",
  'visible duplicate-safe control selection',
);

const before=source;
source=source
  .replaceAll('{patient,flags:[],allergies:[],medications:[]}','{...patient,flags:[],allergies:[],medications:[]}')
  .replaceAll('{patient,flags:[],allergies:[],medications:[med]}','{...patient,flags:[],allergies:[],medications:[med]}');

if(/\{patient,flags:\[\],allergies:\[\],medications:/.test(source)){
  throw new Error('Round-fifteen business UAT still contains a nested SPIRE patient detail fixture');
}

const replacements=(before.match(/\{patient,flags:\[\],allergies:\[\],medications:/g)||[]).length;
await writeFile(target,source,'utf8');
console.log(`Applied round-fifteen Item 7 corrections: visible duplicate-safe controls and ${replacements} remaining nested SPIRE patient detail fixtures normalized to the live top-level patient contract.`);
