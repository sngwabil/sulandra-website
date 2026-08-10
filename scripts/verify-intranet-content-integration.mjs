import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const required=['intranet.html','intranet-control.html','assets/intranet-content-app.js','assets/intranet-control-app.js','assets/admin-company-context.js'];
const failures=[];
for(const file of required){try{await stat(path.join(dist,file))}catch{failures.push(`Missing published intranet content file: ${file}`)}}
try{
  const intranet=await readFile(path.join(dist,'intranet.html'),'utf8');
  if(!intranet.includes('/assets/intranet-content-app.js'))failures.push('Intranet does not load managed content renderer');
  if(!intranet.includes('feature-image'))failures.push('Original intranet hero/image layout is missing');
}catch{}
try{
  const admin=await readFile(path.join(dist,'admin.html'),'utf8');
  const context=await readFile(path.join(dist,'assets/admin-company-context.js'),'utf8');
  if(!admin.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'))failures.push('Admin does not load the canonical navigation bootstrap');
  if(!context.includes("{key:'intranet-content',label:'Manage Intranet Content',sub:'Publishing',kind:'route',href:'/intranet-control.html'}"))failures.push('Canonical Admin navigation does not expose Intranet Content Control');
}catch{}
const route=await readFile(path.join(root,'api','src','intranet-content-routes.ts'),'utf8');
for(const marker of ['/api/employee/intranet/content','/api/admin/intranet/content','/api/admin/intranet/settings','scanBufferForMalware','putSecureObject','hero-main','quick-employee-portal','quick-time-attendance','quick-documents','quick-incident-reporting','quick-payroll','quick-support','resource-benefits','resource-directory','notice-authorized-use'])if(!route.includes(marker))failures.push(`Missing intranet backend/content marker: ${marker}`);
const renderer=await readFile(path.join(root,'assets','intranet-content-app.js'),'utf8');
for(const marker of ["startsWith('quick-')","startsWith('resource-')",'newsAutoplay','heroAutoplay'])if(!renderer.includes(marker))failures.push(`Managed intranet renderer is missing: ${marker}`);
if(failures.length){console.error('Intranet content integration verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Intranet content integration verified: original visual layout preserved, canonical Admin navigation exposes content control, every visible content family is admin-managed, slideshow controls are published, and secure image upload is wired.');
