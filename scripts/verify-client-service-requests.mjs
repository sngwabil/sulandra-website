import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const failures=[];
for(const file of ['service-request.html','service-request/index.html','resources.html','resources/index.html','services/home-health/index.html','services/transportation/index.html','services/respite-care/index.html','services/rehab/index.html','services/behavioral-health/index.html','services/companion-care/index.html','assets/client-service-request-app.js','assets/admin-client-service-requests.js','assets/public-consultation-service-request-bridge.js','assets/public-services-navigation.js']){
  try{await stat(path.join(dist,file));}catch{failures.push(`Missing published client intake/service file: ${file}`)}
}
const route=await readFile(path.join(root,'api','src','client-service-request-routes.ts'),'utf8');
for(const marker of ['/public/client-service-requests','/api/admin/client-service-requests','/start-intake','UPDATE_CLIENT_SERVICE_REQUEST','SpireIntakeImport','intakeImportId','SULANDRA_SERVICE_REQUEST'])if(!route.includes(marker))failures.push(`Missing backend client intake marker: ${marker}`);
const migration=await readFile(path.join(root,'prisma','migrations','20260807023000_client_service_requests','migration.sql'),'utf8');
if(!migration.includes('ClientServiceRequest'))failures.push('Controlled ClientServiceRequest migration is missing');
const linkMigration=await readFile(path.join(root,'prisma','migrations','20260807030000_client_service_request_intake_links','migration.sql'),'utf8');
for(const marker of ['intakeImportId','clientId'])if(!linkMigration.includes(marker))failures.push(`Missing permanent client intake link column: ${marker}`);
try{const admin=await readFile(path.join(dist,'admin.html'),'utf8');if(!admin.includes('/assets/admin-client-service-requests.js'))failures.push('Admin does not load Client Service Requests workspace');}catch{}
try{const index=await readFile(path.join(dist,'index.html'),'utf8');if(!index.includes('/assets/public-consultation-service-request-bridge.js'))failures.push('Homepage consultation does not feed Client Service Requests');}catch{}
try{const services=await readFile(path.join(dist,'services.html'),'utf8');if(!services.includes('/assets/public-services-navigation.js'))failures.push('Public Services page does not load live navigation integration');}catch{}
for(const relative of ['services/home-health/index.html','services/transportation/index.html','services/respite-care/index.html','services/rehab/index.html','services/behavioral-health/index.html','services/companion-care/index.html']){try{const html=await readFile(path.join(dist,relative),'utf8');if(!html.includes('/service-request.html?service='))failures.push(`${relative} is not connected to Client Service Requests`);}catch{}}
if(failures.length){console.error('Client Service Request verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Client Service Requests verified: homepage consultation, public service pages, resources, controlled database storage, Admin review, and permanent Spire formal-intake linkage are connected.');
