import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>readFile(path.join(root,file),'utf8');
const requireText=(source,text,label)=>{if(!source.includes(text))throw new Error(`${label} missing: ${text}`)};

const [migration,campaigns,careers,workbench,portal,reviewPage]=await Promise.all([
  read('prisma/migrations/20260828171500_it_agent_education_campaigns/migration.sql'),
  read('api/src/education-campaign-routes.ts'),
  read('api/src/careers-routes.ts'),
  read('api/src/it-agent-workbench-routes.ts'),
  read('it-solutions.html'),
  read('education-campaign.html'),
]);

for(const text of ['CREATE TABLE IF NOT EXISTS "EducationCampaign"','CREATE TABLE IF NOT EXISTS "EducationCampaignRevision"','ADD COLUMN IF NOT EXISTS "campaignId" text','EducationCampaignRevision_immutable'])requireText(migration,text,'education campaign migration');
for(const text of ['createTrainingDraft','reviseTrainingDraft','markTrainingReady','sendTrainingCampaign','getTrainingCampaignStatus','executeTrainingAgentAction','EducationAssignment','completionEvidence','ATTEST_EDUCATION_CAMPAIGN'])requireText(campaigns,text,'education campaign runtime');
requireText(careers,"import { registerEducationCampaignRoutes } from './education-campaign-routes.js';",'education campaign registration');
requireText(careers,'registerEducationCampaignRoutes(app, prisma, helpers);','education campaign registration');
for(const text of ['create_training_draft','revise_training_draft','mark_training_ready','send_training','get_training_status','executeTrainingAgentAction','ACTION_EXECUTION_RECORDED_IN_CONVERSATION','never use request_code_change merely because a new training item is being created'])requireText(workbench,text,'IT Agent education workflow');
if(workbench.includes("name==='create_training_draft')return{actionType:'REQUEST_CODE_CHANGE'"))throw new Error('Education draft must never be classified as REQUEST_CODE_CHANGE');
for(const text of ['Routine work executes from your instruction','Education stays in one reviewable campaign until you say “send.”','Review education','Approve &amp; Continue','Employee education campaigns'])requireText(portal,text,'IT Solutions education UX');
for(const text of ['Administrator review','Nothing is sent while this campaign is a draft','say <strong>“send”</strong>','Employee attestation','Complete &amp; Attest','Completion tracking'])requireText(reviewPage,text,'education review page');

console.log('IT Agent education workflow verified: persistent draft/review/revision, explicit-send distribution without a second approval, canonical EducationAssignment completion evidence, clickable review UI, tracking, and approval-execution conversation continuity are present.');
