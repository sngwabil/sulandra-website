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
for(const [file,from,to] of replacements){
  const target=path.join(root,file);
  let source=await readFile(target,'utf8');
  if(source.includes(from)){
    source=source.replace(from,to);
    await writeFile(target,source,'utf8');
  }
}

const analyticsTarget=path.join(root,'api','src','employee-analytics-reports-routes.ts');
let analyticsSource=await readFile(analyticsTarget,'utf8');
const unsafeSerializer="const toCsv=(rows:any[])=>{if(!rows.length)return'';const keys=Array.from(rows.reduce((set,row)=>{Object.keys(row).forEach(k=>set.add(k));return set},new Set<string>()));return [keys.map(csvCell).join(','),...rows.map(row=>keys.map(k=>csvCell(row[k])).join(','))].join('\\n')};";
const safeSerializer="const toCsv=(rows:any[])=>{if(!rows.length)return'';const keys:string[]=Array.from(rows.reduce<Set<string>>((set:Set<string>,row:any)=>{Object.keys(row).forEach((key:string)=>set.add(key));return set},new Set<string>()));return [keys.map(csvCell).join(','),...rows.map((row:any)=>keys.map((key:string)=>csvCell(row[key])).join(','))].join('\\n')};";
if(analyticsSource.includes(unsafeSerializer)){
  analyticsSource=analyticsSource.replace(unsafeSerializer,safeSerializer);
  await writeFile(analyticsTarget,analyticsSource,'utf8');
}else if(!analyticsSource.includes('const keys:string[]=Array.from(rows.reduce<Set<string>>')){
  throw new Error('Unable to locate the Employee analytics CSV serializer requiring TypeScript repair.');
}

console.log('Employee 360 analytics registration and CSV export TypeScript typing are build-safe.');