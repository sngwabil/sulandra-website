import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routePath=path.join(root,'api/src/employee-bulk-data-routes.ts');
await access(routePath);
const routeSource=await readFile(routePath,'utf8');
if(!routeSource.includes('registerEmployeeBulkDataRoutes')) throw new Error('Employee bulk-data route module is missing its registration export.');
const bootstrapPath=path.join(root,'api/src/onboarding-bootstrap.ts');
const bootstrap=await readFile(bootstrapPath,'utf8');
if(!bootstrap.includes('registerEmployeeBulkDataRoutes({ app, prisma')) throw new Error('Employee bulk-data routes are not registered in the backend bootstrap.');

const frontendPath=path.join(root,'assets/admin-employee-bulk-data.js');
try {
  let frontend=await readFile(frontendPath,'utf8');
  frontend=frontend.replace(/const token=\(\)=>[^;]+;/,"const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';");
  frontend=frontend.replace(/'Authorization':`Bearer \$\{token\(\)\}`,(?!\.\.\.\(window\.SulandraCompanyContext)/g,"'Authorization':`Bearer ${token()}`,...(window.SulandraCompanyContext?.headers?.()||{}),");
  await writeFile(frontendPath,frontend,'utf8');
  console.log('Employee 360 bulk data integration is build-safe and uses canonical Admin authentication/company scope.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.log('Employee bulk-data backend integration verified; frontend asset is not present in this API build image.');
}
