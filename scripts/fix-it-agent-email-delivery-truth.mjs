import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function replaceFunction(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label} start anchor changed`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label} end anchor changed`);
  return source.slice(0, start) + replacement.trimEnd() + '\n' + source.slice(end);
}

const educationPath = path.join(root, 'api', 'src', 'education-campaign-routes.ts');
let education = await readFile(educationPath, 'utf8');

const educationReplacement = String.raw`
/* IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1 */
export async function sendTrainingCampaign(prisma: PrismaClient, input: AgentCampaignInput) {
  const campaign = await currentCampaign(prisma, input);
  if (!campaign) throw httpError(404, 'No education draft is active in this IT conversation.');
  if (campaign.status === 'ACTIVE' || campaign.status === 'CLOSED') {
    const status = await getTrainingCampaignStatus(prisma, { ...input, campaignId: campaign.id });
    return { ...status, message: `“${campaign.title}” is already assigned. I did not create duplicate assignments or claim a second email delivery.` };
  }
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw httpError(503, 'Sulandra SMTP is not configured on this API deployment, so the education was not distributed.');

  const recipients = await eligibleRecipients(prisma, campaign);
  if (!recipients.length) throw httpError(409, 'No active employees match this education audience.');
  const uniqueEmployees = [...new Set(recipients.map((row) => row.userId))];
  const reviewUrl = educationCampaignReviewUrl(campaign.id);
  let assignmentCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of recipients) {
      const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "EducationAssignment"
          WHERE "organizationId"=$1 AND "campaignId"=$2 AND "employeeId"=$3 AND "legalEntityId"=$4
          LIMIT 1`,
        campaign.organizationId,
        campaign.id,
        row.userId,
        row.legalEntityId,
      );
      if (existing[0]) continue;
      await tx.$executeRawUnsafe(
        `INSERT INTO "EducationAssignment"
          ("id","organizationId","legalEntityId","departmentId","employeeId","courseCode","title","packageCode","status","dueDate","reason","assignedById","assignedAt","completionEvidence","campaignId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'CUSTOM','ASSIGNED',$8,$9,$10,NOW(),$11::jsonb,$12,NOW(),NOW())`,
        randomUUID(),
        campaign.organizationId,
        row.legalEntityId,
        row.departmentId,
        row.userId,
        campaign.courseCode,
        campaign.title,
        campaign.dueDate,
        `Required Sulandra employee education distributed through IT Solutions: ${campaign.title}`,
        input.userId,
        JSON.stringify({
          source: 'IT_AGENT_EDUCATION_CAMPAIGN',
          campaignId: campaign.id,
          campaignVersion: campaign.version,
          assignedAt: new Date().toISOString(),
          attested: false,
        }),
        campaign.id,
      );
      assignmentCount += 1;
    }
  });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const from = (process.env.FROM_EMAIL || process.env.SMTP_FROM || user).trim();
  const emailByUser = new Map<string, string>();
  for (const row of recipients) {
    const email = clean(row.email, 320).toLowerCase();
    if (email && !emailByUser.has(row.userId)) emailByUser.set(row.userId, email);
  }
  const normalizedAddress = (value: unknown) => {
    if (typeof value === 'string') return clean(value, 320).toLowerCase();
    if (value && typeof value === 'object' && 'address' in value) return clean((value as { address?: unknown }).address, 320).toLowerCase();
    return '';
  };
  let emailAcceptedCount = 0;
  let emailRejectedCount = 0;
  let emailTransportFailedCount = 0;
  let emailUnconfirmedCount = 0;
  for (const [employeeId, email] of emailByUser) {
    try {
      const dueText = campaign.dueDate ? new Date(campaign.dueDate).toLocaleDateString('en-US') : 'the assigned due date';
      const text = `${campaign.emailMessage}\n\nDue: ${dueText}\nReview and attest: ${reviewUrl}`;
      const info = await transporter.sendMail({
        from: { name: 'Sulandra Health Education', address: from },
        replyTo: user.trim(),
        to: email,
        subject: campaign.emailSubject || `${campaign.title} — Sulandra Health Education`,
        text,
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#18324a;line-height:1.6"><h2 style="color:#082f5b">${html(campaign.title)}</h2><p>${html(campaign.emailMessage).replace(/\n/g, '<br>')}</p><p><strong>Due:</strong> ${html(dueText)}</p><p><a href="${html(reviewUrl)}" style="display:inline-block;background:#0b6fb8;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">Review education and attest</a></p><p style="color:#64748b;font-size:12px">Assigned by Sulandra Health Education through IT Solutions.</p></div>`,
      });
      const accepted = new Set((Array.isArray(info.accepted) ? info.accepted : []).map(normalizedAddress).filter(Boolean));
      const rejected = new Set((Array.isArray(info.rejected) ? info.rejected : []).map(normalizedAddress).filter(Boolean));
      if (accepted.has(email)) emailAcceptedCount += 1;
      else if (rejected.has(email)) emailRejectedCount += 1;
      else emailUnconfirmedCount += 1;
    } catch {
      emailTransportFailedCount += 1;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeNotification" ("id","organizationId","employeeId","title","message","category","actionUrl","createdById")
       VALUES ($1,$2,$3,$4,$5,'COMPLIANCE',$6,$7)`,
      randomUUID(),
      campaign.organizationId,
      employeeId,
      `Required education: ${campaign.title}`,
      campaign.dueDate
        ? `Review and attest by ${new Date(campaign.dueDate).toLocaleDateString('en-US')}.`
        : 'Review this required education and complete the attestation.',
      reviewUrl,
      input.userId,
    ).catch(() => undefined);
  }

  const emailFailedCount = emailRejectedCount + emailTransportFailedCount;
  const deliverySummary = {
    assignedEmployees: uniqueEmployees.length,
    assignmentRows: recipients.length,
    newAssignmentRows: assignmentCount,
    emailEligibleCount: emailByUser.size,
    emailAcceptedCount,
    emailRejectedCount,
    emailTransportFailedCount,
    emailUnconfirmedCount,
    emailSentCount: emailAcceptedCount,
    emailFailedCount,
    mailboxDeliveryConfirmed: false,
    deliveryBasis: 'SMTP_ACCEPTANCE_PLUS_IN_APP_ASSIGNMENT',
    sentAt: new Date().toISOString(),
  };
  await prisma.$executeRawUnsafe(
    `UPDATE "EducationCampaign"
        SET "status"='ACTIVE',"sentAt"=COALESCE("sentAt",NOW()),"deliverySummary"=$1::jsonb,"updatedAt"=NOW()
      WHERE "organizationId"=$2 AND "id"=$3 AND "status" IN ('DRAFT','READY_TO_SEND')`,
    JSON.stringify(deliverySummary),
    campaign.organizationId,
    campaign.id,
  );
  const handoff = emailByUser.size
    ? `Email handoff: ${emailAcceptedCount} accepted by SMTP${emailRejectedCount ? `, ${emailRejectedCount} rejected` : ''}${emailTransportFailedCount ? `, ${emailTransportFailedCount} transport failed` : ''}${emailUnconfirmedCount ? `, ${emailUnconfirmedCount} unconfirmed` : ''}.`
    : 'No employee email addresses were available for SMTP handoff.';
  return {
    campaignId: campaign.id,
    status: 'ACTIVE',
    version: campaign.version,
    reviewUrl,
    ...deliverySummary,
    message: `Assigned “${campaign.title}” to ${uniqueEmployees.length} employee${uniqueEmployees.length === 1 ? '' : 's'} and created ${recipients.length} company-scoped education assignment${recipients.length === 1 ? '' : 's'}. ${handoff} SMTP acceptance is not proof that a message reached an inbox; the in-app education assignment and notification remain the authoritative distribution record.`,
  };
}
`;

if (!education.includes('IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1')) {
  education = replaceFunction(
    education,
    'export async function sendTrainingCampaign',
    '\nexport async function getTrainingCampaignStatus',
    educationReplacement,
    'Education email delivery',
  );
  await writeFile(educationPath, education, 'utf8');
}

const artifactPath = path.join(root, 'api', 'src', 'it-agent-artifact-routes.ts');
let artifact = await readFile(artifactPath, 'utf8');

const externalReplacement = String.raw`
/* IT_AGENT_EXTERNAL_EMAIL_DELIVERY_TRUTH_V1 */
async function sendExternalEmail(prisma:PrismaClient,input:RoutineInput){
  const payload=externalEmailSchema.parse(obj(input.payload));
  const recipients=[...new Set(payload.recipients.map((value)=>clean(value,320).toLowerCase()).filter(Boolean))];
  await ensureSchema(prisma);
  const [hourRows,dayRows]=await Promise.all([
    prisma.$queryRawUnsafe<Array<{count:number}>>(`SELECT COALESCE(SUM("recipientCount"),0)::int AS count FROM "ITAgentExternalEmailAudit" WHERE "organizationId"=$1 AND "actorUserId"=$2 AND "createdAt">NOW()-INTERVAL '1 hour'`,input.auth.organizationId,input.auth.userId),
    prisma.$queryRawUnsafe<Array<{count:number}>>(`SELECT COALESCE(SUM("recipientCount"),0)::int AS count FROM "ITAgentExternalEmailAudit" WHERE "organizationId"=$1 AND "actorUserId"=$2 AND "createdAt">NOW()-INTERVAL '24 hours'`,input.auth.organizationId,input.auth.userId),
  ]);
  if(Number(hourRows[0]?.count||0)>=externalEmailHourlyLimit())throw httpError(429,'External-email hourly safety limit reached. Try again later.');
  if(Number(dayRows[0]?.count||0)+recipients.length>externalRecipientDailyLimit())throw httpError(429,'External-email daily recipient safety limit reached.');
  const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS;
  if(!host||!user||!pass)throw httpError(503,'Sulandra SMTP is not configured on this API deployment.');
  const auditId=randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentExternalEmailAudit" ("id","organizationId","actorUserId","actionId","recipientCount","recipients","subject","messageSha256","status") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'SENDING')`,auditId,input.auth.organizationId,input.auth.userId,input.actionId,recipients.length,JSON.stringify(recipients),payload.subject,sha256(payload.message));
  const fromAddress=(process.env.FROM_EMAIL||process.env.SMTP_FROM||user).trim();
  const normalizedAddress=(value:unknown)=>{if(typeof value==='string')return clean(value,320).toLowerCase();if(value&&typeof value==='object'&&'address' in value)return clean((value as {address?:unknown}).address,320).toLowerCase();return''};
  try{
    const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
    const safeSubject=clean(payload.subject,240),safeMessage=clean(payload.message,12000);
    const info=await transporter.sendMail({from:{name:'Sulandra Health IT Solutions',address:fromAddress},replyTo:user.trim(),to:fromAddress,bcc:recipients,subject:safeSubject,text:safeMessage,html:`<div style="font-family:Segoe UI,Arial,sans-serif;color:#18324a;line-height:1.6"><h2 style="color:#082f5b">${safeSubject.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}</h2><p>${safeMessage.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c)).replace(/\n/g,'<br>')}</p><p style="color:#64748b;font-size:12px">Sent by Sulandra Health IT Solutions.</p></div>`});
    const acceptedSet=new Set((Array.isArray(info.accepted)?info.accepted:[]).map(normalizedAddress).filter(Boolean));
    const rejectedSet=new Set((Array.isArray(info.rejected)?info.rejected:[]).map(normalizedAddress).filter(Boolean));
    const acceptedCount=recipients.filter((email)=>acceptedSet.has(email)).length;
    const rejectedCount=recipients.filter((email)=>rejectedSet.has(email)).length;
    const unconfirmedCount=Math.max(0,recipients.length-acceptedCount-rejectedCount);
    const status=acceptedCount===recipients.length?'SMTP_ACCEPTED':acceptedCount>0?'PARTIAL':'FAILED';
    await prisma.$executeRawUnsafe(`UPDATE "ITAgentExternalEmailAudit" SET "status"=$1,"providerMessageId"=$2,"error"=$3,"sentAt"=CASE WHEN $1<>'FAILED' THEN NOW() ELSE "sentAt" END WHERE "id"=$4`,status,clean(info.messageId,500),status==='PARTIAL'?`rejected=${rejectedCount}; unconfirmed=${unconfirmedCount}`:'',auditId);
    if(!acceptedCount)throw httpError(502,'SMTP did not accept any external recipients.');
    return{sent:true,smtpAccepted:true,mailboxDeliveryConfirmed:false,recipientCount:recipients.length,acceptedCount,rejectedCount,unconfirmedCount,audience:'EXTERNAL',auditId,message:`SMTP accepted the external email for ${acceptedCount} of ${recipients.length} recipient${recipients.length===1?'':'s'}${rejectedCount?`; ${rejectedCount} rejected`:''}${unconfirmedCount?`; ${unconfirmedCount} unconfirmed`:''}. Final inbox delivery is not confirmed by SMTP.`};
  }catch(error){
    await prisma.$executeRawUnsafe(`UPDATE "ITAgentExternalEmailAudit" SET "status"='FAILED',"error"=$1 WHERE "id"=$2`,clean(error instanceof Error?error.message:error,1200),auditId).catch(()=>{});
    throw error;
  }
}
`;

if (!artifact.includes('IT_AGENT_EXTERNAL_EMAIL_DELIVERY_TRUTH_V1')) {
  artifact = replaceFunction(
    artifact,
    'async function sendExternalEmail',
    '\nasync function createPdf',
    externalReplacement,
    'External email delivery',
  );
  await writeFile(artifactPath, artifact, 'utf8');
}

console.log('IT Agent email delivery truth installed: assignments and SMTP acceptance are reported separately; inbox delivery is never fabricated.');
