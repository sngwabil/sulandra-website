import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
};

type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
};

export function registerOfferProgressRoute(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles } = helpers;

  app.get(
    '/api/admin/applications/:id/offer-progress',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);

        const offers = await prisma.$queryRawUnsafe<any[]>(
          `SELECT o.*
             FROM "EmploymentOffer" o
            WHERE o."applicationId"=$1
              AND o."organizationId"=$2
            ORDER BY o."createdAt" DESC
            LIMIT 1`,
          applicationId,
          auth.organizationId,
        );

        const offer = offers[0];
        if (!offer) {
          res.json({ data: { offer: null, progress: null } });
          return;
        }

        const documents = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","name","status","signedByName","completedAt","createdAt"
             FROM "EmploymentOfferDocument"
            WHERE "offerId"=$1
            ORDER BY "createdAt","name"`,
          offer.id,
        );
        const completed = documents.filter((document) => document.status === 'COMPLETED').length;

        res.json({
          data: {
            offer: {
              id: offer.id,
              status: offer.status,
              positionTitle: offer.positionTitle,
              employmentType: offer.employmentType,
              compensationType: offer.compensationType,
              payAmount: offer.payAmount,
              supervisorName: offer.supervisorName,
              startDate: offer.startDate,
              orientationDate: offer.orientationDate,
              workLocation: offer.workLocation,
              viewedAt: offer.viewedAt,
              acceptedAt: offer.acceptedAt,
              documentsCompletedAt: offer.documentsCompletedAt,
              employeeId: offer.employeeId,
              createdAt: offer.createdAt,
              tokenExpiresAt: offer.tokenExpiresAt,
            },
            progress: {
              documents,
              completed,
              total: documents.length,
              allComplete: documents.length > 0 && completed === documents.length,
            },
          },
        });
      } catch (error) {
        // Older production databases may not have the employment-offer tables yet.
        // The applicant folder must remain usable while those optional tables are absent.
        console.warn('[offer-progress] unavailable; returning an empty offer state', {
          applicationId: String(req.params.id),
          error: error instanceof Error ? error.message : String(error),
        });
        res.json({ data: { offer: null, progress: null } });
      }
    },
  );
}
