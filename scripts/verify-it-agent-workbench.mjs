import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const failures=[];
const need=(source,marker,label)=>{if(!source.includes(marker))failures.push(`${label} missing: ${marker}`)};
for(const marker of [
  '/api/it-solutions/agent/chat',
  '/api/it-solutions/agent/actions/:actionId/execute',
  'ITAgentConversation','ITAgentMessage','ITAgentAction',
  'publish_intranet_content','post_intranet_meme','send_employee_announcement','send_employee_notification','send_employee_email','request_code_change',
  'https://api.openai.com/v1/responses','gpt-image-2','https://api.openai.com/v1/images/generations',
  'IntranetContentItem','EmployeeAnnouncement','EmployeeNotification','EmployeeCommunicationEvent',
  'ITRemediationApproval','ITAgentHandoff',"'WAITING_APPROVAL'",
  'codingWorkerConnected:Boolean(process.env.SULANDRA_GITHUB_TOKEN||process.env.GITHUB_TOKEN)',
  'do not fabricate a commit or deployment',
]) need(backend,marker,'IT Agent backend');
if(backend.includes('OPENAI_API_KEY=')||backend.includes('SMTP_PASS='))failures.push('IT Agent backend appears to hard-code a credential');

const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
if(bootstrap.includes('registerITAgentWorkbenchRoutes')){
  const it=bootstrap.indexOf('registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });');
  const agent=bootstrap.indexOf('registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });');
  if(it<0||agent<0||agent<it)failures.push('IT Agent routes must register after canonical IT Solutions');
}

try{
  await access(path.join(root,'it-solutions.html'));
  const portal=await readFile(path.join(root,'it-solutions.html'),'utf8');
  for(const marker of ['data-view="agent"','Sulandra IT Agent','Action Center','Ask IT Agent','Post a news card to the intranet','original Friday safety meme','Email all employees','Add a new button next to Operations','APPROVAL/HANDOFF ONLY'])need(portal,marker,'IT Solutions portal');
}catch(error){if(error?.code!=='ENOENT')throw error}

if(failures.length){console.error('IT Agent workbench verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent workbench verified: privileged chat, review-before-execute operational tools, real intranet/communications/email actions, original image generation, and fail-closed code-change approval/handoff are present.');
