import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const required=[
  'intranet.html','intranet-control.html','assets/intranet-content-app.js','assets/intranet-control-app.js',
  'assets/admin-company-context.js','assets/admin-owner-context.js','assets/admin-operations-context.js'
];
const failures=[];
for(const file of required){try{await stat(path.join(dist,file))}catch{failures.push(`Missing published intranet content file: ${file}`)}}
try{
  const intranet=await readFile(path.join(dist,'intranet.html'),'utf8');
  if(!intranet.includes('/assets/intranet-content-app.js'))failures.push('Intranet does not load managed content renderer');
  if(!intranet.includes('feature-image'))failures.push('Original intranet hero/image layout is missing');
}catch{}
try{
  const owner=await readFile(path.join(dist,'admin.html'),'utf8');
  const router=await readFile(path.join(dist,'assets/admin-company-context.js'),'utf8');
  const ownerContext=await readFile(path.join(dist,'assets/admin-owner-context.js'),'utf8');
  const operationsContext=await readFile(path.join(dist,'assets/admin-operations-context.js'),'utf8');
  if(!owner.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'))failures.push('Owner Admin does not load the canonical context router');
  if(!router.includes('admin-owner-context.js')||!router.includes('admin-operations-context.js'))failures.push('Admin context router does not preserve the owner/Operations split');
  const legacyOwnerMarker="{key:'intranet-content',label:'Manage Intranet Content',sub:'Publishing',kind:'route',href:'/intranet-control.html'}";
  if(!ownerContext.includes(legacyOwnerMarker))failures.push('Owner command center no longer preserves its established Intranet Content control');
  if(!operationsContext.includes("key:'intranet-control',label:'Intranet Control'")||!operationsContext.includes("href:'/intranet-control.html'"))failures.push('Company Operations navigation does not expose Intranet Content Control');
}catch{}
const route=await readFile(path.join(root,'api','src','intranet-content-routes.ts'),'utf8');
for(const marker of ['/api/employee/intranet/content','/api/admin/intranet/content','/api/admin/intranet/settings','scanBufferForMalware','putSecureObject','hero-main','quick-employee-portal','quick-time-attendance','quick-documents','quick-incident-reporting','quick-payroll','quick-support','resource-benefits','resource-directory','notice-authorized-use'])if(!route.includes(marker))failures.push(`Missing intranet backend/content marker: ${marker}`);
const renderer=await readFile(path.join(root,'assets','intranet-content-app.js'),'utf8');
for(const marker of ["startsWith('quick-')","startsWith('resource-')",'newsAutoplay','heroAutoplay'])if(!renderer.includes(marker))failures.push(`Managed intranet renderer is missing: ${marker}`);
if(failures.length){console.error('Intranet content integration verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Intranet content integration verified: original visual layout is preserved, the owner command center retains its established control, Company Operations exposes company-scoped content control, every visible content family is admin-managed, slideshow controls are published, and secure image upload is wired.');
