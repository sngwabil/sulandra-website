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

const frontendPath=path.join(root,'assets/admin-employee-documents.js');
try {
  let frontend=await readFile(frontendPath,'utf8');
  frontend=frontend.replace(/const token=\(\)=>[^;]+;/,"const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';");
  frontend=frontend.replace(/'Authorization':`Bearer \$\{token\(\)\}`,(?!\.\.\.\(window\.SulandraCompanyContext)/g,"'Authorization':`Bearer ${token()}`,...(window.SulandraCompanyContext?.headers?.()||{}),");
  await writeFile(frontendPath,frontend,'utf8');
  console.log('Employee 360 prior-section validations recognize document and e-signature route registration; Admin Documents uses canonical authentication/company scope.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.log('Employee documents backend/verifier integration is build-safe; frontend asset is not present in this API build image.');
}
