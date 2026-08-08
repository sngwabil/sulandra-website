CREATE TABLE IF NOT EXISTS "SpireServiceAuthorization" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,"authorizationNumber" text,"payer" text NOT NULL DEFAULT 'MEDICAID',"waiverType" text,"serviceCode" text NOT NULL,"serviceName" text NOT NULL,"unitType" text NOT NULL DEFAULT 'UNIT',"authorizedUnits" numeric(14,2) NOT NULL DEFAULT 0,"deliveredUnits" numeric(14,2) NOT NULL DEFAULT 0,"billedUnits" numeric(14,2) NOT NULL DEFAULT 0,"startDate" date NOT NULL,"endDate" date NOT NULL,"status" text NOT NULL DEFAULT 'ACTIVE',"notes" text,"createdById" text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
);
-- Upgrade the older foundation-era authorization table in place before indexing it.
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "authorizationNumber" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "payer" text NOT NULL DEFAULT 'MEDICAID';
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "waiverType" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "serviceCode" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "serviceName" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "unitType" text NOT NULL DEFAULT 'UNIT';
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "authorizedUnits" numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "deliveredUnits" numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "billedUnits" numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "startsAt" date;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "endsAt" date;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "startDate" date;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "endDate" date;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "createdById" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
UPDATE "SpireServiceAuthorization" SET "serviceCode"=COALESCE(NULLIF("serviceCode",''),'UNSPECIFIED'),"serviceName"=COALESCE(NULLIF("serviceName",''),NULLIF("serviceCode",''),'Authorized Service'),"startDate"=COALESCE("startDate","startsAt",CURRENT_DATE),"endDate"=COALESCE("endDate","endsAt","startDate","startsAt",CURRENT_DATE);
ALTER TABLE "SpireServiceAuthorization" ALTER COLUMN "serviceCode" SET NOT NULL;
ALTER TABLE "SpireServiceAuthorization" ALTER COLUMN "serviceName" SET NOT NULL;
ALTER TABLE "SpireServiceAuthorization" ALTER COLUMN "startDate" SET NOT NULL;
ALTER TABLE "SpireServiceAuthorization" ALTER COLUMN "endDate" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "SpireServiceAuthorization_patient_idx" ON "SpireServiceAuthorization"("organizationId","patientId","status","endDate");
CREATE UNIQUE INDEX IF NOT EXISTS "SpireServiceAuthorization_number_idx" ON "SpireServiceAuthorization"("organizationId","authorizationNumber") WHERE "authorizationNumber" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "SpireEvvVisit" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,"authorizationId" text REFERENCES "SpireServiceAuthorization"("id") ON DELETE SET NULL,"employeeUserId" text,"appointmentId" text REFERENCES "SpireAppointment"("id") ON DELETE SET NULL,"serviceCode" text NOT NULL,"scheduledStart" timestamptz,"scheduledEnd" timestamptz,"clockInAt" timestamptz,"clockOutAt" timestamptz,"clockInLatitude" numeric(10,7),"clockInLongitude" numeric(10,7),"clockOutLatitude" numeric(10,7),"clockOutLongitude" numeric(10,7),"verificationMethod" text,"status" text NOT NULL DEFAULT 'OPEN',"units" numeric(14,2) NOT NULL DEFAULT 0,"exceptionCode" text,"exceptionReason" text,"verifiedAt" timestamptz,"verifiedById" text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "authorizationId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "employeeUserId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "appointmentId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "serviceCode" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "scheduledStart" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "scheduledEnd" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "clockInAt" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "clockOutAt" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "clockInLatitude" numeric(10,7);
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "clockInLongitude" numeric(10,7);
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "clockOutLatitude" numeric(10,7);
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "clockOutLongitude" numeric(10,7);
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "verificationMethod" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'OPEN';
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "units" numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "exceptionCode" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "exceptionReason" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "verifiedAt" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "verifiedById" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "SpireEvvVisit_patient_idx" ON "SpireEvvVisit"("organizationId","patientId","clockInAt");
CREATE INDEX IF NOT EXISTS "SpireEvvVisit_auth_idx" ON "SpireEvvVisit"("organizationId","authorizationId","status");

CREATE TABLE IF NOT EXISTS "SpireAuthorizationLedger" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"authorizationId" text NOT NULL REFERENCES "SpireServiceAuthorization"("id") ON DELETE CASCADE,"patientId" text NOT NULL,"evvVisitId" text REFERENCES "SpireEvvVisit"("id") ON DELETE SET NULL,"entryType" text NOT NULL,"units" numeric(14,2) NOT NULL,"serviceDate" date NOT NULL,"reference" text,"notes" text,"createdById" text,"createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAuthorizationLedger_auth_idx" ON "SpireAuthorizationLedger"("organizationId","authorizationId","serviceDate");

CREATE TABLE IF NOT EXISTS "SpireAuthorizationAlert" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"authorizationId" text NOT NULL REFERENCES "SpireServiceAuthorization"("id") ON DELETE CASCADE,"patientId" text NOT NULL,"alertType" text NOT NULL,"severity" text NOT NULL DEFAULT 'WARNING',"message" text NOT NULL,"status" text NOT NULL DEFAULT 'OPEN',"acknowledgedAt" timestamptz,"acknowledgedById" text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAuthorizationAlert_open_idx" ON "SpireAuthorizationAlert"("organizationId","patientId","status","severity");

CREATE TABLE IF NOT EXISTS "SpireBillingReconciliation" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"patientId" text NOT NULL,"authorizationId" text REFERENCES "SpireServiceAuthorization"("id") ON DELETE SET NULL,"evvVisitId" text REFERENCES "SpireEvvVisit"("id") ON DELETE SET NULL,"serviceDate" date NOT NULL,"serviceCode" text NOT NULL,"deliveredUnits" numeric(14,2) NOT NULL DEFAULT 0,"billableUnits" numeric(14,2) NOT NULL DEFAULT 0,"billedUnits" numeric(14,2) NOT NULL DEFAULT 0,"status" text NOT NULL DEFAULT 'PENDING',"exceptionReason" text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireBillingReconciliation_status_idx" ON "SpireBillingReconciliation"("organizationId","status","serviceDate");