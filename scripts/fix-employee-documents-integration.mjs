import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function replaceIn(relativePath,replacements){
  const target=path.join(root,relativePath);
  let source=await readFile(target,'utf8');
  let changed=false;
  for(const [from,to] of replacements){if(source.includes(from)){source=source.replace(from,to);changed=true}}
  if(changed)await writeFile(target,source,'utf8');
}
await replaceIn('scripts/verify-employee-analytics.mjs',[[
  "installer.includes('${assetsAccessRegister}\\\\n${analyticsRegister}\\\\n\\\\n${careersRegister}')",
  "installer.includes('${assetsAccessRegister}\\\\n${analyticsRegister}\\\\n${documentsRegister}\\\\n\\\\n${careersRegister}')",
]]).catch(()=>undefined);
await replaceIn('scripts/verify-employee-assets-access.mjs',[[
  "installer.includes('${leaveOffboardingRegister}\\\\n${assetsAccessRegister}\\\\n${analyticsRegister}\\\\n\\\\n${careersRegister}')",
  "installer.includes('${leaveOffboardingRegister}\\\\n${assetsAccessRegister}\\\\n${analyticsRegister}\\\\n${documentsRegister}\\\\n\\\\n${careersRegister}')",
]]).catch(()=>undefined);
await replaceIn('scripts/verify-employee-leave-offboarding.mjs',[[
  "installer.includes('${compensationRegister}\\\\n${leaveOffboardingRegister}\\\\n${assetsAccessRegister}\\\\n${analyticsRegister}\\\\n\\\\n${careersRegister}')",
  "installer.includes('${compensationRegister}\\\\n${leaveOffboardingRegister}\\\\n${assetsAccessRegister}\\\\n${analyticsRegister}\\\\n${documentsRegister}\\\\n\\\\n${careersRegister}')",
]]).catch(()=>undefined);
console.log('Employee 360 prior-section validations recognize document and e-signature route registration.');
