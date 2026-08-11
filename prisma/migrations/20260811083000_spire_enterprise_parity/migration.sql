CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enterprise parity foundation: privacy/consent/break-glass/ROI/downtime, research,
-- supply/implant inventory, payer/member administration, community partners, capacity,
-- and standards-interface monitoring. All patient-linked rows remain company scoped.

CREATE TABLE IF NOT EXISTS "SpireConsentDirective" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "consentType" text NOT NULL,
  "scope" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "effectiveAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz,
  "revokedAt" timestamptz,
  "source" text,
  "documentId" text,
  "restrictions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireConsentDirective_status_check" CHECK ("status" IN ('ACTIVE','REVOKED','EXPIRED','PENDING'))
);
CREATE INDEX IF NOT EXISTS "SpireConsentDirective_patient_idx" ON "SpireConsentDirective"("organizationId","legalEntityId","patientId","status","effectiveAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePrivacyRestriction" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "restrictionType" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "reason" text NOT NULL,
  "segments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowedRoles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "effectiveAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz,
  "releasedAt" timestamptz,
  "releasedById" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpirePrivacyRestriction_status_check" CHECK ("status" IN ('ACTIVE','RELEASED','EXPIRED'))
);
CREATE INDEX IF NOT EXISTS "SpirePrivacyRestriction_patient_idx" ON "SpirePrivacyRestriction"("organizationId","legalEntityId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireBreakGlassAccess" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "reason" text NOT NULL,
  "emergencyType" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "grantedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "revokedById" text,
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "reviewOutcome" text,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireBreakGlassAccess_status_check" CHECK ("status" IN ('ACTIVE','EXPIRED','REVOKED','REVIEWED'))
);
CREATE INDEX IF NOT EXISTS "SpireBreakGlassAccess_user_patient_idx" ON "SpireBreakGlassAccess"("organizationId","legalEntityId","userId","patientId","expiresAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireReleaseOfInformationRequest" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "requestorName" text NOT NULL,
  "requestorType" text NOT NULL,
  "requestorContact" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "purpose" text,
  "requestedScope" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "dateFrom" date,
  "dateTo" date,
  "authorizationDocumentId" text,
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "dueAt" timestamptz,
  "completedAt" timestamptz,
  "denialReason" text,
  "processedById" text,
  "deliveryMethod" text,
  "deliveryEvidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireReleaseOfInformationRequest_status_check" CHECK ("status" IN ('RECEIVED','VALIDATING','IN_PROGRESS','READY','COMPLETED','DENIED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpireReleaseOfInformationRequest_patient_idx" ON "SpireReleaseOfInformationRequest"("organizationId","legalEntityId","patientId","status","receivedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDowntimeEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "eventType" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'HIGH',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  "summary" text NOT NULL,
  "affectedServices" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "downtimeProcedure" text,
  "recoveryNotes" text,
  "declaredById" text,
  "resolvedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDowntimeEvent_org_idx" ON "SpireDowntimeEvent"("organizationId","legalEntityId","status","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireResearchStudy" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "protocolNumber" text NOT NULL,
  "title" text NOT NULL,
  "sponsor" text,
  "principalInvestigatorUserId" text,
  "status" text NOT NULL DEFAULT 'OPEN',
  "irbNumber" text,
  "irbExpirationDate" date,
  "inclusionCriteria" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "exclusionCriteria" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "billingPlan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "openedAt" date,
  "closedAt" date,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","protocolNumber")
);
CREATE INDEX IF NOT EXISTS "SpireResearchStudy_status_idx" ON "SpireResearchStudy"("organizationId","legalEntityId","status","title");

CREATE TABLE IF NOT EXISTS "SpireResearchEnrollment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "studyId" text NOT NULL REFERENCES "SpireResearchStudy"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'SCREENING',
  "screenedAt" timestamptz NOT NULL DEFAULT now(),
  "consentedAt" timestamptz,
  "enrolledAt" timestamptz,
  "withdrawnAt" timestamptz,
  "consentDocumentId" text,
  "eligibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "studyArm" text,
  "subjectNumber" text,
  "notes" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireResearchEnrollment_patient_idx" ON "SpireResearchEnrollment"("organizationId","legalEntityId","patientId","status","screenedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireResearchOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "studyId" text NOT NULL REFERENCES "SpireResearchStudy"("id") ON DELETE CASCADE,
  "enrollmentId" text REFERENCES "SpireResearchEnrollment"("id") ON DELETE SET NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "orderType" text NOT NULL,
  "name" text NOT NULL,
  "protocolVisit" text,
  "scheduledAt" timestamptz,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "researchBilling" boolean NOT NULL DEFAULT true,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "orderedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireResearchOrder_patient_idx" ON "SpireResearchOrder"("organizationId","legalEntityId","patientId","status","scheduledAt");

CREATE TABLE IF NOT EXISTS "SpireSupplyItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "itemCode" text NOT NULL,
  "name" text NOT NULL,
  "category" text,
  "manufacturer" text,
  "unitOfMeasure" text,
  "chargeCode" text,
  "implantable" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","itemCode")
);

CREATE TABLE IF NOT EXISTS "SpireInventoryLot" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "supplyItemId" text NOT NULL REFERENCES "SpireSupplyItem"("id") ON DELETE CASCADE,
  "location" text NOT NULL,
  "lotNumber" text,
  "serialNumber" text,
  "expirationDate" date,
  "quantityOnHand" numeric NOT NULL DEFAULT 0,
  "parLevel" numeric,
  "reorderPoint" numeric,
  "lastCountAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireInventoryLot_item_idx" ON "SpireInventoryLot"("organizationId","legalEntityId","supplyItemId","location","expirationDate");

CREATE TABLE IF NOT EXISTS "SpireSupplyUsage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "procedureCaseId" text REFERENCES "SpireProcedureCase"("id") ON DELETE SET NULL,
  "inventoryLotId" text REFERENCES "SpireInventoryLot"("id") ON DELETE SET NULL,
  "supplyItemId" text NOT NULL REFERENCES "SpireSupplyItem"("id") ON DELETE RESTRICT,
  "quantity" numeric NOT NULL,
  "usageType" text NOT NULL DEFAULT 'USED',
  "chargeCaptured" boolean NOT NULL DEFAULT false,
  "usedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireSupplyUsage_patient_idx" ON "SpireSupplyUsage"("organizationId","legalEntityId","patientId","usedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePayerMemberCoverage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "payerName" text NOT NULL,
  "planName" text,
  "memberId" text NOT NULL,
  "groupNumber" text,
  "coverageType" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "effectiveDate" date,
  "terminationDate" date,
  "benefits" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "authorizationRules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verifiedAt" timestamptz,
  "verifiedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePayerMemberCoverage_patient_idx" ON "SpirePayerMemberCoverage"("organizationId","legalEntityId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpirePayerClaim" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "coverageId" text REFERENCES "SpirePayerMemberCoverage"("id") ON DELETE SET NULL,
  "claimType" text NOT NULL,
  "claimNumber" text,
  "serviceFrom" date NOT NULL,
  "serviceTo" date NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "totalCharge" numeric NOT NULL DEFAULT 0,
  "allowedAmount" numeric,
  "paidAmount" numeric,
  "patientResponsibility" numeric,
  "diagnoses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "denialCodes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "submittedAt" timestamptz,
  "adjudicatedAt" timestamptz,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePayerClaim_patient_idx" ON "SpirePayerClaim"("organizationId","legalEntityId","patientId","status","serviceFrom" DESC);

CREATE TABLE IF NOT EXISTS "SpireCommunityPartner" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "partnerType" text NOT NULL,
  "name" text NOT NULL,
  "npi" text,
  "contact" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "allowedCapabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCommunityPartner_idx" ON "SpireCommunityPartner"("organizationId","legalEntityId","status","name");

CREATE TABLE IF NOT EXISTS "SpireCommunityPartnerPatientAccess" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "partnerId" text NOT NULL REFERENCES "SpireCommunityPartner"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "purpose" text NOT NULL,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "startsAt" timestamptz NOT NULL DEFAULT now(),
  "endsAt" timestamptz,
  "grantedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCommunityPartnerPatientAccess_idx" ON "SpireCommunityPartnerPatientAccess"("organizationId","legalEntityId","partnerId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireCapacityBed" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "facility" text NOT NULL,
  "unit" text NOT NULL,
  "room" text NOT NULL,
  "bed" text NOT NULL,
  "levelOfCare" text,
  "status" text NOT NULL DEFAULT 'AVAILABLE',
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "isolationCapability" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "constraints" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","facility","unit","room","bed")
);
CREATE INDEX IF NOT EXISTS "SpireCapacityBed_status_idx" ON "SpireCapacityBed"("organizationId","legalEntityId","facility","unit","status","levelOfCare");

CREATE TABLE IF NOT EXISTS "SpireTransferRequest" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "requestType" text NOT NULL,
  "sourceFacility" text,
  "sourceUnit" text,
  "targetFacility" text,
  "targetService" text,
  "requiredLevelOfCare" text,
  "clinicalReason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'REQUESTED',
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "acceptedAt" timestamptz,
  "assignedBedId" text REFERENCES "SpireCapacityBed"("id") ON DELETE SET NULL,
  "completedAt" timestamptz,
  "requestedById" text,
  "acceptedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireTransferRequest_status_idx" ON "SpireTransferRequest"("organizationId","legalEntityId","status","priority","requestedAt");

CREATE TABLE IF NOT EXISTS "SpireInterfaceEndpoint" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "name" text NOT NULL,
  "interfaceType" text NOT NULL,
  "standard" text,
  "version" text,
  "direction" text NOT NULL DEFAULT 'BIDIRECTIONAL',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "baseUrl" text,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastHeartbeatAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireInterfaceEndpoint_idx" ON "SpireInterfaceEndpoint"("organizationId","legalEntityId","status","interfaceType");

CREATE TABLE IF NOT EXISTS "SpireInterfaceMessage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "endpointId" text REFERENCES "SpireInterfaceEndpoint"("id") ON DELETE SET NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "messageType" text NOT NULL,
  "direction" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "correlationId" text,
  "payloadHash" text,
  "provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "receivedAt" timestamptz,
  "sentAt" timestamptz,
  "processedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireInterfaceMessage_idx" ON "SpireInterfaceMessage"("organizationId","legalEntityId","endpointId","status","createdAt" DESC);
