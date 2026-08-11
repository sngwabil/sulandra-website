-- Strengthen SPIRE chart-access accountability. Existing application routes already
-- append SpireChartAccessEvent rows whenever protected chart resources are opened.
-- This migration makes those records immutable and attaches the active service home
-- whenever it can be derived from the patient/home assignment at insert time.

ALTER TABLE "SpireChartAccessEvent" ADD COLUMN IF NOT EXISTS "homeId" text;

CREATE INDEX IF NOT EXISTS "SpireChartAccessEvent_patient_time_idx"
  ON "SpireChartAccessEvent"("organizationId","patientId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireChartAccessEvent_actor_time_idx"
  ON "SpireChartAccessEvent"("organizationId","actorUserId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireChartAccessEvent_home_time_idx"
  ON "SpireChartAccessEvent"("organizationId","homeId","createdAt" DESC)
  WHERE "homeId" IS NOT NULL;

UPDATE "SpireChartAccessEvent" event
SET "homeId" = assignment."homeId"
FROM LATERAL (
  SELECT patient_home."homeId"
  FROM "SpirePatientHomeAssignment" patient_home
  WHERE patient_home."organizationId"=event."organizationId"
    AND patient_home."patientId"=event."patientId"
    AND patient_home."startsAt"<=event."createdAt"
    AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">event."createdAt")
  ORDER BY patient_home."primary" DESC,patient_home."startsAt" DESC
  LIMIT 1
) assignment
WHERE event."homeId" IS NULL;

CREATE OR REPLACE FUNCTION "spire_chart_access_attach_home"()
RETURNS trigger AS $$
BEGIN
  IF NEW."homeId" IS NULL THEN
    SELECT patient_home."homeId"
      INTO NEW."homeId"
      FROM "SpirePatientHomeAssignment" patient_home
     WHERE patient_home."organizationId"=NEW."organizationId"
       AND patient_home."patientId"=NEW."patientId"
       AND patient_home."startsAt"<=COALESCE(NEW."createdAt",now())
       AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">COALESCE(NEW."createdAt",now()))
     ORDER BY patient_home."primary" DESC,patient_home."startsAt" DESC
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireChartAccessEvent_attach_home" ON "SpireChartAccessEvent";
CREATE TRIGGER "SpireChartAccessEvent_attach_home"
BEFORE INSERT ON "SpireChartAccessEvent"
FOR EACH ROW EXECUTE FUNCTION "spire_chart_access_attach_home"();

CREATE OR REPLACE FUNCTION "spire_chart_access_event_immutable"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpireChartAccessEvent is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireChartAccessEvent_immutable" ON "SpireChartAccessEvent";
CREATE TRIGGER "SpireChartAccessEvent_immutable"
BEFORE UPDATE OR DELETE ON "SpireChartAccessEvent"
FOR EACH ROW EXECUTE FUNCTION "spire_chart_access_event_immutable"();

COMMENT ON COLUMN "SpireChartAccessEvent"."homeId" IS
  'Active service home associated with the patient at the time the chart access event was recorded.';
