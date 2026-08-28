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
  // Section 9D inserts the durable IT Specialist between SIA diagnosis and the
  // resolution/approval decision. The invariant is preserved and strengthened:
  // SIA remains first line, routine established repairs stay autonomous, major/new
  // work requires approval, remote assistance remains consented, and GitHub/Railway
  // remain first-class evidence. Accept the prior wording or the expanded wording.
  const chainOld='User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> SIA diagnosis -> Resolution or Engineering handoff -> Verification -> Archive';
  const chainNew='User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> SIA diagnosis -> IT Specialist -> Resolution or major-change approval -> Verification -> Archive';
  if(!architecture.includes(chainOld)&&!architecture.includes(chainNew))throw new Error('IT Solutions architecture missing the end-to-end evidence/resolution chain');
  for(const marker of ['SIA is first-line IT support','GitHub and Railway are first-class IT evidence sources','Remote assistance is support, not surveillance','Clock-in/geofence evidence is one evidence source only'])if(!architecture.includes(marker))throw new Error(`IT Solutions architecture missing ${marker}`);
  if(!architecture.includes('24/7 autonomous coding-agent handoff')&&!architecture.includes('24/7 autonomous IT Specialist handoff'))throw new Error('IT Solutions architecture missing continuous autonomous handoff');
  if(!architecture.includes('Established-operation repair vs new-system change')&&!architecture.includes('Established-operation repair vs major/new-system change'))throw new Error('IT Solutions architecture missing established-operation vs major/new-system approval boundary');
  const ordinaryApprovalBoundary=architecture.includes('Supervisor email is not used for ordinary established-operation failures')
    || (architecture.includes('Established operation repair — autonomous')&&architecture.includes('without waiting for owner approval'));
  if(!ordinaryApprovalBoundary)throw new Error('IT Solutions architecture no longer proves ordinary established-operation repairs do not require owner approval');
  for(const marker of ['ticket number','Request Modification','exact merged SHA','both backend'])if(!architecture.includes(marker))throw new Error(`Expanded IT Specialist architecture missing ${marker}`);
}
console.log('IT Solutions powerhouse, SIA-first diagnosis gate, autonomous IT Specialist/coding handoff, consented remote assistance, durable employee updates, and major-change approval boundary verified.');
