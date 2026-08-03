import type express from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

type Helpers = {
  audit: (
    auth: { userId?: string; organizationId?: string; role?: unknown },
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: object,
  ) => Promise<void>;
};

const acceptSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
  acceptedTerms: z.literal(true),
});

function cleanPdfText(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}
function pdfEscape(value: string) { return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'); }
function wrap(text: string, width = 88) {
  const words = cleanPdfText(text).split(' ').filter(Boolean); const lines: string[] = []; let line = '';
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (candidate.length > width && line) { lines.push(line); line = word; } else line = candidate; }
  if (line) lines.push(line); return lines;
}
function dateText(value: unknown) { if (!value) return 'To be confirmed'; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? 'To be confirmed' : date.toLocaleDateString('en-US'); }
function money(value: unknown, type: unknown) { const amount = Number(value || 0); const formatted = amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }); return String(type) === 'SALARY' ? `${formatted} per year` : `${formatted} per hour`; }

export function buildSignedOfferPdf(offer: any, acceptedBy: string, signature: string, acceptedAt: Date) {
  const lines: Array<{ text: string; bold?: boolean }> = [];
  const add = (text = '', bold = false) => lines.push({ text: cleanPdfText(text), bold });
  const paragraph = (text: string) => { for (const line of wrap(text)) add(line); add(''); };
  add('SULANDRA HEALTH', true); add('Sulandra Community Living Services', true); add('A Division of Sulandra Health'); add(''); add('OFFER OF EMPLOYMENT', true); add('');
  add(`Applicant: ${offer.firstName || ''} ${offer.lastName || ''}`); add(`Position: ${offer.positionTitle || 'As stated in the offer'}`); add(`Department: ${offer.department || 'As assigned'}`);
  add(`Employment type: ${String(offer.employmentType || '').replaceAll('_', ' ')}`); add(`Compensation: ${money(offer.payAmount, offer.compensationType)}`); add(`Expected shift: ${offer.shift || 'As scheduled'}`);
  add(`Supervisor: ${offer.supervisorName || 'To be assigned'}`); add(`Work location: ${offer.workLocation || 'To be confirmed'}`); add(`Anticipated start date: ${dateText(offer.startDate)}`);
  add(`Orientation date: ${dateText(offer.orientationDate)}`); add(`Introductory period: ${offer.probationDays ?? 90} days`); add(`PTO eligibility: ${offer.ptoEligible ? 'Eligible' : 'Not currently eligible'}`);
  add(`Benefits eligibility: ${offer.benefitsEligible ? 'Eligible' : 'Not currently eligible'}`); if (offer.bonusAmount) add(`Bonus: ${money(offer.bonusAmount, 'ONE_TIME')}`); add('');
  paragraph('Sulandra Community Living Services is pleased to offer you employment in the position identified above. By accepting this offer, you agree to perform the responsibilities of the position safely, professionally, honestly, and in accordance with applicable laws, company policies, training requirements, client rights, confidentiality requirements, attendance expectations, and supervisor direction.');
  paragraph('Sulandra Community Living Services agrees to provide the compensation and employment terms stated in this offer, appropriate orientation and training, access to applicable policies and procedures, reasonable supervision and support, a professional work environment, and resources reasonably required to perform assigned duties, subject to business needs and applicable law.');
  if (offer.notes) paragraph(`Additional job terms: ${offer.notes}`);
  paragraph('This offer remains conditional upon satisfactory completion of applicable job requirements, background screening, drug testing where required, identity and employment-eligibility verification, credential and reference verification, exclusion-list screening, driving-record review when job-related, and final approval by the Sulandra Health Human Resources Department. The anticipated start date may change until final clearance is issued.');
  paragraph('This offer does not create employment for a guaranteed duration and does not alter at-will employment where applicable. Only an authorized written agreement may modify these terms.');
  add('ELECTRONIC ACCEPTANCE', true); add(`Accepted by: ${acceptedBy}`); add(`Electronic signature: ${signature}`); add(`Accepted on: ${acceptedAt.toLocaleString('en-US')}`); add('');
  paragraph('The signer confirms that they reviewed the employment terms, understand the expectations of the position and the company, and accept this Offer of Employment subject to the conditions stated above.');
  add('Sulandra Health Human Resources Department', true); add('Sulandra Community Living Services'); add('A Division of Sulandra Health');
  const pages: Array<Array<{ text: string; bold?: boolean }>> = []; for (let i = 0; i < lines.length; i += 43) pages.push(lines.slice(i, i + 43));
  const objects: string[] = []; objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'; objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'; objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const pageObjectIds: number[] = []; let nextId = 5;
  pages.forEach((pageLines) => { const pageId = nextId++; const contentId = nextId++; pageObjectIds.push(pageId); const commands: string[] = ['BT','/F2 15 Tf','54 756 Td','18 TL']; pageLines.forEach((line,index)=>{if(index>0)commands.push('T*');commands.push(line.bold?'/F2 11 Tf':'/F1 11 Tf');commands.push(`(${pdfEscape(line.text)}) Tj`);}); commands.push('ET'); const stream=commands.join('\n'); objects[contentId]=`<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream`; objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`; });
  objects[2]=`<< /Type /Pages /Kids [${pageObjectIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;
  let output='%PDF-1.4\n%SULANDRA\n'; const offsets:number[]=[0]; for(let id=1;id<objects.length;id++){offsets[id]=Buffer.byteLength(output,'ascii');output+=`${id} 0 obj\n${objects[id]}\nendobj\n`;}
  const xref=Buffer.byteLength(output,'ascii'); output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`; for(let id=1;id<objects.length;id++) output+=`${String(offsets[id]).padStart(10,'0')} 00000 n \n`; output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(output,'ascii');
}

async function offerByToken(prisma: PrismaClient, rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT o.*,a."firstName",a."lastName",a."email",a."phone",a."appliedRole",a."organizationId",a."workflowStatus" AS "applicationWorkflowStatus" FROM "EmploymentOffer" o JOIN "EmployeeApplication" a ON a."id"=o."applicationId" WHERE o."tokenHash"=$1 AND o."tokenExpiresAt">NOW() LIMIT 1`, tokenHash);
  return rows[0] || null;
}

export function registerOfferAcceptancePdfRoute(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  app.post('/public/careers/offers/:token/accept', async (req, res, next) => {
    try {
      const input = acceptSchema.parse(req.body); const offer = await offerByToken(prisma, String(req.params.token)); if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      const existingDocs = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "ApplicantDocument" WHERE "applicationId"=$1 AND "label"='Signed Offer of Employment' LIMIT 1`, offer.applicationId);
      if ((offer.status === 'OFFER_ACCEPTED' || offer.acceptedAt) && existingDocs[0]) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ApplicantStatusHistory" ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","createdAt")
           SELECT $1,$2,'OFFER_PENDING','OFFER_ACCEPTED','Signed Offer of Employment received.',TRUE,COALESCE($3,NOW())
            WHERE NOT EXISTS (SELECT 1 FROM "ApplicantStatusHistory" WHERE "applicationId"=$2 AND "toStatus"='OFFER_ACCEPTED')`,
          randomUUID(), offer.applicationId, offer.acceptedAt,
        );
        return res.json({ data: { status:'OFFER_ACCEPTED', signedOfferDocumentId:existingDocs[0].id, message:'Your signed Offer of Employment has already been received by the Sulandra Health Human Resources Department.' } });
      }
      const acceptedAt = offer.acceptedAt ? new Date(offer.acceptedAt) : new Date(); const acceptedBy = offer.acceptedByName || input.fullLegalName; const signature = offer.signature || input.signature;
      const pdf = buildSignedOfferPdf(offer, acceptedBy, signature, acceptedAt); const pdfHash=createHash('sha256').update(pdf).digest('hex'); const documentId=randomUUID(); const fileName=`Signed-Offer-of-Employment-${cleanPdfText(`${offer.firstName}-${offer.lastName}`).replaceAll(' ','-')}.pdf`;
      await prisma.$transaction(async tx=>{
        await tx.$executeRawUnsafe(`UPDATE "EmploymentOffer" SET "status"='OFFER_ACCEPTED',"acceptedAt"=$1,"acceptedByName"=$2,"signature"=$3,"updatedAt"=NOW() WHERE "id"=$4`,acceptedAt,acceptedBy,signature,offer.id);
        await tx.$executeRawUnsafe(`UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_ACCEPTED',"updatedAt"=NOW() WHERE "id"=$1`,offer.applicationId);
        await tx.$executeRawUnsafe(
          `INSERT INTO "ApplicantStatusHistory" ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","createdAt")
           SELECT $1,$2,$3,'OFFER_ACCEPTED','Signed Offer of Employment received.',TRUE,$4
            WHERE NOT EXISTS (SELECT 1 FROM "ApplicantStatusHistory" WHERE "applicationId"=$2 AND "toStatus"='OFFER_ACCEPTED')`,
          randomUUID(), offer.applicationId, offer.applicationWorkflowStatus || 'OFFER_PENDING', acceptedAt,
        );
        await tx.$executeRawUnsafe(`DELETE FROM "EmploymentOfferDocument" WHERE "offerId"=$1 AND "status"='PENDING'`,offer.id);
        await tx.$executeRawUnsafe(`DELETE FROM "ApplicantDocument" WHERE "applicationId"=$1 AND "label"='Signed Offer of Employment'`,offer.applicationId);
        await tx.$executeRawUnsafe(`INSERT INTO "ApplicantDocument" ("id","applicationId","category","label","status","fileName","mimeType","sizeBytes","fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt") VALUES ($1,$2,'OTHER'::"ApplicantDocumentCategory",'Signed Offer of Employment','RECEIVED'::"ApplicantDocumentStatus",$3,'application/pdf',$4,$5,$6,'APPLICANT',NOW(),NOW(),NOW())`,documentId,offer.applicationId,fileName,pdf.length,pdf,pdfHash);
      });
      await helpers.audit({ organizationId: offer.organizationId },'ACCEPT_EMPLOYMENT_OFFER','EmploymentOffer',offer.id,{applicationId:offer.applicationId,signedOfferDocumentId:documentId,acceptedByName:acceptedBy});
      res.json({data:{status:'OFFER_ACCEPTED',signedOfferDocumentId:documentId,message:'Your signed Offer of Employment has been received by the Sulandra Health Human Resources Department.'}});
    } catch(error){next(error);}
  });
}
