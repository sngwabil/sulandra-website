CREATE TABLE IF NOT EXISTS "SpireIntakeMappedField" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sourceSubmissionId" TEXT NOT NULL,
  "sourceField" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("organizationId","clientId","domain","fieldKey")
);
CREATE INDEX IF NOT EXISTS "SpireIntakeMappedField_client_idx" ON "SpireIntakeMappedField"("organizationId","clientId");

CREATE TABLE IF NOT EXISTS "SpireClinicalCatalog" (
  "moduleKey" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SpireClientClinicalModule" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL REFERENCES "SpireClinicalCatalog"("moduleKey"),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "configuration" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("organizationId","clientId","moduleKey")
);
CREATE INDEX IF NOT EXISTS "SpireClientClinicalModule_client_idx" ON "SpireClientClinicalModule"("organizationId","clientId");

CREATE TABLE IF NOT EXISTS "SpireFlowsheetTemplate" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("organizationId","key")
);

CREATE TABLE IF NOT EXISTS "SpireFlowsheetEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "rowKey" TEXT NOT NULL,
  "eventTime" TIMESTAMP(3) NOT NULL,
  "value" JSONB NOT NULL,
  "note" TEXT,
  "lateEntryReason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'WEB',
  "authorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amendsEventId" TEXT REFERENCES "SpireFlowsheetEvent"("id")
);
CREATE INDEX IF NOT EXISTS "SpireFlowsheetEvent_chart_idx" ON "SpireFlowsheetEvent"("organizationId","clientId","templateKey","eventTime");
CREATE INDEX IF NOT EXISTS "SpireFlowsheetEvent_amends_idx" ON "SpireFlowsheetEvent"("amendsEventId");

CREATE TABLE IF NOT EXISTS "SpireComplianceRequirementStatus" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'MISSING',
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "lastEvidenceAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("organizationId","clientId","requirementKey")
);
CREATE INDEX IF NOT EXISTS "SpireComplianceRequirementStatus_client_idx" ON "SpireComplianceRequirementStatus"("organizationId","clientId","domain");

INSERT INTO "SpireClinicalCatalog"("moduleKey","name","category","description","definition") VALUES
('RN_LPN_VISITS','RN / LPN Visits','Assessment & Visits','Comprehensive/focused assessments, skilled visits, supervisory visits, recertification, care coordination and verbal orders','{}'),
('WOUND_SKIN','Wound / Skin','Wound & Skin','Wound measurement, tissue, drainage, staging, dressing, photos and trend','{}'),
('FOLEY_URINARY','Urinary / Foley','Urinary & Renal','Indwelling/suprapubic/intermittent catheter care, output and UTI monitoring','{}'),
('ENTERAL_GI','Enteral / GI','GI & Nutrition','G/J tube, feeding, flushes, bowel program, ostomy, hydration and intake/output','{}'),
('RESPIRATORY','Respiratory','Respiratory','Oxygen, SpO2, nebulizer, trach, suctioning and respiratory assessment','{}'),
('DIABETES','Diabetes / Endocrine','Diabetes & Endocrine','Glucose, CGM, insulin, pump observation and hypo/hyperglycemia protocols','{}'),
('IV_INFUSION','IV / Infusion','Infusion & Vascular','Peripheral/central access, infusion, central-line dressing and pump documentation','{}'),
('SEIZURE_NEURO','Seizure / Neuro','Neurologic','Seizure log, rescue medication, VNS, post-ictal and neurologic checks','{}'),
('CARDIOVASCULAR','Cardiovascular','Cardiovascular','BP, orthostatics, edema, daily weight and CHF monitoring','{}'),
('MED_TREATMENTS','Medication / Treatments','Medication & Treatment','eMAR/TAR, PRN effectiveness, injections, topical and treatment records','{}'),
('FUNCTIONAL_MSK','Functional / Musculoskeletal','Functional','ROM, positioning, transfers, gait, lift support and fall follow-up','{}'),
('BEHAVIOR_PSYCH','Psychosocial / Behavior','Behavioral','Behavior observations, restrictive measures, antecedents, duration and notifications','{}'),
('PALLIATIVE','Palliative / Comfort','Palliative','Comfort symptoms, advance directives and end-of-life coordination','{}')
ON CONFLICT("moduleKey") DO UPDATE SET "name"=EXCLUDED."name","category"=EXCLUDED."category","description"=EXCLUDED."description","updatedAt"=NOW();
