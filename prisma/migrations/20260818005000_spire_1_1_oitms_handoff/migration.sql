-- SPIRE 1.1 Phase C / Step 4
-- Provider -> county-board -> OITMS handoff evidence.
-- No direct OITMS API or submission is claimed by this schema.

CREATE TABLE IF NOT EXISTS "SpireIncidentOitmsHandoff" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL,
  "regulatoryCaseId" text NOT NULL,
  "handoffNumber" text NOT NULL,
  "handoffMode" text NOT NULL DEFAULT 'COUNTY_BOARD_FOR_OITMS',
  "generatedByUserId" text NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "packageSha256" text NOT NULL,
  "packageSnapshot" jsonb NOT NULL,
  "authority" text NOT NULL DEFAULT 'Ohio Administrative Code 5123-17-02',
  "authorityUrl" text NOT NULL DEFAULT 'https://codes.ohio.gov/ohio-administrative-code/rule-5123-17-02',
  "notes" text,
  CONSTRAINT "SpireIncidentOitmsHandoff_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireIncidentOitmsHandoff_case_fkey"
    FOREIGN KEY ("regulatoryCaseId") REFERENCES "SpireIncidentRegulatoryCase"("id") ON DELETE RESTRICT,
  CONSTRAINT "SpireIncidentOitmsHandoff_mode_ck"
    CHECK ("handoffMode"='COUNTY_BOARD_FOR_OITMS'),
  CONSTRAINT "SpireIncidentOitmsHandoff_hash_ck"
    CHECK ("packageSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SpireIncidentOitmsHandoff_number_key"
    UNIQUE("organizationId","legalEntityId","handoffNumber")
);
CREATE INDEX IF NOT EXISTS "SpireIncidentOitmsHandoff_incident_idx"
  ON "SpireIncidentOitmsHandoff"("organizationId","legalEntityId","patientId","incidentId","generatedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireIncidentOitmsHandoffEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "handoffId" text NOT NULL REFERENCES "SpireIncidentOitmsHandoff"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "occurredAt" timestamptz NOT NULL,
  "submissionMethod" text,
  "externalReference" text,
  "evidenceDocumentId" text,
  "notes" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIncidentOitmsHandoffEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireIncidentOitmsHandoffEvent_type_ck" CHECK ("eventType" IN (
    'PACKAGE_GENERATED',
    'SUBMITTED_TO_COUNTY_BOARD',
    'COUNTY_BOARD_ACKNOWLEDGED',
    'OITMS_REFERENCE_RECORDED',
    'RETURNED_FOR_CORRECTION',
    'RESUBMITTED_TO_COUNTY_BOARD',
    'CLOSURE_RECOMMENDED',
    'CLOSED_EXTERNALLY'
  ))
);
CREATE INDEX IF NOT EXISTS "SpireIncidentOitmsHandoffEvent_handoff_idx"
  ON "SpireIncidentOitmsHandoffEvent"("organizationId","legalEntityId","handoffId","occurredAt","createdAt");

CREATE OR REPLACE FUNCTION "prevent_spire_oitms_handoff_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OhioITMS handoff evidence is append-only; generate a new package/event instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireIncidentOitmsHandoff_no_update" ON "SpireIncidentOitmsHandoff";
CREATE TRIGGER "SpireIncidentOitmsHandoff_no_update" BEFORE UPDATE OR DELETE ON "SpireIncidentOitmsHandoff" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_oitms_handoff_mutation"();
DROP TRIGGER IF EXISTS "SpireIncidentOitmsHandoffEvent_no_update" ON "SpireIncidentOitmsHandoffEvent";
CREATE TRIGGER "SpireIncidentOitmsHandoffEvent_no_update" BEFORE UPDATE OR DELETE ON "SpireIncidentOitmsHandoffEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_oitms_handoff_mutation"();
