import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const education=await readFile(path.join(root,'api','src','education-campaign-routes.ts'),'utf8');
const artifact=await readFile(path.join(root,'api','src','it-agent-artifact-routes.ts'),'utf8');
const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const pkg=JSON.parse(await readFile(path.join(root,'api','package.json'),'utf8'));
const failures=[];
const requireText=(text,needle,label)=>{if(!text.includes(needle))failures.push(label)};

requireText(education,'IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1','education truth marker missing');
requireText(education,'emailAcceptedCount','education SMTP accepted count missing');
requireText(education,'emailRejectedCount','education SMTP rejected count missing');
requireText(education,'emailUnconfirmedCount','education SMTP unconfirmed count missing');
requireText(education,'mailboxDeliveryConfirmed: false','education mailbox-delivery boundary missing');
requireText(education,'SMTP acceptance is not proof that a message reached an inbox','education truthful delivery wording missing');
if(education.includes('Email delivery: ${emailSentCount} sent'))failures.push('legacy education sent wording still present');

requireText(artifact,'IT_AGENT_EXTERNAL_EMAIL_DELIVERY_TRUTH_V1','external email truth marker missing');
requireText(artifact,'smtpAccepted:true','external email SMTP acceptance evidence missing');
requireText(artifact,'mailboxDeliveryConfirmed:false','external email mailbox-delivery boundary missing');
requireText(artifact,'Final inbox delivery is not confirmed by SMTP','external email truthful delivery wording missing');
if(artifact.includes('External email sent to ${recipients.length} recipient'))failures.push('legacy external-email sent wording still present');

requireText(workbench,'IT_AGENT_GENERAL_EMAIL_DELIVERY_TRUTH_V1','general employee email truth marker missing');
requireText(workbench,'sendEmployeeEmailWithTruth','general employee email truth helper missing');
requireText(workbench,'smtpAcceptedCount','general employee SMTP accepted count missing');
requireText(workbench,"deliveryBasis:'SMTP_ACCEPTANCE_ONLY'",'general employee SMTP-only delivery basis missing');
requireText(workbench,'mailboxDeliveryConfirmed:false','general employee mailbox-delivery boundary missing');
requireText(workbench,"if(delivery.smtpAcceptedCount===0)finalStatus='FAILED'",'general employee zero-acceptance failure boundary missing');
requireText(workbench,'No intended recipient was confirmed accepted by SMTP. This email must not be described as sent or delivered.','general employee truthful failure wording missing');
requireText(workbench,'smtpAccepted or smtpAcceptedCount proves only SMTP handoff, not inbox delivery','agent email-result truth instruction missing');
if(workbench.includes('result={sent:true,recipientCount:emails.length,audience}'))failures.push('legacy general employee sent=true result still present');
if(workbench.includes('await sendMail(emails,clean(payload.subject,240),clean(payload.message,12000))'))failures.push('legacy general employee bulk sendMail path still present');

for(const scriptName of ['prebuild','pretypecheck']){
  const value=String(pkg.scripts?.[scriptName]||'');
  if(!value.includes('fix-it-agent-email-delivery-truth.mjs'))failures.push(`${scriptName} does not install email truth repair`);
  if(!value.includes('verify-it-agent-email-delivery-truth.mjs'))failures.push(`${scriptName} does not verify email truth repair`);
}

if(failures.length){console.error('IT Agent email delivery truth verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent email delivery truth verified: education, external email, and general employee email separate SMTP acceptance from final inbox delivery.');
