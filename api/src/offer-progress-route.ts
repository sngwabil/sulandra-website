import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { buildSignedOfferPdf } from './offer-acceptance-pdf-route.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = { authOf: (response: express.Response) => AuthContext; requireRoles: (...roles: UserRole[]) => express.RequestHandler };

export function registerOfferProgressRoute(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles } = helpers;
  app.get('/api/admin/applications/:id/offer-progress', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), async (req, res) => {
    try {
      const auth = authOf(res); const applicationId = String(req.params.id);
      const offers = await prisma.$queryRawUnsafe<any[]>(`SELECT o.*,a."workflowStatus" AS "applicationWorkflowStatus",a."firstName",a."lastName" FROM "EmploymentOffer" o JOIN "EmployeeApplication" a ON a."id"=o."applicationId" WHERE o."applicationId"=$1 AND o."organizationId"=$2 ORDER BY o."createdAt" DESC LIMIT 1`,applicationId,auth.organizationId);
      const offer=offers[0]; if(!offer){res.json({data:{offer:null,progress:null}});return;}

      if ((offer.status === 'OFFER_ACCEPTED' || offer.acceptedAt) && offer.applicationWorkflowStatus !== 'OFFER_ACCEPTED') {
        await prisma.$executeRawUnsafe(`UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_ACCEPTED',"updatedAt"=NOW() WHERE "id"=$1`, applicationId);
        offer.applicationWorkflowStatus = 'OFFER_ACCEPTED';
      } else if (offer.status !== 'OFFER_ACCEPTED' && !offer.acceptedAt && offer.applicationWorkflowStatus !== 'OFFER_PENDING') {
        await prisma.$executeRawUnsafe(`UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_PENDING',"updatedAt"=NOW() WHERE "id"=$1`, applicationId);
        offer.applicationWorkflowStatus = 'OFFER_PENDING';
      }

      if (offer.status === 'OFFER_ACCEPTED' || offer.acceptedAt) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ApplicantStatusHistory" ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","createdAt")
           SELECT $1,$2,'OFFER_PENDING','OFFER_ACCEPTED','Signed Offer of Employment received.',TRUE,COALESCE($3,NOW())
            WHERE NOT EXISTS (SELECT 1 FROM "ApplicantStatusHistory" WHERE "applicationId"=$2 AND "toStatus"='OFFER_ACCEPTED')`,
          randomUUID(), applicationId, offer.acceptedAt,
        );
      }

      let signedOfferRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id","label","status","fileName","mimeType","sizeBytes","uploadedAt" FROM "ApplicantDocument" WHERE "applicationId"=$1 AND "label"='Signed Offer of Employment' ORDER BY "createdAt" DESC LIMIT 1`,applicationId);
      if(!signedOfferRows[0] && offer.status==='OFFER_ACCEPTED' && offer.acceptedByName && offer.signature){
        const acceptedAt=offer.acceptedAt?new Date(offer.acceptedAt):new Date(); const pdf=buildSignedOfferPdf(offer,offer.acceptedByName,offer.signature,acceptedAt); const id=randomUUID();
        await prisma.$executeRawUnsafe(`INSERT INTO "ApplicantDocument" ("id","applicationId","category","label","status","fileName","mimeType","sizeBytes","fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt") VALUES ($1,$2,'OTHER'::"ApplicantDocumentCategory",'Signed Offer of Employment','RECEIVED'::"ApplicantDocumentStatus",$3,'application/pdf',$4,$5,$6,'APPLICANT',NOW(),NOW(),NOW())`,id,applicationId,`Signed-Offer-of-Employment-${String(offer.firstName||'Applicant')}-${String(offer.lastName||'')}.pdf`,pdf.length,pdf,createHash('sha256').update(pdf).digest('hex'));
        signedOfferRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id","label","status","fileName","mimeType","sizeBytes","uploadedAt" FROM "ApplicantDocument" WHERE "id"=$1`,id);
      }
      const signedOffer=signedOfferRows[0]||null; let documents:any[]=[];
      if(offer.employeeId){documents=await prisma.$queryRawUnsafe<any[]>(`SELECT "id","name","status","signedByName","completedAt","createdAt" FROM "EmploymentOfferDocument" WHERE "offerId"=$1 ORDER BY "createdAt","name"`,offer.id);}
      const completed=documents.filter(d=>d.status==='COMPLETED').length; const stage=offer.employeeId?'ONBOARDING_PENDING':offer.status==='OFFER_ACCEPTED'?'ADMIN_REVIEW':'OFFER_PENDING';
      const offerLetterProgress={documents:signedOffer?[{id:signedOffer.id,name:'Signed Offer of Employment',status:signedOffer.status||'RECEIVED',completedAt:signedOffer.uploadedAt,fileName:signedOffer.fileName}]:[{id:null,name:'Offer of Employment',status:'PENDING',completedAt:null,fileName:null}],completed:signedOffer?1:0,total:1,allComplete:Boolean(signedOffer)};
      res.json({data:{offer:{id:offer.id,status:offer.status,applicationWorkflowStatus:offer.applicationWorkflowStatus,stage,positionTitle:offer.positionTitle,employmentType:offer.employmentType,compensationType:offer.compensationType,payAmount:offer.payAmount,supervisorName:offer.supervisorName,startDate:offer.startDate,orientationDate:offer.orientationDate,workLocation:offer.workLocation,viewedAt:offer.viewedAt,acceptedAt:offer.acceptedAt,acceptedByName:offer.acceptedByName,employeeId:offer.employeeId,createdAt:offer.createdAt,tokenExpiresAt:offer.tokenExpiresAt,signedOffer},progress:offer.employeeId?{stage,documents,completed,total:documents.length,allComplete:documents.length>0&&completed===documents.length,waitingForSignedOffer:false,readyForAdminReview:false,onboardingDeferredUntilHire:false}:{stage,...offerLetterProgress,waitingForSignedOffer:!signedOffer,readyForAdminReview:offer.status==='OFFER_ACCEPTED'&&Boolean(signedOffer),onboardingDeferredUntilHire:true}}});
    } catch(error){console.warn('[offer-progress] unavailable',{applicationId:String(req.params.id),error:error instanceof Error?error.message:String(error)});res.json({data:{offer:null,progress:null}});}
  });
}
