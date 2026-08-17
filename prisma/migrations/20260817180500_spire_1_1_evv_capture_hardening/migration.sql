-- SPIRE 1.1 EVV call-capture hardening.
-- Keep INSERT and UPDATE branches separate so OLD is never dereferenced for an
-- INSERT trigger invocation. Existing call evidence remains append-only.

CREATE OR REPLACE FUNCTION "spire_evv_capture_calls"() RETURNS trigger AS $$
DECLARE
  v_call_type text;
BEGIN
  v_call_type := CASE WHEN UPPER(COALESCE(NEW."verificationMethod",'')) LIKE '%MOBILE%' THEN 'Mobile'
                      WHEN UPPER(COALESCE(NEW."verificationMethod",'')) LIKE '%TELE%' THEN 'Telephony'
                      WHEN UPPER(COALESCE(NEW."verificationMethod",'')) LIKE '%OTHER%' THEN 'Other'
                      ELSE 'Manual' END;

  IF TG_OP='INSERT' THEN
    IF NEW."clockInAt" IS NOT NULL THEN
      INSERT INTO "SpireEvvCall"(
        "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
        "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
        "latitude","longitude","capturedFrom"
      ) VALUES(
        NEW."organizationId",NEW."legalEntityId",NEW."patientId",NEW."id",COALESCE(NEW."visitOtherId",NEW."id")||'-IN','Call In',
        NEW."clockInAt",v_call_type,COALESCE(NEW."procedureCode",NEW."serviceCode"),NEW."patientOtherId",NEW."visitLocationType",
        NEW."clockInLatitude",NEW."clockInLongitude",'SPIRE_RUNTIME'
      ) ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;
    END IF;
    IF NEW."clockOutAt" IS NOT NULL THEN
      INSERT INTO "SpireEvvCall"(
        "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
        "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
        "latitude","longitude","capturedFrom"
      ) VALUES(
        NEW."organizationId",NEW."legalEntityId",NEW."patientId",NEW."id",COALESCE(NEW."visitOtherId",NEW."id")||'-OUT','Call Out',
        NEW."clockOutAt",v_call_type,COALESCE(NEW."procedureCode",NEW."serviceCode"),NEW."patientOtherId",NEW."visitLocationType",
        NEW."clockOutLatitude",NEW."clockOutLongitude",'SPIRE_RUNTIME'
      ) ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;
    END IF;
  ELSIF TG_OP='UPDATE' THEN
    IF NEW."clockInAt" IS NOT NULL AND OLD."clockInAt" IS NULL THEN
      INSERT INTO "SpireEvvCall"(
        "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
        "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
        "latitude","longitude","capturedFrom"
      ) VALUES(
        NEW."organizationId",NEW."legalEntityId",NEW."patientId",NEW."id",COALESCE(NEW."visitOtherId",NEW."id")||'-IN','Call In',
        NEW."clockInAt",v_call_type,COALESCE(NEW."procedureCode",NEW."serviceCode"),NEW."patientOtherId",NEW."visitLocationType",
        NEW."clockInLatitude",NEW."clockInLongitude",'SPIRE_RUNTIME'
      ) ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;
    END IF;
    IF NEW."clockOutAt" IS NOT NULL AND OLD."clockOutAt" IS NULL THEN
      INSERT INTO "SpireEvvCall"(
        "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
        "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
        "latitude","longitude","capturedFrom"
      ) VALUES(
        NEW."organizationId",NEW."legalEntityId",NEW."patientId",NEW."id",COALESCE(NEW."visitOtherId",NEW."id")||'-OUT','Call Out',
        NEW."clockOutAt",v_call_type,COALESCE(NEW."procedureCode",NEW."serviceCode"),NEW."patientOtherId",NEW."visitLocationType",
        NEW."clockOutLatitude",NEW."clockOutLongitude",'SPIRE_RUNTIME'
      ) ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
