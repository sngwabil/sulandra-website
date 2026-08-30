import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const education=await readFile(path.join(root,'api','src','education-campaign-routes.ts'),'utf8');
const artifact=await readFile(path.join(root,'api','src','it-agent-artifact-routes.ts'),'utf8');
const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const routine=await readFile(path.join(root,'api','src','it-agent-routine-executor.ts'),'utf8');
const generalTemplate=await readFile(path.join(root,'scripts','templates','it-agent-general-email-helper.ts.txt'),'utf8');
const externalTemplate=await readFile(path.join(root,'scripts','templates','it-agent-external-email.ts.txt'),'utf8');
const pkg=JSON.parse(await readFile(path.join(root,'api','package.json'),'utf8'));
const failures=[];
const requireText=(text,needle,label)=>{if(!text.includes(needle))failures.push(label)};
const legacyFrom='(process.env.FROM_EMAIL||process.env.SMTP_FROM||user).trim()';

requireText(education,'IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1','education truth marker missing');
requireText(education,'emailAcceptedCount','education SMTP accepted count missing');
requireText(education,'emailRejectedCount','education SMTP rejected count missing');
requireText(education,'emailUnconfirmedCount','education SMTP unconfirmed count missing');
requireText(education,'mailboxDeliveryConfirmed: false','education mailbox-delivery boundary missing');
requireText(education,'SMTP acceptance is not proof that a message reached an inbox','education truthful delivery wording missing');
if(education.includes('Email delivery: ${emailSentCount} sent'))failures.push('legacy education sent wording still present');

requireText(artifact,'IT_AGENT_EXTERNAL_EMAIL_DELIVERY_TRUTH_V1','external email truth marker missing');
requireText(artifact,'IT_AGENT_AUTHENTICATED_SMTP_SENDER_V1','external email authenticated-sender marker missing');
requireText(artifact,'const fromAddress=user.trim();','external email must send from authenticated SMTP mailbox');
requireText(artifact,'smtpAccepted:true','external email SMTP acceptance evidence missing');
requireText(artifact,'mailboxDeliveryConfirmed:false','external email mailbox-delivery boundary missing');
requireText(artifact,'Final inbox delivery is not confirmed by SMTP','external email truthful delivery wording missing');
requireText(artifact,"[it-agent-external-email] SMTP handoff failed",'external email sanitized transport log missing');
requireText(artifact,'itAgentOperationalFailure:true','external email operational-failure marker missing');
requireText(artifact,'fromMatchesSmtpUser:true','external email authenticated sender diagnostic missing');
if(artifact.includes(legacyFrom))failures.push('external email still permits an unverified alternate From identity');
if(artifact.includes('External email sent to ${recipients.length} recipient'))failures.push('legacy external-email sent wording still present');

requireText(routine,'IT_AGENT_AUTHENTICATED_SMTP_SENDER_V1','routine employee email authenticated-sender marker missing');
requireText(routine,'fromAddress=user.trim()','routine employee email must send from authenticated SMTP mailbox');
requireText(routine,"itAgentActionType:'SEND_EMAIL'",'routine employee email operational-failure metadata missing');
requireText(routine,"deliveryBasis:'SMTP_ACCEPTANCE_ONLY'",'routine employee email SMTP-only delivery basis missing');
requireText(routine,'Final inbox delivery is not confirmed by SMTP','routine employee email truthful delivery wording missing');
if(routine.includes(legacyFrom))failures.push('routine employee email still permits an unverified alternate From identity');
if(routine.includes('Email sent successfully to ${emails.length} recipient'))failures.push('routine employee email still claims successful delivery');

