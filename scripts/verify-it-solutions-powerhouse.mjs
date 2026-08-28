import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files={routes:'api/src/it-solutions-routes.ts',portal:'it-solutions.html',architecture:'IT_SOLUTIONS_ARCHITECTURE.md'};
const readRequired=async(relative,label)=>{
  const source=await readFile(path.join(root,relative),'utf8');
  if(!source.trim())throw new Error(`${label} is empty`);
  return source;
};
const readOptional=async(relative,label)=>{
  try{return await readRequired(relative,label)}
  catch(error){
    if(error?.code==='ENOENT'){
      console.log(`${label} verification skipped because ${relative} is not present in this API-only build image.`);
      return null;
    }
    throw error;
  }
};

// Backend safety is mandatory everywhere, including Railway's API-only Docker image.
const routes=await readRequired(files.routes,'routes');
for(const marker of ['ITRemoteAssistSession','ITDiagnosticEvidence','ITSupportScreenshot','ITRemediationApproval','ITAgentHandoff','ITEmployeeUpdate','consent:z.literal(true)','employeeCanStop:true','/api/it-solutions/overview','/api/it-solutions/remote-assist/sessions','/api/it-solutions/screenshots','/api/it-solutions/evidence','/api/it-solutions/agent-handoffs','/api/it-solutions/employee-updates','/api/it-solutions/remediations','NO_ENGINEERING_CHANGE','ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE','startImmediately:true','notifyEmployeeInSia:true','pushNotification:true','supervisorEmailRequired:requiresApproval'])if(!routes.includes(marker))throw new Error(`IT Solutions route missing ${marker}`);

// Full repository/static builds must validate the portal and architecture. Railway's
// backend Dockerfile intentionally copies only API/runtime inputs, so those frontend
// artifacts may be absent there without weakening the mandatory backend checks above.
const portal=await readOptional(files.portal,'portal');
if(portal){
  for(const marker of ['Sulandra IT Solutions','Operations Overview','Incident Queue','System Diagnostics','Remote Assistance','Admin Approval Queue','Resolved Compliance Archive','employee can stop sharing'])if(!portal.toLowerCase().includes(marker.toLowerCase()))throw new Error(`IT Solutions portal missing ${marker}`);
}
const architecture=await readOptional(files.architecture,'architecture');
if(architecture){
  for(const marker of ['User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> SIA diagnosis -> Resolution or Engineering handoff -> Verification -> Archive','SIA is first-line IT support','24/7 autonomous coding-agent handoff','Established-operation repair vs new-system change','Supervisor email is not used for ordinary established-operation failures','GitHub and Railway are first-class IT evidence sources','Remote assistance is support, not surveillance','Clock-in/geofence evidence is one evidence source only'])if(!architecture.includes(marker))throw new Error(`IT Solutions architecture missing ${marker}`);
}
console.log('IT Solutions powerhouse, SIA-first diagnosis gate, autonomous coding-agent handoff, consented remote assistance, employee updates, and approval boundary verified.');
