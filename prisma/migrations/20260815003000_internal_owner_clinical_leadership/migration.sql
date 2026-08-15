CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Internal owner/executive clinical appointments are not Careers applications.
-- Ownership, operational employment, clinical appointments, credentials and RBAC
-- remain separate records so one can change without rewriting the others.
CREATE TABLE IF NOT EXISTS "LeadershipAppointment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "legalEntityId" text,
  "appointmentKey" text NOT NULL,
  "appointmentType" text NOT NULL,
  "title" text NOT NULL,
  "scopeText" text,
  "effectiveDate" date NOT NULL DEFAULT CURRENT_DATE,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "source" text NOT NULL DEFAULT 'INTERNAL_APPOINTMENT',
  "credentialLabel" text,
  "credentialVerificationStatus" text NOT NULL DEFAULT 'NOT_REQUIRED',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "LeadershipAppointment_type_check" CHECK ("appointmentType" IN ('OWNERSHIP','EXECUTIVE_CLINICAL','ENTITY_CLINICAL')),
  CONSTRAINT "LeadershipAppointment_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE')),
  CONSTRAINT "LeadershipAppointment_credential_check" CHECK ("credentialVerificationStatus" IN ('NOT_REQUIRED','PENDING_VERIFICATION','VERIFIED','EXPIRED')),
  CONSTRAINT "LeadershipAppointment_org_user_key" UNIQUE ("organizationId","userId","appointmentKey")
);

CREATE INDEX IF NOT EXISTS "LeadershipAppointment_user_idx"
  ON "LeadershipAppointment"("organizationId","userId","status","appointmentType");

-- Sulandra Health becomes the owner's primary enterprise capacity. Existing RBAC is
-- intentionally untouched; this only formalizes organization/employment context.
UPDATE "Employment" employment
SET "primaryEmployment"=false,"updatedAt"=now()
FROM "User" owner_user
WHERE employment."organizationId"=owner_user."organizationId"
  AND employment."userId"=owner_user."id"
  AND lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND employment."status"<>'TERMINATED';

UPDATE "Employment" employment
SET "departmentId"=department."id",
    "jobTitle"='Owner / Founder & Enterprise Director of Nursing',
    "employmentType"='OWNER',
    "status"='ACTIVE',
    "primaryEmployment"=true,
    "endsAt"=NULL,
    "source"='INTERNAL_OWNER_APPOINTMENT',
    "metadata"=COALESCE(employment."metadata",'{}'::jsonb) || jsonb_build_object(
      'internalHire',true,'hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false
    ),
    "updatedAt"=now()
FROM "User" owner_user
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"='SULANDRA_HEALTH'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='EXECUTIVE'
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND employment."organizationId"=owner_user."organizationId"
  AND employment."userId"=owner_user."id"
  AND employment."legalEntityId"=entity."id"
  AND employment."status"<>'TERMINATED';

