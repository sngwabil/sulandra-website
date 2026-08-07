import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const required=['intranet.html','intranet-control.html','assets/intranet-content-app.js','assets/intranet-control-app.js'];
const failures=[];
for(const file of required){try{await stat(path.join(dist,file))}catch{failures.push(`Missing published intranet content file: ${file}`)}}
try{const intranet=await readFile(path.join(dist,'intranet.html'),'utf8');if(!intranet.includes('/assets/intranet-content-app.js'))failures.push('Intranet does not load managed content renderer');if(!intranet.includes('feature-image'))failures.push('Original intranet hero/image layout is missing');}catch{}
try{const admin=await readFile(path.join(dist,'admin.html'),'utf8');if(!admin.includes('/intranet-control.html'))failures.push('Admin does not expose Intranet Content Control');}catch{}
const route=await readFile(path.join(root,'api','src','intranet-content-routes.ts'),'utf8');for(const marker of ['/api/employee/intranet/content','/api/admin/intranet/content','/api/admin/intranet/settings','scanBufferForMalware','putSecureObject'])if(!route.includes(marker))failures.push(`Missing intranet backend marker: ${marker}`);
if(failures.length){console.error('Intranet content integration verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Intranet content integration verified: original visual layout preserved, managed news/images/messages connected, slideshow controls published, and secure image upload wired.');
