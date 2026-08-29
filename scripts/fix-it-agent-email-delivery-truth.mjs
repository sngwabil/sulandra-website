import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function replaceFunction(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  if(start<0)throw new Error(`${label} start anchor changed`);
  const end=source.indexOf(endMarker,start);
  if(end<0)throw new Error(`${label} end anchor changed`);
  return source.slice(0,start)+replacement.trimEnd()+'\n'+source.slice(end);
}

const educationPath=path.join(root,'api','src','education-campaign-routes.ts');
let education=await readFile(educationPath,'utf8');
if(!education.includes('IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1')){
  const template=await readFile(path.join(root,'scripts','templates','it-agent-education-send-training.ts.txt'),'utf8');
  education=replaceFunction(education,'export async function sendTrainingCampaign','\nexport async function getTrainingCampaignStatus',template,'Education email delivery');
  await writeFile(educationPath,education,'utf8');
}

const artifactPath=path.join(root,'api','src','it-agent-artifact-routes.ts');
let artifact=await readFile(artifactPath,'utf8');
if(!artifact.includes('IT_AGENT_EXTERNAL_EMAIL_DELIVERY_TRUTH_V1')){
  const template=await readFile(path.join(root,'scripts','templates','it-agent-external-email.ts.txt'),'utf8');
  artifact=replaceFunction(artifact,'async function sendExternalEmail','\nasync function createPdf',template,'External email delivery');
  await writeFile(artifactPath,artifact,'utf8');
}

console.log('IT Agent email delivery truth installed: assignments and SMTP acceptance are reported separately; inbox delivery is never fabricated.');