INSERT INTO "Employment" (
  "organizationId","userId","legalEntityId","departmentId","jobTitle","employmentType","status","primaryEmployment","startsAt","source","metadata"
)
SELECT owner_user."organizationId",owner_user."id",entity."id",department."id",
       'Owner / Founder & Enterprise Director of Nursing','OWNER','ACTIVE',true,CURRENT_DATE,'INTERNAL_OWNER_APPOINTMENT',
       jsonb_build_object('internalHire',true,'hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false)
FROM "User" owner_user
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"='SULANDRA_HEALTH'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='EXECUTIVE'
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND NOT EXISTS (
    SELECT 1 FROM "Employment" existing
    WHERE existing."organizationId"=owner_user."organizationId" AND existing."userId"=owner_user."id"
      AND existing."legalEntityId"=entity."id" AND existing."status"<>'TERMINATED'
  );

-- Home Health DON / Clinical Director internal appointment.
UPDATE "Employment" employment
SET "departmentId"=department."id",
    "jobTitle"='Director of Nursing / Clinical Director',
    "employmentType"='EMPLOYEE',
    "status"='ACTIVE',
    "primaryEmployment"=false,
    "endsAt"=NULL,
    "source"='INTERNAL_OWNER_APPOINTMENT',
    "metadata"=COALESCE(employment."metadata",'{}'::jsonb) || jsonb_build_object(
      'internalHire',true,'hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false
    ),
    "updatedAt"=now()
FROM "User" owner_user
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"='HOME_HEALTH'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='NURSING'
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND employment."organizationId"=owner_user."organizationId"
  AND employment."userId"=owner_user."id"
  AND employment."legalEntityId"=entity."id"
  AND employment."status"<>'TERMINATED';

INSERT INTO "Employment" (
  "organizationId","userId","legalEntityId","departmentId","jobTitle","employmentType","status","primaryEmployment","startsAt","source","metadata"
)
SELECT owner_user."organizationId",owner_user."id",entity."id",department."id",
       'Director of Nursing / Clinical Director','EMPLOYEE','ACTIVE',false,CURRENT_DATE,'INTERNAL_OWNER_APPOINTMENT',
       jsonb_build_object('internalHire',true,'hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false)
FROM "User" owner_user
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"='HOME_HEALTH'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='NURSING'
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND NOT EXISTS (
    SELECT 1 FROM "Employment" existing
    WHERE existing."organizationId"=owner_user."organizationId" AND existing."userId"=owner_user."id"
      AND existing."legalEntityId"=entity."id" AND existing."status"<>'TERMINATED'
  );

-- SCLS clinical oversight only. The DODD Director of Operations is deliberately
-- not assigned here and remains a separate hiring position.
UPDATE "Employment" employment
SET "departmentId"=department."id",
    "jobTitle"='Clinical / Nursing Oversight',
    "employmentType"='EMPLOYEE',
    "status"='ACTIVE',
    "primaryEmployment"=false,
    "endsAt"=NULL,
    "source"='INTERNAL_OWNER_APPOINTMENT',
    "metadata"=COALESCE(employment."metadata",'{}'::jsonb) || jsonb_build_object(
      'internalHire',true,'hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false,
      'doddDirectorOfOperationsSeparateHire',true,'dooAssignedToOwner',false
    ),
    "updatedAt"=now()
FROM "User" owner_user
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"='SCLS'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='CLINICAL_SERVICES'
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND employment."organizationId"=owner_user."organizationId"
  AND employment."userId"=owner_user."id"
  AND employment."legalEntityId"=entity."id"
  AND employment."status"<>'TERMINATED';

INSERT INTO "Employment" (
  "organizationId","userId","legalEntityId","departmentId","jobTitle","employmentType","status","primaryEmployment","startsAt","source","metadata"
)
SELECT owner_user."organizationId",owner_user."id",entity."id",department."id",
       'Clinical / Nursing Oversight','EMPLOYEE','ACTIVE',false,CURRENT_DATE,'INTERNAL_OWNER_APPOINTMENT',
       jsonb_build_object('internalHire',true,'hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false,
                          'doddDirectorOfOperationsSeparateHire',true,'dooAssignedToOwner',false)
FROM "User" owner_user
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"='SCLS'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='CLINICAL_SERVICES'
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
  AND NOT EXISTS (
    SELECT 1 FROM "Employment" existing
    WHERE existing."organizationId"=owner_user."organizationId" AND existing."userId"=owner_user."id"
      AND existing."legalEntityId"=entity."id" AND existing."status"<>'TERMINATED'
  );

INSERT INTO "LeadershipAppointment" (
  "organizationId","userId","legalEntityId","appointmentKey","appointmentType","title","scopeText","effectiveDate","status","source",
  "credentialLabel","credentialVerificationStatus","metadata"
)
SELECT owner_user."organizationId",owner_user."id",entity."id",seed."appointmentKey",seed."appointmentType",seed."title",seed."scopeText",
       CURRENT_DATE,'ACTIVE','INTERNAL_APPOINTMENT',seed."credentialLabel",seed."credentialStatus",seed."metadata"
FROM "User" owner_user
JOIN (VALUES
  ('SULANDRA_HEALTH','OWNER_FOUNDER','OWNERSHIP','Owner / Founder',
   'Sulandra Health enterprise ownership and founder capacity',NULL,'NOT_REQUIRED',
   jsonb_build_object('hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false)),
  ('SULANDRA_HEALTH','ENTERPRISE_DON','EXECUTIVE_CLINICAL','Enterprise Director of Nursing',
   'Enterprise clinical leadership across Sulandra companies where nursing oversight is assigned','RN','PENDING_VERIFICATION',
   jsonb_build_object('hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false,'credentialClaim','RN','verificationRequiredBeforeRegulatedUse',true)),
  ('HOME_HEALTH','HOME_HEALTH_DON','ENTITY_CLINICAL','Director of Nursing / Clinical Director',
   'Sulandra Home Health Care Services clinical and nursing leadership','RN','PENDING_VERIFICATION',
   jsonb_build_object('hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false,'regulatoryActivationDependsOnEntityReadiness',true)),
  ('SCLS','SCLS_CLINICAL_OVERSIGHT','ENTITY_CLINICAL','Clinical / Nursing Oversight',
   'SCLS nursing and clinical oversight only; Director of Operations is a separate hire','RN','PENDING_VERIFICATION',
   jsonb_build_object('hiringPath','INTERNAL_APPOINTMENT','careersApplicationCreated',false,'interviewRequired',false,'offerRequired',false,'doddDirectorOfOperationsSeparateHire',true,'dooAssignedToOwner',false))
) AS seed("entityCode","appointmentKey","appointmentType","title","scopeText","credentialLabel","credentialStatus","metadata") ON true
JOIN "LegalEntity" entity ON entity."organizationId"=owner_user."organizationId" AND entity."code"=seed."entityCode"
WHERE lower(owner_user."email")=lower('admin@sulandrahealth.com')
ON CONFLICT ("organizationId","userId","appointmentKey") DO UPDATE SET
  "legalEntityId"=EXCLUDED."legalEntityId",
  "appointmentType"=EXCLUDED."appointmentType",
  "title"=EXCLUDED."title",
  "scopeText"=EXCLUDED."scopeText",
  "status"='ACTIVE',
  "source"='INTERNAL_APPOINTMENT',
  "credentialLabel"=EXCLUDED."credentialLabel",
  "credentialVerificationStatus"=EXCLUDED."credentialVerificationStatus",
  "metadata"=EXCLUDED."metadata",
  "updatedAt"=now();
