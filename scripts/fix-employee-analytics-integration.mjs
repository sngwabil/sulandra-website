import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const replacements=[
 ['scripts/verify-employee-assets-access.mjs',"${assetsAccessRegister}\\n\\n${careersRegister}","${assetsAccessRegister}\\n${analyticsRegister}\\n\\n${careersRegister}"],
 ['scripts/verify-employee-leave-offboarding.mjs',"${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n\\n${careersRegister}","${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n${analyticsRegister}\\n\\n${careersRegister}"],
 ['scripts/verify-employee-compensation.mjs',"${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n\\n${careersRegister}","${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n${analyticsRegister}\\n\\n${careersRegister}"],
 ['scripts/verify-employee-performance.mjs',"${performanceRegister}\\n${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n\\n${careersRegister}","${performanceRegister}\\n${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n${analyticsRegister}\\n\\n${careersRegister}"],
 ['scripts/verify-employee-collaboration.mjs',"${collaborationRegister}\\n${performanceRegister}\\n${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n\\n${careersRegister}","${collaborationRegister}\\n${performanceRegister}\\n${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n${analyticsRegister}\\n\\n${careersRegister}"],
 ['scripts/verify-employee-compliance.mjs',"${complianceRegister}\\n${collaborationRegister}\\n${performanceRegister}\\n${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n\\n${careersRegister}","${complianceRegister}\\n${collaborationRegister}\\n${performanceRegister}\\n${compensationRegister}\\n${leaveOffboardingRegister}\\n${assetsAccessRegister}\\n${analyticsRegister}\\n\\n${careersRegister}"]
];
for(const [file,from,to] of replacements){const target=path.join(root,file);let source=await readFile(target,'utf8');if(source.includes(from)){source=source.replace(from,to);await writeFile(target,source,'utf8')}}
console.log('Employee 360 prior-section validations recognize analytics and reporting route registration.');
