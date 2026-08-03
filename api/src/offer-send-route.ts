import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};
const offerSchema = z.object({
  positionTitle: z.string().trim().min(2).max(160), department: z.string().trim().max(120).optional(),
  supervisorName: z.string().trim().max(160).optional(), employmentType: z.enum(['FULL_TIME','PART_TIME','PRN','CONTRACT']),
  compensationType: z.enum(['HOURLY','SALARY']), payAmount: z.number().positive().max(1_000_000),
  shift: z.string().trim().max(120).optional(), startDate: z.coerce.date(), orientationDate: z.coerce.date().optional(),
  workLocation: z.string().trim().max(240).optional(), ptoEligible: z.boolean().default(false),
  benefitsEligible: z.boolean().default(false), probationDays: z.number().int().min(0).max(365).default(90),
  bonusAmount: z.number().nonnegative().max(100_000).optional(), notes: z.string().trim().max(4000).optional(),
  requiredDocuments: z.array(z.string().trim().min(2).max(120)).min(1).max(50),
});
async function sendOfferEmail(to:string,subject:string,html:string,text:string){
  const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS;
  if(!host||!user||!pass)return 'NOT_CONFIGURED' as const;
  const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000});
  await transporter.sendMail({from:`Human Resources <${process.env.SMTP_FROM||user}>`,to,subject,html,text});return 'SENT' as const;
}
export function registerOfferSendRoute(app:express.Express,prisma:PrismaClient,helpers:Helpers){
 const {authOf,requireRoles,audit}=helpers;
 app.post('/api/admin/applications/:id/offers',requireRoles(UserRole.ADMINISTRATOR,UserRole.COO),async(req,res,next)=>{try{
  const auth=authOf(res),applicationId=String(req.params.id),input=offerSchema.parse(req.body);
  const [application]=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,applicationId,auth.organizationId);
  if(!application)return res.status(404).json({error:'Application not found.'});if(!application.email)return res.status(400).json({error:'Applicant email is required before sending an offer.'});
  const offerId=randomUUID(),rawToken=randomBytes(32).toString('base64url'),tokenHash=createHash('sha256').update(rawToken).digest('hex');
  const base=process.env.OFFER_PORTAL_URL||'https://www.sulandrahealth.com/offer-acceptance.html';
  const offerUrl=`${base}?token=${encodeURIComponent(rawToken)}`;
  const w4Url=`https://www.sulandrahealth.com/w4.html?token=${encodeURIComponent(rawToken)}`;
  await prisma.$transaction(async tx=>{
   await tx.$executeRawUnsafe(`INSERT INTO "EmploymentOffer" ("id","organizationId","applicationId","status","positionTitle","department","supervisorName","employmentType","compensationType","payAmount","shift","startDate","orientationDate","workLocation","ptoEligible","benefitsEligible","probationDays","bonusAmount","notes","requiredDocuments","tokenHash","tokenExpiresAt","createdById","createdAt","updatedAt") VALUES ($1,$2,$3,'OFFER_SENT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,NOW()+INTERVAL '14 days',$21,NOW(),NOW())`,offerId,auth.organizationId,applicationId,input.positionTitle,input.department??null,input.supervisorName??null,input.employmentType,input.compensationType,input.payAmount,input.shift??null,input.startDate,input.orientationDate??null,input.workLocation??null,input.ptoEligible,input.benefitsEligible,input.probationDays,input.bonusAmount??null,input.notes??null,JSON.stringify(input.requiredDocuments),tokenHash,auth.userId);
   for(const name of input.requiredDocuments)await tx.$executeRawUnsafe(`INSERT INTO "EmploymentOfferDocument" ("id","offerId","name","status","createdAt","updatedAt") VALUES ($1,$2,$3,'PENDING',NOW(),NOW())`,randomUUID(),offerId,name);
   await tx.$executeRawUnsafe(`UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_PENDING',"updatedAt"=NOW() WHERE "id"=$1`,applicationId);
  });
  const compensation=input.compensationType==='SALARY'?`$${Number(input.payAmount).toLocaleString()} annually`:`$${Number(input.payAmount).toFixed(2)} per hour`;
  const hasW4=input.requiredDocuments.includes('Form W-4');
  const emailHtml=`<div style="font-family:Segoe UI,Arial,sans-serif;color:#183153;line-height:1.55;max-width:720px;margin:auto;border:1px solid #d8e3ed;border-radius:14px;overflow:hidden"><div style="background:#075985;color:white;padding:26px"><h1 style="margin:0">Conditional Employment Offer</h1><p style="margin:6px 0 0">Sulandra Community Living Services · A Division of Sulandra Health</p></div><div style="padding:26px"><p>Dear ${application.firstName},</p><p>We are pleased to extend a conditional offer for the position of <strong>${input.positionTitle}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:18px 0"><tr><td style="padding:9px;border:1px solid #d8e3ed"><strong>Compensation</strong></td><td style="padding:9px;border:1px solid #d8e3ed">${compensation}</td></tr><tr><td style="padding:9px;border:1px solid #d8e3ed"><strong>Employment type</strong></td><td style="padding:9px;border:1px solid #d8e3ed">${input.employmentType.replaceAll('_',' ')}</td></tr><tr><td style="padding:9px;border:1px solid #d8e3ed"><strong>Anticipated start date</strong></td><td style="padding:9px;border:1px solid #d8e3ed">${input.startDate.toLocaleDateString()}</td></tr><tr><td style="padding:9px;border:1px solid #d8e3ed"><strong>Work location</strong></td><td style="padding:9px;border:1px solid #d8e3ed">${input.workLocation||'To be confirmed'}</td></tr></table><p>Please review the offer and complete the required onboarding packet within 14 days:</p><p style="margin:22px 0"><a href="${offerUrl}" style="background:#087fb8;color:white;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">Open secure onboarding packet</a></p>${hasW4?`<div style="background:#eff8ff;border:1px solid #b8d9ed;border-radius:10px;padding:16px;margin:18px 0"><strong>Form W-4 — guided official IRS workflow</strong><p>The W-4 workspace downloads the current official IRS form, explains each step, places your answers on the form, generates a PDF for your review, and submits the signed PDF to Human Resources only after you approve it.</p><p><a href="${w4Url}" style="color:#075985;font-weight:700">Complete and review the current Form W-4</a></p></div>`:''}<p>This offer remains conditional upon satisfactory completion of all required screening, credential, documentation, and policy requirements. Employment is not final until Human Resources confirms completion.</p><p><strong>Security notice:</strong> Do not forward these secure links. Human Resources will never ask you to email your Social Security number or banking password.</p><p style="margin-top:24px"><strong>Human Resources</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p><p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px">This message is not a guarantee of employment for a fixed term and is not an employment contract. This mailbox may not be monitored for replies.</p></div></div>`;
  let deliveryStatus:'SENT'|'FAILED'|'NOT_CONFIGURED'='FAILED';try{deliveryStatus=await sendOfferEmail(application.email,`Conditional Employment Offer — ${input.positionTitle}`,emailHtml,`Open your secure onboarding packet: ${offerUrl}${hasW4?`\nComplete the current Form W-4: ${w4Url}`:''}`)}catch(mailError){console.error('[careers] offer email failed',{applicationId,offerId,error:mailError})}
  await audit(auth,'SEND_EMPLOYMENT_OFFER','EmploymentOffer',offerId,{applicationId,positionTitle:input.positionTitle,payAmount:input.payAmount,deliveryStatus});
  res.status(201).json({data:{offerId,status:'OFFER_SENT',offerUrl,w4Url:hasW4?w4Url:null,requiredDocuments:input.requiredDocuments,deliveryStatus}});
 }catch(error){next(error)}});
}
