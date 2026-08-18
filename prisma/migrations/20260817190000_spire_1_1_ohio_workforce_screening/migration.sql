-- SPIRE 1.1 Phase B / Step 4
-- Ohio workforce-screening evidence integrated with Employee 360 compliance.
-- External registry/criminal-check results are evidence records, never fabricated live lookups.

CREATE TABLE IF NOT EXISTS "EmployeeOhioScreeningProfileVersion" (
  "id" text PRIMARY KEY,
  "profileCode" text NOT NULL,
  "version" integer NOT NULL,
  "name" text NOT NULL,
  "effectiveFrom" date NOT NULL,
  "effectiveTo" date,
  "renewalDays" integer NOT NULL DEFAULT 1825,
  "requirements" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "authority" text NOT NULL,
  "authorityUrl" text NOT NULL,
  "reviewedOn" date NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeOhioScreeningProfileVersion_dates_ck" CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom"),
  CONSTRAINT "EmployeeOhioScreeningProfileVersion_version_ck" CHECK ("version">0),
  CONSTRAINT "EmployeeOhioScreeningProfileVersion_code_version_key" UNIQUE("profileCode","version")
);

CREATE TABLE IF NOT EXISTS "EmployeeOhioScreeningCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "employeeId" text NOT NULL,
  "profileVersionId" text NOT NULL REFERENCES "EmployeeOhioScreeningProfileVersion"("id") ON DELETE RESTRICT,
  "positionTitle" text,
  "directCare" boolean NOT NULL DEFAULT true,
  "transportDuties" boolean NOT NULL DEFAULT false,
  "ohioResidentFiveYears" boolean,
  "rapbackUnavailable" boolean NOT NULL DEFAULT false,
  "conditionalEmployment" boolean NOT NULL DEFAULT false,
  "conditionalStartDate" date,
  "hireDate" date,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "lastEvaluatedAt" timestamptz,
  "nextRecheckDate" date,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeOhioScreeningCase_entity_fkey" FOREIGN KEY("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeOhioScreeningCase_status_ck" CHECK ("status" IN ('IN_PROGRESS','CONDITIONAL','ELIGIBLE','BLOCKED','EXPIRED')),
  CONSTRAINT "EmployeeOhioScreeningCase_profile_employee_key" UNIQUE("organizationId","legalEntityId","employeeId","profileVersionId")
);
CREATE INDEX IF NOT EXISTS "EmployeeOhioScreeningCase_employee_idx" ON "EmployeeOhioScreeningCase"("organizationId","employeeId","legalEntityId","updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeOhioScreeningCase_status_idx" ON "EmployeeOhioScreeningCase"("organizationId","legalEntityId","status","nextRecheckDate");

CREATE TABLE IF NOT EXISTS "EmployeeOhioScreeningCheck" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text NOT NULL REFERENCES "EmployeeOhioScreeningCase"("id") ON DELETE RESTRICT,
  "checkCode" text NOT NULL,
  "result" text NOT NULL,
  "checkedAt" timestamptz NOT NULL,
  "expiresAt" date,
  "externalReference" text,
  "evidenceDocumentId" text,
  "evidenceSummary" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verifiedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeOhioScreeningCheck_entity_fkey" FOREIGN KEY("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeOhioScreeningCheck_result_ck" CHECK ("result" IN ('CLEAR','COMPLETED','ENROLLED','PENDING','HIT','DISQUALIFYING','NOT_APPLICABLE','UNAVAILABLE','EXPIRED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeOhioScreeningCheck_case_idx" ON "EmployeeOhioScreeningCheck"("organizationId","legalEntityId","caseId","checkCode","checkedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeOhioScreeningEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text NOT NULL REFERENCES "EmployeeOhioScreeningCase"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "reason" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeOhioScreeningEvent_entity_fkey" FOREIGN KEY("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "EmployeeOhioScreeningEvent_case_idx" ON "EmployeeOhioScreeningEvent"("organizationId","legalEntityId","caseId","createdAt");

CREATE OR REPLACE FUNCTION "prevent_employee_ohio_screening_evidence_mutation"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Ohio workforce-screening evidence is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "EmployeeOhioScreeningProfileVersion_no_update" ON "EmployeeOhioScreeningProfileVersion";
CREATE TRIGGER "EmployeeOhioScreeningProfileVersion_no_update" BEFORE UPDATE OR DELETE ON "EmployeeOhioScreeningProfileVersion" FOR EACH ROW EXECUTE FUNCTION "prevent_employee_ohio_screening_evidence_mutation"();
DROP TRIGGER IF EXISTS "EmployeeOhioScreeningCheck_no_update" ON "EmployeeOhioScreeningCheck";
CREATE TRIGGER "EmployeeOhioScreeningCheck_no_update" BEFORE UPDATE OR DELETE ON "EmployeeOhioScreeningCheck" FOR EACH ROW EXECUTE FUNCTION "prevent_employee_ohio_screening_evidence_mutation"();
DROP TRIGGER IF EXISTS "EmployeeOhioScreeningEvent_no_update" ON "EmployeeOhioScreeningEvent";
CREATE TRIGGER "EmployeeOhioScreeningEvent_no_update" BEFORE UPDATE OR DELETE ON "EmployeeOhioScreeningEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_employee_ohio_screening_evidence_mutation"();

INSERT INTO "EmployeeOhioScreeningProfileVersion"("id","profileCode","version","name","effectiveFrom","renewalDays","requirements","authority","authorityUrl","reviewedOn") VALUES
('system-oh-dodd-direct-v1','OH_DODD_DIRECT_SERVICES',1,'Ohio DODD direct-services workforce screening','2026-02-19',1825,
'[
 {"code":"EMPLOYMENT_APPLICATION","label":"Employment application and employer history","result":"COMPLETED"},
 {"code":"REFERENCE_ATTEMPT","label":"Present/former employer reference attempts","result":"COMPLETED"},
 {"code":"OIG_EXCLUSION","label":"HHS OIG exclusion list","result":"CLEAR","renewalDays":1825},
 {"code":"DODD_ABUSER_REGISTRY","label":"DODD Abuser Registry","result":"CLEAR","renewalDays":1825},
 {"code":"OH_NURSE_AIDE_REGISTRY","label":"Ohio Nurse Aide Registry","result":"CLEAR","renewalDays":1825},
 {"code":"OH_SEX_OFFENDER","label":"Ohio sex offender/child-victim offender database","result":"CLEAR","renewalDays":1825},
 {"code":"SAM_EXCLUSION","label":"System for Award Management","result":"CLEAR","renewalDays":1825},
 {"code":"OH_MEDICAID_EXCLUSION","label":"Ohio Medicaid exclusion/suspension list","result":"CLEAR","renewalDays":1825},
 {"code":"OH_DRC_OFFENDER","label":"Ohio DRC incarcerated/supervised offender search","result":"CLEAR","renewalDays":1825,"reviewOnly":true},
 {"code":"DISQUALIFYING_OFFENSE_ATTESTATION","label":"Signed disqualifying-offense attestation","result":"COMPLETED"},
 {"code":"FOURTEEN_DAY_NOTIFICATION_AGREEMENT","label":"Signed 14-day criminal-charge notification agreement","result":"COMPLETED"},
 {"code":"BCI_CRIMINAL_CHECK","label":"BCI criminal records check","result":"CLEAR"},
 {"code":"FBI_CRIMINAL_CHECK","label":"FBI criminal records check when five-year Ohio residency proof is absent","result":"CLEAR","conditional":"FBI_IF_NO_OHIO_5Y"},
 {"code":"RAPBACK_ENROLLMENT","label":"Rapback enrollment/maintenance","result":"ENROLLED","conditional":"RAPBACK_REQUIRED"},
 {"code":"VALID_DRIVER_LICENSE","label":"Valid driver license for transport duties","result":"CLEAR","conditional":"TRANSPORT"},
 {"code":"BMV_DRIVING_RECORD","label":"BMV driving record under six points in preceding 24 months","result":"CLEAR","conditional":"TRANSPORT"}
]'::jsonb,
'Ohio Administrative Code 5123-2-02','https://codes.ohio.gov/ohio-administrative-code/rule-5123-2-02','2026-08-17'),
('system-oh-hha-direct-v1','OH_HOME_HEALTH_DIRECT_CARE',1,'Ohio Home Health direct-care workforce screening','2023-01-27',1825,
'[
 {"code":"SAM_EXCLUSION","label":"System for Award Management","result":"CLEAR","renewalDays":1825},
 {"code":"OIG_EXCLUSION","label":"HHS OIG exclusion list","result":"CLEAR","renewalDays":1825},
 {"code":"DODD_ABUSER_REGISTRY","label":"DODD abuse/neglect/misappropriation registry","result":"CLEAR","renewalDays":1825},
 {"code":"OH_SEX_OFFENDER","label":"Ohio sex offender/child-victim offender database","result":"CLEAR","renewalDays":1825},
 {"code":"OH_DRC_OFFENDER","label":"Ohio DRC inmate database","result":"CLEAR","renewalDays":1825},
 {"code":"OH_NURSE_AIDE_REGISTRY","label":"Ohio Nurse Aide Registry plus prior-state registry when residency rule applies","result":"CLEAR","renewalDays":1825},
 {"code":"BCI_CRIMINAL_CHECK","label":"Ohio criminal records check","result":"CLEAR","renewalDays":1825},
 {"code":"FBI_CRIMINAL_CHECK","label":"FBI criminal records check when five-year Ohio residency proof/recent FBI evidence is absent","result":"CLEAR","conditional":"FBI_IF_NO_OHIO_5Y"},
 {"code":"FINGERPRINT_FORMS","label":"Required fingerprint forms/impressions","result":"COMPLETED"}
]'::jsonb,
'Ohio Administrative Code Chapter 3701-60','https://codes.ohio.gov/ohio-administrative-code/chapter-3701-60','2026-08-17')
ON CONFLICT DO NOTHING;
