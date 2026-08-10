CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "EmployeeTimePunch" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "punchType" text NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "locationType" text,
  "clientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "note" text,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "source" text NOT NULL DEFAULT 'WEB',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeTimePunch_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeTimePunch_type_check" CHECK ("punchType" IN ('CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT')),
  CONSTRAINT "EmployeeTimePunch_source_check" CHECK ("source" IN ('WEB','MOBILE','ADMIN_CORRECTION','IMPORT')),
  CONSTRAINT "EmployeeTimePunch_lat_check" CHECK ("latitude" IS NULL OR ("latitude">=-90 AND "latitude"<=90)),
  CONSTRAINT "EmployeeTimePunch_lon_check" CHECK ("longitude" IS NULL OR ("longitude">=-180 AND "longitude"<=180))
);
CREATE INDEX IF NOT EXISTS "EmployeeTimePunch_user_idx" ON "EmployeeTimePunch"("organizationId","legalEntityId","userId","occurredAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_employee_time_punch_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'EmployeeTimePunch is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "EmployeeTimePunch_no_update" ON "EmployeeTimePunch";
CREATE TRIGGER "EmployeeTimePunch_no_update" BEFORE UPDATE ON "EmployeeTimePunch" FOR EACH ROW EXECUTE FUNCTION "prevent_employee_time_punch_mutation"();
DROP TRIGGER IF EXISTS "EmployeeTimePunch_no_delete" ON "EmployeeTimePunch";
CREATE TRIGGER "EmployeeTimePunch_no_delete" BEFORE DELETE ON "EmployeeTimePunch" FOR EACH ROW EXECUTE FUNCTION "prevent_employee_time_punch_mutation"();

CREATE TABLE IF NOT EXISTS "EmployeeTimesheet" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "weekEnding" date NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "totalHours" numeric(7,2) NOT NULL DEFAULT 0,
  "totalMileage" numeric(10,2) NOT NULL DEFAULT 0,
  "notes" text,
  "submittedAt" timestamptz,
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "reviewNotes" text,
  "approvedAt" timestamptz,
  "approvedById" text,
  "paidAt" timestamptz,
  "paidById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeTimesheet_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeTimesheet_user_week_key" UNIQUE ("organizationId","legalEntityId","userId","weekEnding"),
  CONSTRAINT "EmployeeTimesheet_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','PAID','VOID')),
  CONSTRAINT "EmployeeTimesheet_hours_check" CHECK ("totalHours">=0 AND "totalHours"<=168),
  CONSTRAINT "EmployeeTimesheet_mileage_check" CHECK ("totalMileage">=0)
);
CREATE INDEX IF NOT EXISTS "EmployeeTimesheet_entity_status_idx" ON "EmployeeTimesheet"("organizationId","legalEntityId","status","weekEnding" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeTimesheet_user_idx" ON "EmployeeTimesheet"("organizationId","legalEntityId","userId","weekEnding" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeTimesheetLine" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "timesheetId" text NOT NULL REFERENCES "EmployeeTimesheet"("id") ON DELETE CASCADE,
  "workDate" date NOT NULL,
  "payCode" text NOT NULL DEFAULT 'REGULAR',
  "hours" numeric(5,2) NOT NULL DEFAULT 0,
  "mileage" numeric(8,2) NOT NULL DEFAULT 0,
  "clientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "description" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeTimesheetLine_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeTimesheetLine_hours_check" CHECK ("hours">=0 AND "hours"<=24),
  CONSTRAINT "EmployeeTimesheetLine_mileage_check" CHECK ("mileage">=0),
  CONSTRAINT "EmployeeTimesheetLine_pay_check" CHECK ("payCode" IN ('REGULAR','OVERTIME','TRAINING','ORIENTATION','PTO','HOLIDAY','SICK','MILEAGE_ONLY','OTHER'))
);
CREATE INDEX IF NOT EXISTS "EmployeeTimesheetLine_sheet_idx" ON "EmployeeTimesheetLine"("organizationId","legalEntityId","timesheetId","workDate");

CREATE TABLE IF NOT EXISTS "EmployeeDocumentSubmission" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "documentType" text NOT NULL,
  "title" text,
  "originalFileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "content" bytea NOT NULL,
  "status" text NOT NULL DEFAULT 'SUBMITTED',
  "effectiveDate" date,
  "expirationDate" date,
  "notes" text,
  "submittedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "reviewNotes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeDocumentSubmission_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeDocumentSubmission_type_check" CHECK ("documentType" IN ('GOVERNMENT_ID','LICENSE','CERTIFICATION','BACKGROUND_CLEARANCE','VACCINATION_MEDICAL','HANDBOOK_ACKNOWLEDGMENT','DRIVER_DOCUMENT','INSURANCE','DIRECT_DEPOSIT_SUPPORT','OTHER')),
  CONSTRAINT "EmployeeDocumentSubmission_status_check" CHECK ("status" IN ('SUBMITTED','APPROVED','CHANGES_REQUESTED','REJECTED','EXPIRED','ARCHIVED')),
  CONSTRAINT "EmployeeDocumentSubmission_size_check" CHECK ("sizeBytes">0 AND "sizeBytes"<=26214400)
);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentSubmission_user_idx" ON "EmployeeDocumentSubmission"("organizationId","legalEntityId","userId","submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentSubmission_status_idx" ON "EmployeeDocumentSubmission"("organizationId","legalEntityId","status","submittedAt" DESC);