requireText(generalTemplate,'IT_AGENT_AUTHENTICATED_SMTP_SENDER_V1','general employee email template authenticated-sender marker missing');
requireText(generalTemplate,'const from=user.trim();','general employee email template must send from authenticated SMTP mailbox');
if(generalTemplate.includes(legacyFrom))failures.push('general employee email template still permits an unverified alternate From identity');
requireText(externalTemplate,'IT_AGENT_AUTHENTICATED_SMTP_SENDER_V1','external email template authenticated-sender marker missing');
requireText(externalTemplate,'const fromAddress=user.trim();','external email template must send from authenticated SMTP mailbox');
if(externalTemplate.includes(legacyFrom))failures.push('external email template still permits an unverified alternate From identity');

requireText(workbench,'IT_AGENT_GENERAL_EMAIL_DELIVERY_TRUTH_V1','general employee email truth marker missing');
requireText(workbench,'sendEmployeeEmailWithTruth','general employee email truth helper missing');
requireText(workbench,'const from=user.trim();','workbench employee email must send from authenticated SMTP mailbox');
requireText(workbench,'smtpAcceptedCount','general employee SMTP accepted count missing');
requireText(workbench,"deliveryBasis:'SMTP_ACCEPTANCE_ONLY'",'general employee SMTP-only delivery basis missing');
requireText(workbench,'mailboxDeliveryConfirmed:false','general employee mailbox-delivery boundary missing');
requireText(workbench,"if(delivery.smtpAcceptedCount===0)finalStatus='FAILED'",'general employee zero-acceptance failure boundary missing');
requireText(workbench,'No intended recipient was confirmed accepted by SMTP. This email must not be described as sent or delivered.','general employee truthful failure wording missing');
requireText(workbench,'smtpAccepted or smtpAcceptedCount proves only SMTP handoff, not inbox delivery','agent email-result truth instruction missing');
requireText(workbench,'IT_AGENT_ROUTINE_OPERATIONAL_FAILURE_BOUNDARY_V1','routine operational-failure boundary missing');
requireText(workbench,"['SEND_EMAIL','SEND_EXTERNAL_EMAIL'].includes(policy.actionType)",'employee/external mail failure classifier missing');
requireText(workbench,'if(expectedMailFailure){','dual mail failure boundary missing');
requireText(workbench,"status:'FAILED',result:failureResult",'mail provider failure must persist FAILED action result');
requireText(workbench,'itAgentOperationalFailure===true','mail operational failure handling missing');
if(workbench.includes(legacyFrom))failures.push('workbench email still permits an unverified alternate From identity');
if(workbench.includes("const expectedExternalEmailFailure=policy.actionType==='SEND_EXTERNAL_EMAIL'&&"))failures.push('workbench still classifies only external email provider failures');
if(workbench.includes('result={sent:true,recipientCount:emails.length,audience}'))failures.push('legacy general employee sent=true result still present');
if(workbench.includes('await sendMail(emails,clean(payload.subject,240),clean(payload.message,12000))'))failures.push('legacy general employee bulk sendMail path still present');

const finalTail='verify-it-agent-live-progress.mjs && node ../scripts/fix-it-agent-email-delivery-truth.mjs && node ../scripts/verify-it-agent-email-delivery-truth.mjs';
for(const scriptName of ['predev','prebuild','pretypecheck']){
  const value=String(pkg.scripts?.[scriptName]||'');
  const fixerCount=(value.match(/fix-it-agent-email-delivery-truth\.mjs/g)||[]).length;
  const verifierCount=(value.match(/verify-it-agent-email-delivery-truth\.mjs/g)||[]).length;
  if(fixerCount<2)failures.push(`${scriptName} must re-run the email repair after later IT Agent installers`);
  if(verifierCount<2)failures.push(`${scriptName} must re-run the email verifier after later IT Agent installers`);
  if(!value.includes(finalTail))failures.push(`${scriptName} does not finish with the final email repair/verifier invariant`);
}

if(failures.length){console.error('IT Agent email delivery truth verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent email delivery truth verified: final build uses the authenticated SMTP mailbox as From; employee and external mail report SMTP acceptance truthfully; recognized provider failures are FAILED actions, not false runtime incidents.');
