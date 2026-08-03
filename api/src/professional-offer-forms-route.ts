import type express from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
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
    `SELECT o.* FROM "EmploymentOffer" o WHERE o."tokenHash"=$1 AND o."tokenExpiresAt">NOW() LIMIT 1`,
    tokenHash,
  );
  return rows[0] || null;
}

export function registerProfessionalOfferFormsRoute(app: express.Express, prisma: PrismaClient) {
  app.post('/public/careers/offers/:token/documents/:documentId/complete', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      const input = completionSchema.parse(req.body);
      const documentId = String(req.params.documentId);
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
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "EmploymentOfferDocument"
            SET "status"='COMPLETED',
                "signature"=$1,
                "signedByName"=$2,
                "formData"=$3::jsonb,
                "attestedAt"=NOW(),
                "ipAddress"=$4,
                "userAgent"=$5,
                "completedAt"=NOW(),
                "updatedAt"=NOW()
          WHERE "id"=$6 AND "offerId"=$7`,
        input.signature,
        input.fullLegalName,
        JSON.stringify(formData),
        req.ip || req.socket.remoteAddress || null,
        req.get('user-agent') || null,
        documentId,
        offer.id,
      );
      if (!updated) return res.status(404).json({ error: 'Required document not found.' });
      const documents = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","name","status","signedByName","completedAt"
           FROM "EmploymentOfferDocument"
          WHERE "offerId"=$1 ORDER BY "createdAt","name"`,
        offer.id,
      );
      const completed = documents.filter((document) => document.status === 'COMPLETED').length;
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
