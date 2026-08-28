import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const need=(source,marker,label)=>{if(!source.includes(marker))failures.push(`${label} missing: ${marker}`)};

const artifacts=await readFile(path.join(root,'api','src','it-agent-artifact-routes.ts'),'utf8');
for(const marker of [
  'ITAgentArtifact','ITAgentArtifactEvent','ITAgentExternalEmailAudit',
  '/api/it-solutions/agent/artifacts/upload','/api/it-solutions/agent/artifacts/:artifactId/content',
  'scanBufferForMalware','putSecureObject','getSecureObject','deleteSecureObject','decryptClientEncryptedObject',
  'SEND_EXTERNAL_EMAIL','CREATE_PDF','GENERATE_IMAGE','executeITAgentArtifactRoutineAction','isITAgentArtifactRoutineAction',
  'buildITAgentAttachmentContent','input_image','input_file','gpt-image-2','%PDF-1.4',
  'hourly safety limit reached','bcc:recipients','messageSha256','X-Content-Type-Options',
]) need(artifacts,marker,'IT Agent artifact backend');
if(artifacts.includes('SMTP_PASS=')||artifacts.includes('OPENAI_API_KEY='))failures.push('IT Agent artifact backend appears to hard-code a credential');
if(!artifacts.includes("blockedExtensions=new Set(['exe','dll','msi'"))failures.push('IT Agent upload executable blocklist is missing');

const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
for(const marker of [
  'IT_AGENT_ARTIFACT_CAPABILITIES_V1','buildITAgentAttachmentContent','attachmentIds',
  "name:'send_external_email'","name:'create_pdf'","name:'generate_image'",
  "actionType:'SEND_EXTERNAL_EMAIL'","actionType:'CREATE_PDF'","actionType:'GENERATE_IMAGE'",
  'attachmentParts:Array<Record<string,unknown>>=[]','index===history.length-1',
  'externalEmail:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS)','fileUpload:true','pdfCreation:true','imageCreation:Boolean(openAIKey())',
]) need(workbench,marker,'IT Agent reasoning workbench');

const executor=await readFile(path.join(root,'api','src','it-agent-routine-executor.ts'),'utf8');
for(const marker of ['isITAgentArtifactRoutineAction','executeITAgentArtifactRoutineAction','return executeITAgentArtifactRoutineAction(prisma,input)'])need(executor,marker,'IT Agent routine executor');

const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
for(const marker of ['registerITAgentArtifactRoutes','it-agent-artifact-routes.js'])need(bootstrap,marker,'IT Agent artifact route registration');

for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  const portal=await readFile(file,'utf8');
  for(const marker of ['agentFileInput','Attach files / images','agentArtifacts','selectedArtifactIds','uploadArtifacts(files)','attachmentIds:selectedArtifactIds','capExternalEmail','capUploads','capPdf','capGeneratedImage'])need(portal,marker,`${relative} artifact UI`);
}

const frontendDocker=await readFile(path.join(root,'Dockerfile.frontend'),'utf8');
for(const marker of ['node scripts/install-employee-support.mjs','node scripts/verify-it-agent-artifact-capabilities.mjs'])need(frontendDocker,marker,'Railway static artifact publication');

const storageFix=await readFile(path.join(root,'scripts','fix-secure-object-storage-types.mjs'),'utf8');
for(const marker of ['railwayObjectStorage','EMPLOYEE_OBJECT_CLIENT_ENCRYPTION_KEY_BASE64','Railway artifact storage requires'])need(storageFix,marker,'Railway artifact encryption compatibility');

if(failures.length){console.error('IT Agent artifact capability verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent artifact capabilities verified: secure uploads/download/delete, multimodal reasoning attachments, audited external email, PDF creation, standalone image generation, Railway static publication, and client-encrypted Railway bucket compatibility are present.');
