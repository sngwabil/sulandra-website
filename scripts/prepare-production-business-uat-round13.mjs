import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-business-path-uat.spec.mjs');
let source=await readFile(target,'utf8');

function replaceExact(from,to,label){
  if(source.includes(to))return;
  if(!source.includes(from))throw new Error(`Round-thirteen business UAT anchor missing: ${label}`);
  source=source.replace(from,to);
}

replaceExact(
  "const state={referral:false,intake:false,episode:false,activated:false,poc:false,pocActive:false,visit:false};",
  "const state={referral:false,intake:false,episode:false,activated:false,poc:false,pocReview:false,pocActive:false,visit:false};",
  'Home Health Plan of Care review state',
);

replaceExact(
  "if(path==='/api/home-health/episodes'&&method==='POST'){state.episode=true;return{expectedMutation:true,data:{data:episode}};}",
  "if(path===`/api/home-health/episodes/from-intake/${intake.id}`&&method==='POST'){state.episode=true;return{expectedMutation:true,data:{data:{...episode,id:episode.id,episodeNumber:'HH-EPI-UAT-001',medicalRecordNumber:'HH-UAT-001'}}};}",
  'Home Health intake-to-episode creation route',
);

replaceExact(
  "if(path===`/api/home-health/episodes/${episode.id}`&&method==='GET')return{data:{data:{episode:{...episode,status:state.activated?'ACTIVE':'DRAFT'},planOfCare:state.poc?{id:'biz-poc',status:state.pocActive?'ACTIVE':'DRAFT',summary:'Synthetic Business UAT Plan of Care'}:null,orders:[],visits:state.visit?[{id:'biz-hh-visit',visitType:'SN',status:'SCHEDULED',scheduledStart:futureIso(24)}]:[]}}};",
  "if(path===`/api/home-health/episodes/${episode.id}`&&method==='GET')return{data:{data:{episode:{...episode,episodeNumber:'HH-EPI-UAT-001',medicalRecordNumber:'HH-UAT-001',status:state.activated?'ACTIVE':'DRAFT'},readiness:{ready:true,blockers:[]},plans:state.poc?[{id:'biz-poc',status:state.pocActive?'ACTIVE':state.pocReview?'REVIEW':'DRAFT',effectiveDate:'2026-09-01',ordersSummary:'Synthetic Business UAT Plan of Care'}]:[],orders:[],visits:state.visit?[{id:'biz-hh-visit',discipline:'SN',visitType:'Routine SN',status:'SCHEDULED',scheduledStart:futureIso(24),assignedUserId:sessionFor(ACTORS.hhRn).userId}]:[],events:[]}}};",
  'Home Health episode detail UI contract',
);

replaceExact(
  "if(path===`/api/home-health/episodes/${episode.id}/plan-of-care/actions`&&method==='POST'){if(body.action==='ACTIVATE')state.pocActive=true;return{expectedMutation:true,data:{data:{id:'biz-poc',status:state.pocActive?'ACTIVE':'DRAFT'}}};}",
  "if(path===`/api/home-health/episodes/${episode.id}/plan-of-care/biz-poc/status`&&method==='POST'){if(body.action==='SUBMIT_REVIEW')state.pocReview=true;if(body.action==='ACTIVATE')state.pocActive=true;return{expectedMutation:true,data:{data:{id:'biz-poc',status:state.pocActive?'ACTIVE':state.pocReview?'REVIEW':'DRAFT'}}};}",
  'Home Health Plan of Care status lifecycle route',
);

replaceExact(
  "await clickVisible(page,'[data-section=\"poc\"]');await fillVisibleForm(page,'body');await clickVisible(page,'#savePoc');await expect.poll(()=>state.poc).toBe(true);const activatePoc=page.locator('[data-poc-action=\"ACTIVATE\"]');if(await activatePoc.isVisible().catch(()=>false))await activatePoc.click();await expect.poll(()=>state.pocActive).toBe(true);",
  "await clickVisible(page,'[data-section=\"poc\"]');await fillVisibleForm(page,'body');await clickVisible(page,'#savePoc');await expect.poll(()=>state.poc).toBe(true);await clickVisible(page,'[data-poc-action=\"SUBMIT_REVIEW\"]');await expect.poll(()=>state.pocReview).toBe(true);await clickVisible(page,'[data-poc-action=\"ACTIVATE\"]');await expect.poll(()=>state.pocActive).toBe(true);",
  'Home Health Plan of Care review then activation UI path',
);

await writeFile(target,source,'utf8');
console.log('Applied round-thirteen business UAT corrections: exact Home Health intake-to-episode route, episode readiness/detail shape, and real Plan of Care DRAFT → REVIEW → ACTIVE lifecycle.');
