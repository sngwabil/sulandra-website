import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files={routes:'api/src/it-solutions-routes.ts',portal:'it-solutions.html',architecture:'IT_SOLUTIONS_ARCHITECTURE.md'};
for(const [name,relative] of Object.entries(files)){const source=await readFile(path.join(root,relative),'utf8');if(!source.trim())throw new Error(`${name} is empty`)}
const routes=await readFile(path.join(root,files.routes),'utf8');
for(const marker of ['ITRemoteAssistSession','ITDiagnosticEvidence','ITSupportScreenshot','ITRemediationApproval','consent:z.literal(true)','employeeCanStop:true','/api/it-solutions/overview','/api/it-solutions/remote-assist/sessions','/api/it-solutions/screenshots','/api/it-solutions/evidence','/api/it-solutions/remediations'])if(!routes.includes(marker))throw new Error(`IT Solutions route missing ${marker}`);
const portal=await readFile(path.join(root,files.portal),'utf8');
for(const marker of ['Sulandra IT Solutions','Operations Overview','Incident Queue','System Diagnostics','Remote Assistance','Admin Approval Queue','Resolved Compliance Archive','employee can stop sharing'])if(!portal.toLowerCase().includes(marker.toLowerCase()))throw new Error(`IT Solutions portal missing ${marker}`);
const architecture=await readFile(path.join(root,files.architecture),'utf8');
for(const marker of ['User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> Triage -> Resolution/Approval -> Verification -> Archive','GitHub and Railway are first-class IT evidence sources','Remote assistance is support, not surveillance','Clock-in/geofence evidence is one evidence source only'])if(!architecture.includes(marker))throw new Error(`IT Solutions architecture missing ${marker}`);
console.log('IT Solutions powerhouse architecture, consented remote assistance, evidence, approvals, and portal markers verified.');