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
          `SELECT o.*,a."workflowStatus" AS "applicationWorkflowStatus"
             FROM "EmploymentOffer" o
             JOIN "EmployeeApplication" a ON a."id"=o."applicationId"
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

        const signedOfferRows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","label","status","fileName","mimeType","sizeBytes","uploadedAt"
             FROM "ApplicantDocument"
            WHERE "applicationId"=$1
              AND "label"='Signed Offer of Employment'
            ORDER BY "createdAt" DESC
            LIMIT 1`,
          applicationId,
        );
        const signedOffer = signedOfferRows[0] || null;

        // Onboarding documents are intentionally hidden during the offer stage.
        // They become relevant only after the employee profile is created.
        let documents: any[] = [];
        if (offer.employeeId) {
          documents = await prisma.$queryRawUnsafe<any[]>(
            `SELECT "id","name","status","signedByName","completedAt","createdAt"
               FROM "EmploymentOfferDocument"
              WHERE "offerId"=$1
              ORDER BY "createdAt","name"`,
            offer.id,
          );
        }
        const completed = documents.filter((document) => document.status === 'COMPLETED').length;
        const stage = offer.employeeId
          ? 'ONBOARDING_PENDING'
          : offer.status === 'OFFER_ACCEPTED'
            ? 'ADMIN_REVIEW'
            : 'OFFER_PENDING';

        res.json({
          data: {
            offer: {
              id: offer.id,
              status: offer.status,
              applicationWorkflowStatus: offer.applicationWorkflowStatus,
              stage,
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
              acceptedByName: offer.acceptedByName,
              employeeId: offer.employeeId,
              createdAt: offer.createdAt,
              tokenExpiresAt: offer.tokenExpiresAt,
              signedOffer,
            },
            progress: {
              stage,
              documents,
              completed,
              total: documents.length,
              allComplete: offer.employeeId
                ? documents.length > 0 && completed === documents.length
                : false,
              waitingForSignedOffer: offer.status !== 'OFFER_ACCEPTED',
              readyForAdminReview: offer.status === 'OFFER_ACCEPTED' && Boolean(signedOffer),
              onboardingDeferredUntilHire: !offer.employeeId,
            },
          },
        });
      } catch (error) {
        console.warn('[offer-progress] unavailable; returning an empty offer state', {
          applicationId: String(req.params.id),
          error: error instanceof Error ? error.message : String(error),
        });
        res.json({ data: { offer: null, progress: null } });
      }
    },
  );
}
