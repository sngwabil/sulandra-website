-- SPIRE 1.1 Step 2 integrity hardening.
-- Enforce patient/service coherence at the database boundary so a failed API
-- request cannot leave a draft linked to another individual's authorization/EVV.

CREATE OR REPLACE FUNCTION "spire_dodd_document_link_guard"() RETURNS trigger AS $$
DECLARE
  v_patient text;
  v_code text;
BEGIN
  IF NEW."authorizationId" IS NOT NULL THEN
    SELECT "patientId","serviceCode" INTO v_patient,v_code
      FROM "SpireServiceAuthorization"
     WHERE "organizationId"=NEW."organizationId" AND "id"=NEW."authorizationId";
    IF v_patient IS NULL OR v_patient<>NEW."patientId" THEN
      RAISE EXCEPTION 'Linked service authorization does not belong to this individual';
    END IF;
    IF NEW."serviceCode" IS NOT NULL AND v_code IS NOT NULL AND NEW."serviceCode"<>v_code THEN
      RAISE EXCEPTION 'DODD service-document code does not match linked authorization';
    END IF;
  END IF;

  IF NEW."evvVisitId" IS NOT NULL THEN
    v_patient := NULL; v_code := NULL;
    SELECT "patientId","serviceCode" INTO v_patient,v_code
      FROM "SpireEvvVisit"
     WHERE "organizationId"=NEW."organizationId" AND "id"=NEW."evvVisitId";
    IF v_patient IS NULL OR v_patient<>NEW."patientId" THEN
      RAISE EXCEPTION 'Linked EVV visit does not belong to this individual';
    END IF;
    IF NEW."serviceCode" IS NOT NULL AND v_code IS NOT NULL AND NEW."serviceCode"<>v_code THEN
      RAISE EXCEPTION 'DODD service-document code does not match linked EVV visit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireDoddServiceDocument_link_guard_trg" ON "SpireDoddServiceDocument";
CREATE TRIGGER "SpireDoddServiceDocument_link_guard_trg"
BEFORE INSERT OR UPDATE ON "SpireDoddServiceDocument"
FOR EACH ROW EXECUTE FUNCTION "spire_dodd_document_link_guard"();

ALTER TABLE "SpireDoddServiceDocument"
  DROP CONSTRAINT IF EXISTS "SpireDoddServiceDocument_completion_evidence_ck";
ALTER TABLE "SpireDoddServiceDocument"
  ADD CONSTRAINT "SpireDoddServiceDocument_completion_evidence_ck" CHECK (
    "status"='DRAFT' OR ("completedByUserId" IS NOT NULL AND "completedAt" IS NOT NULL)
  );

ALTER TABLE "SpireDoddServiceDocument"
  DROP CONSTRAINT IF EXISTS "SpireDoddServiceDocument_signature_evidence_ck";
ALTER TABLE "SpireDoddServiceDocument"
  ADD CONSTRAINT "SpireDoddServiceDocument_signature_evidence_ck" CHECK (
    "status" NOT IN ('SIGNED','VOID') OR (
      "signedByUserId" IS NOT NULL AND "signerEmail" IS NOT NULL AND
      "signerDisplayName" IS NOT NULL AND "signatureIntent" IS NOT NULL AND "signedAt" IS NOT NULL
    )
  );

ALTER TABLE "SpireDoddServiceDocument"
  DROP CONSTRAINT IF EXISTS "SpireDoddServiceDocument_void_evidence_ck";
ALTER TABLE "SpireDoddServiceDocument"
  ADD CONSTRAINT "SpireDoddServiceDocument_void_evidence_ck" CHECK (
    "status"<>'VOID' OR ("voidedByUserId" IS NOT NULL AND "voidReason" IS NOT NULL AND "voidedAt" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION "spire_reject_retention_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SPIRE record-retention state cannot be deleted; use controlled disposition evidence';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireRecordRetention_no_delete_trg" ON "SpireRecordRetention";
CREATE TRIGGER "SpireRecordRetention_no_delete_trg"
BEFORE DELETE ON "SpireRecordRetention"
FOR EACH ROW EXECUTE FUNCTION "spire_reject_retention_delete"();
