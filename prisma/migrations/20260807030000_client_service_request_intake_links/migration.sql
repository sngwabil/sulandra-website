ALTER TABLE "ClientServiceRequest" ADD COLUMN IF NOT EXISTS "intakeImportId" TEXT;
ALTER TABLE "ClientServiceRequest" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_org_intake_idx" ON "ClientServiceRequest"("organizationId","intakeImportId");
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_org_client_idx" ON "ClientServiceRequest"("organizationId","clientId");
