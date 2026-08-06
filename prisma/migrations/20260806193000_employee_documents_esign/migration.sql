CREATE TABLE IF NOT EXISTS "EmployeeDocumentTemplate" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "version" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "requiresSignature" BOOLEAN NOT NULL DEFAULT TRUE,
  "requiresWitness" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentTemplate_org_idx" ON "EmployeeDocumentTemplate"("organizationId","active","category","name");
ALTER TABLE "EmployeeDocumentTemplate" DROP CONSTRAINT IF EXISTS "EmployeeDocumentTemplate_category_check";
ALTER TABLE "EmployeeDocumentTemplate" ADD CONSTRAINT "EmployeeDocumentTemplate_category_check" CHECK ("category" IN ('POLICY','HANDBOOK','ONBOARDING','PERFORMANCE','COMPENSATION','BENEFITS','LEAVE','EQUIPMENT','CONFIDENTIALITY','CONSENT','OTHER'));
ALTER TABLE "EmployeeDocumentTemplate" DROP CONSTRAINT IF EXISTS "EmployeeDocumentTemplate_visibility_check";
ALTER TABLE "EmployeeDocumentTemplate" ADD CONSTRAINT "EmployeeDocumentTemplate_visibility_check" CHECK ("visibility" IN ('EMPLOYEE','MANAGEMENT','HR_CONFIDENTIAL'));

CREATE TABLE IF NOT EXISTS "EmployeeDocumentEnvelope" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "templateVersion" TEXT NOT NULL,
  "documentHtml" TEXT NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "signatureOrder" TEXT NOT NULL DEFAULT 'EMPLOYEE_FIRST',
  "managerSignerId" TEXT,
  "witnessSignerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMPTZ,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "voidedAt" TIMESTAMPTZ,
  "voidReason" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentEnvelope_employee_idx" ON "EmployeeDocumentEnvelope"("organizationId","employeeId","status","dueAt");
ALTER TABLE "EmployeeDocumentEnvelope" DROP CONSTRAINT IF EXISTS "EmployeeDocumentEnvelope_status_check";
ALTER TABLE "EmployeeDocumentEnvelope" ADD CONSTRAINT "EmployeeDocumentEnvelope_status_check" CHECK ("status" IN ('PENDING','IN_PROGRESS','COMPLETED','VOIDED','DECLINED','CANCELLED'));
ALTER TABLE "EmployeeDocumentEnvelope" DROP CONSTRAINT IF EXISTS "EmployeeDocumentEnvelope_signature_order_check";
ALTER TABLE "EmployeeDocumentEnvelope" ADD CONSTRAINT "EmployeeDocumentEnvelope_signature_order_check" CHECK ("signatureOrder" IN ('EMPLOYEE_FIRST','MANAGER_FIRST','PARALLEL'));

CREATE TABLE IF NOT EXISTS "EmployeeDocumentSignature" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "envelopeId" TEXT NOT NULL,
  "signerUserId" TEXT NOT NULL,
  "signerRole" TEXT NOT NULL,
  "signatureText" TEXT NOT NULL,
  "signatureType" TEXT NOT NULL,
  "comments" TEXT NOT NULL DEFAULT '',
  "signedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  "signatureHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeDocumentSignature_signer_unique" ON "EmployeeDocumentSignature"("organizationId","envelopeId","signerUserId");
ALTER TABLE "EmployeeDocumentSignature" DROP CONSTRAINT IF EXISTS "EmployeeDocumentSignature_type_check";
ALTER TABLE "EmployeeDocumentSignature" ADD CONSTRAINT "EmployeeDocumentSignature_type_check" CHECK ("signatureType" IN ('TYPED','DRAWN','UPLOADED'));
ALTER TABLE "EmployeeDocumentSignature" DROP CONSTRAINT IF EXISTS "EmployeeDocumentSignature_role_check";
ALTER TABLE "EmployeeDocumentSignature" ADD CONSTRAINT "EmployeeDocumentSignature_role_check" CHECK ("signerRole" IN ('EMPLOYEE','MANAGER','WITNESS','ADMINISTRATOR'));

CREATE TABLE IF NOT EXISTS "EmployeeDocumentEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentEvent_org_idx" ON "EmployeeDocumentEvent"("organizationId","createdAt" DESC);
ALTER TABLE "EmployeeDocumentEvent" DROP CONSTRAINT IF EXISTS "EmployeeDocumentEvent_details_object_check";
ALTER TABLE "EmployeeDocumentEvent" ADD CONSTRAINT "EmployeeDocumentEvent_details_object_check" CHECK (jsonb_typeof("details")='object');
