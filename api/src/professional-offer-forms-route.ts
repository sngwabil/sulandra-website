import type express from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const formValue = z.union([z.string().max(4000), z.boolean(), z.number().finite()]);
const completionSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
  attested: z.literal(true),
  acknowledgments: z.record(z.string().max(120), z.boolean()).default({}),
  fields: z.record(z.string().max(120), formValue).default({}),
});

async function offerByToken(prisma: PrismaClient, rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT o.*,a."firstName",a."middleName",a."lastName",a."email",a."referenceNumber"
       FROM "EmploymentOffer" o
       JOIN "EmployeeApplication" a ON a."id"=o."applicationId"
      WHERE o."tokenHash"=$1 AND o."tokenExpiresAt">NOW()
      LIMIT 1`,
    tokenHash,
  );
  return rows[0] || null;
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(value: string, max = 88) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createOfferLetterPdf(offer: any, signerName: string, signature: string) {
  const employmentType = String(offer.employmentType || '').replaceAll('_', ' ');
  const compensation = offer.compensationType === 'SALARY'
    ? `$${Number(offer.payAmount).toLocaleString()} per year`
    : `$${Number(offer.payAmount).toFixed(2)} per hour`;
  const date = new Date().toLocaleDateString('en-US');
  const startDate = new Date(offer.startDate).toLocaleDateString('en-US');
  const orientationDate = offer.orientationDate
    ? new Date(offer.orientationDate).toLocaleDateString('en-US')
    : 'To be confirmed';
  const applicantName = [offer.firstName, offer.middleName, offer.lastName].filter(Boolean).join(' ');
  const paragraphs = [
    `Date: ${date}`,
    `To: ${applicantName}`,
    `Re: Offer of Employment — ${offer.positionTitle}`,
    '',
    `Dear ${offer.firstName},`,
    '',
    `Sulandra Community Living Services, a division of Sulandra Health, is pleased to offer you employment as ${offer.positionTitle}. We believe your experience and commitment to person-centered service will be valuable to our organization and the individuals we support.`,
    '',
    `Your anticipated employment terms are as follows:`,
    `Position: ${offer.positionTitle}`,
    `Department: ${offer.department || 'To be assigned'}`,
    `Employment type: ${employmentType}`,
    `Compensation: ${compensation}`,
    `Shift: ${offer.shift || 'As scheduled'}`,
    `Anticipated start date: ${startDate}`,
    `Orientation date: ${orientationDate}`,
    `Work location: ${offer.workLocation || 'To be confirmed'}`,
    `Supervisor: ${offer.supervisorName || 'To be assigned'}`,
    `Probationary period: ${offer.probationDays || 90} days`,
    `PTO eligibility: ${offer.ptoEligible ? 'Eligible subject to company policy' : 'Not designated'}`,
    `Benefits eligibility: ${offer.benefitsEligible ? 'Eligible subject to plan terms and waiting periods' : 'Not designated'}`,
    offer.bonusAmount ? `Bonus: $${Number(offer.bonusAmount).toFixed(2)} subject to the stated eligibility and repayment terms.` : '',
    '',
    `You will be expected to perform the essential duties of the position, maintain all required licenses and credentials, complete orientation and assigned training, comply with Sulandra policies, protect confidential information, and meet all documentation, attendance, safety, and performance expectations. Your schedule, assignment, reporting relationship, and work location may be adjusted based on operational and client needs, consistent with applicable law.`,
    '',
    `Compensation will be paid in accordance with Sulandra's regular payroll practices and is subject to required deductions and withholdings. Any benefit descriptions are summaries only; eligibility and coverage are governed by the official plan documents and company policies.`,
    '',
    `Employment with Sulandra is at will where permitted by law. This means either you or Sulandra may end the employment relationship at any time, with or without advance notice or cause, subject to applicable law. No manager or representative may alter this relationship except through a written agreement signed by an authorized company officer.`,
    '',
    `Please complete and electronically sign the required onboarding packet within 14 days. Your employee account and final onboarding access will be issued after Human Resources verifies the completed requirements.`,
    '',
    `We are pleased to welcome you to Sulandra Community Living Services and look forward to the contribution you can make to our mission.`,
    '',
    `Sincerely,`,
    `Sulandra Health Human Resources Department`,
    `Sulandra Community Living Services`,
    `A Division of Sulandra Health`,
    '',
    `ACCEPTANCE`,
    `I, ${signerName}, accept this offer of employment and acknowledge that I reviewed and understand the terms stated above.`,
    `Electronic signature: ${signature}`,
    `Signed on: ${new Date().toLocaleString('en-US')}`,
    '',
    `Footnote: This offer is contingent upon timely completion of all position requirements, satisfactory background screening, drug testing where required by policy or law, identity and employment-eligibility verification, credential verification, and completion of required onboarding documentation.`,
  ].filter((line) => line !== undefined);

  const textLines = paragraphs.flatMap((paragraph) => paragraph ? wrapText(paragraph) : ['']);
  const pages: string[][] = [];
  for (let index = 0; index < textLines.length; index += 47) pages.push(textLines.slice(index, index + 47));

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const fontObjectNumber = 3;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let nextObjectNumber = 4;
  for (const pageLines of pages) {
    const pageNumber = nextObjectNumber++;
    const contentNumber = nextObjectNumber++;
    pageObjectNumbers.push(pageNumber);
    const stream = [
      'BT',
      '/F1 10 Tf',
      '54 748 Td',
      '14 TL',
      ...pageLines.map((line, index) => `${index ? 'T* ' : ''}(${pdfEscape(line)}) Tj`),
      'ET',
    ].join('\n');
    objects[pageNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    objects[contentNumber] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`;

  let output = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let number = 1; number < objects.length; number += 1) {
    if (!objects[number]) continue;
    offsets[number] = Buffer.byteLength(output);
    output += `${number} 0 obj\n${objects[number]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let number = 1; number < objects.length; number += 1) {
    output += `${String(offsets[number] || 0).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, 'utf8');
}

export function registerProfessionalOfferFormsRoute(app: express.Express, prisma: PrismaClient) {
  app.post('/public/careers/offers/:token/documents/:documentId/complete', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      const input = completionSchema.parse(req.body);
      const documentId = String(req.params.documentId);
      const [document] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","name" FROM "EmploymentOfferDocument" WHERE "id"=$1 AND "offerId"=$2 LIMIT 1`,
        documentId,
        offer.id,
      );
      if (!document) return res.status(404).json({ error: 'Required document not found.' });

      const formData = {
        acknowledgments: input.acknowledgments,
        fields: input.fields,
        certification: {
          fullLegalName: input.fullLegalName,
          signature: input.signature,
          attested: true,
          submittedAt: new Date().toISOString(),
        },
      };

      let pdf: Buffer | null = null;
      let fileName: string | null = null;
      if (document.name === 'Offer Letter') {
        pdf = createOfferLetterPdf(offer, input.fullLegalName, input.signature);
        fileName = `Offer-of-Employment-${offer.referenceNumber || offer.applicationId}.pdf`;
      }

      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "EmploymentOfferDocument"
            SET "status"='COMPLETED',
                "signature"=$1,
                "signedByName"=$2,
                "formData"=$3::jsonb,
                "attestedAt"=NOW(),
                "ipAddress"=$4,
                "userAgent"=$5,
                "fileData"=$6,
                "fileName"=$7,
                "mimeType"=$8,
                "sizeBytes"=$9,
                "contentSha256"=$10,
                "completedAt"=NOW(),
                "updatedAt"=NOW()
          WHERE "id"=$11 AND "offerId"=$12`,
        input.signature,
        input.fullLegalName,
        JSON.stringify(formData),
        req.ip || req.socket.remoteAddress || null,
        req.get('user-agent') || null,
        pdf,
        fileName,
        pdf ? 'application/pdf' : null,
        pdf?.length ?? null,
        pdf ? createHash('sha256').update(pdf).digest('hex') : null,
        documentId,
        offer.id,
      );
      if (!updated) return res.status(404).json({ error: 'Required document not found.' });

      if (pdf && fileName) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ApplicantDocument"
            ("id","applicationId","category","label","status","fileName","mimeType","sizeBytes",
             "fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt")
           VALUES ($1,$2,'OTHER'::"ApplicantDocumentCategory",'Signed Offer of Employment',
                   'RECEIVED'::"ApplicantDocumentStatus",$3,'application/pdf',$4,$5,$6,'APPLICANT',NOW(),NOW(),NOW())`,
          randomUUID(),
          offer.applicationId,
          fileName,
          pdf.length,
          pdf,
          createHash('sha256').update(pdf).digest('hex'),
        );
      }

      const documents = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","name","status","signedByName","completedAt","fileName"
           FROM "EmploymentOfferDocument"
          WHERE "offerId"=$1 ORDER BY "createdAt","name"`,
        offer.id,
      );
      const completed = documents.filter((item) => item.status === 'COMPLETED').length;
      const progress = {
        documents,
        completed,
        total: documents.length,
        allComplete: documents.length > 0 && completed === documents.length,
      };
      if (progress.allComplete) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmploymentOffer" SET "status"='DOCUMENTS_COMPLETE',"documentsCompletedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1`,
          offer.id,
        );
      }
      res.json({ data: progress });
    } catch (error) {
      next(error);
    }
  });
}
