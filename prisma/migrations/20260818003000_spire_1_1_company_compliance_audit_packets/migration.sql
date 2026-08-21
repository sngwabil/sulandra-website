-- SPIRE 1.1 Phase C / Step 2
-- Cross-system Company Compliance QA snapshots and immutable audit packets.
-- The packet freezes evidence references and system QA state; it does not fabricate
-- external regulator/vendor submissions or certification status.

CREATE TABLE IF NOT EXISTS "CompanyComplianceAuditPacket" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "packetNumber" text NOT NULL,
  "packetType" text NOT NULL DEFAULT 'REGULATORY_QA',
  "label" text,
  "periodStart" date NOT NULL,
  "periodEnd" date NOT NULL,
  "generatedByUserId" text NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "snapshotSha256" text NOT NULL,
  "sourceIndex" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "exceptionSummary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  CONSTRAINT "CompanyComplianceAuditPacket_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyComplianceAuditPacket_type_ck"
    CHECK ("packetType" IN ('REGULATORY_QA')),
  CONSTRAINT "CompanyComplianceAuditPacket_dates_ck"
    CHECK ("periodEnd">="periodStart"),
  CONSTRAINT "CompanyComplianceAuditPacket_hash_ck"
    CHECK ("snapshotSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "CompanyComplianceAuditPacket_number_key"
    UNIQUE("organizationId","legalEntityId","packetNumber")
);
CREATE INDEX IF NOT EXISTS "CompanyComplianceAuditPacket_period_idx"
  ON "CompanyComplianceAuditPacket"("organizationId","legalEntityId","periodStart","periodEnd","generatedAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_company_compliance_audit_packet_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CompanyComplianceAuditPacket is immutable; generate a new packet instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "CompanyComplianceAuditPacket_no_update" ON "CompanyComplianceAuditPacket";
CREATE TRIGGER "CompanyComplianceAuditPacket_no_update"
BEFORE UPDATE ON "CompanyComplianceAuditPacket"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_compliance_audit_packet_mutation"();

DROP TRIGGER IF EXISTS "CompanyComplianceAuditPacket_no_delete" ON "CompanyComplianceAuditPacket";
CREATE TRIGGER "CompanyComplianceAuditPacket_no_delete"
BEFORE DELETE ON "CompanyComplianceAuditPacket"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_compliance_audit_packet_mutation"();
