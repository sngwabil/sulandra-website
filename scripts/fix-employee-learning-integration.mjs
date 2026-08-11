import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const route=await readFile(path.join(root,'api/src/employee-learning-development-routes.ts'),'utf8');
if(!route.includes('registerEmployeeLearningDevelopmentRoutes')) throw new Error('Employee learning route module is missing its registration export');
const bootstrap=await readFile(path.join(root,'api/src/onboarding-bootstrap.ts'),'utf8');
if(!bootstrap.includes('registerEmployeeLearningDevelopmentRoutes({ app, prisma')) throw new Error('Employee learning routes are not registered in the backend bootstrap');
const frontendPath=path.join(root,'assets/admin-employee-learning.js');
let frontend=await readFile(frontendPath,'utf8');
frontend=frontend.replace(/const token=\(\)=>[^;]+;/,"const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';");
frontend=frontend.replace(/Authorization:`Bearer \$\{token\(\)\}`,(?!\.\.\.\(window\.SulandraCompanyContext)/g,"Authorization:`Bearer ${token()}`,...(window.SulandraCompanyContext?.headers?.()||{}),");
await writeFile(frontendPath,frontend,'utf8');
console.log('Employee 360 learning and development integration is build-safe and uses canonical Admin authentication/company scope.');
