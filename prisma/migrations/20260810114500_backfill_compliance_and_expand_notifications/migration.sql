-- Backfill existing operational credentials using to_jsonb so the migration
-- remains tolerant of optional fields added at different times.
DO $$
DECLARE r record; j jsonb; exp date; source_id text; user_id text; discipline text;
BEGIN
  IF to_regclass('"HomeHealthStaffProfile"') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT to_jsonb(t) AS j FROM "HomeHealthStaffProfile" t' LOOP
      j:=r.j; user_id:=COALESCE(j->>'userId',j->>'employeeUserId'); source_id:=COALESCE(j->>'id',concat_ws(':',user_id,j->>'discipline')); discipline:=COALESCE(j->>'discipline','CLINICAL');
      BEGIN exp:=COALESCE(NULLIF(j->>'licenseExpirationDate','')::date,NULLIF(j->>'licenseExpiresAt','')::timestamptz::date,NULLIF(j->>'credentialExpiresAt','')::timestamptz::date,NULLIF(j->>'expirationDate','')::date); EXCEPTION WHEN others THEN exp:=NULL; END;
      PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','HomeHealthStaffProfile',source_id,'HOME_HEALTH',concat('Home Health ',replace(discipline,'_',' '),' credential — ',COALESCE(user_id,source_id)),'Applicable professional licensing / credential authority',exp,user_id,jsonb_build_object('discipline',discipline,'licenseNumber',COALESCE(j->>'licenseNumber',j->>'credentialNumber')));
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE r record; j jsonb; exp date; bg_exp date; source_id text; user_id text;
BEGIN
  IF to_regclass('"NmtDriverProfile"') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT to_jsonb(t) AS j FROM "NmtDriverProfile" t' LOOP
      j:=r.j; user_id:=COALESCE(j->>'userId',j->>'employeeUserId'); source_id:=COALESCE(j->>'id',user_id);
      BEGIN exp:=COALESCE(NULLIF(j->>'driverLicenseExpiresAt','')::timestamptz::date,NULLIF(j->>'licenseExpirationDate','')::date,NULLIF(j->>'licenseExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN exp:=NULL; END;
      BEGIN bg_exp:=COALESCE(NULLIF(j->>'backgroundCheckExpiresAt','')::timestamptz::date,NULLIF(j->>'backgroundCheckExpirationDate','')::date,NULLIF(j->>'screeningExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN bg_exp:=NULL; END;
      PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','NmtDriverProfile',source_id,'DRIVER_COMPLIANCE',concat('NMT driver license / qualification — ',COALESCE(user_id,source_id)),'Ohio BMV / Sulandra NMT',exp,user_id,jsonb_build_object('driverLicenseNumber',COALESCE(j->>'driverLicenseNumber',j->>'licenseNumber'),'licenseState',COALESCE(j->>'licenseState',j->>'driverLicenseState')));
      IF bg_exp IS NOT NULL THEN PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','NmtDriverProfile',concat(source_id,':BACKGROUND'),'DRIVER_COMPLIANCE',concat('NMT driver background / screening — ',COALESCE(user_id,source_id)),'Applicable payer / regulatory requirements',bg_exp,user_id,jsonb_build_object('parentDriverProfileId',source_id)); END IF;
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE r record; j jsonb; reg_exp date; ins_exp date; insp_exp date; source_id text; label text;
BEGIN
  IF to_regclass('"NmtVehicle"') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT to_jsonb(t) AS j FROM "NmtVehicle" t' LOOP
      j:=r.j; source_id:=j->>'id'; label:=COALESCE(j->>'vehicleNumber',j->>'fleetNumber',j->>'licensePlate',source_id);
      BEGIN reg_exp:=COALESCE(NULLIF(j->>'registrationExpirationDate','')::date,NULLIF(j->>'registrationExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN reg_exp:=NULL; END;
      BEGIN ins_exp:=COALESCE(NULLIF(j->>'insuranceExpirationDate','')::date,NULLIF(j->>'insuranceExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN ins_exp:=NULL; END;
      BEGIN insp_exp:=COALESCE(NULLIF(j->>'inspectionExpirationDate','')::date,NULLIF(j->>'inspectionExpiresAt','')::timestamptz::date,NULLIF(j->>'nextInspectionDueAt','')::timestamptz::date); EXCEPTION WHEN others THEN insp_exp:=NULL; END;
      PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','NmtVehicle',concat(source_id,':REGISTRATION'),'FLEET_VEHICLE',concat('Vehicle registration — ',label),'Ohio BMV',reg_exp,NULL,jsonb_build_object('vehicleId',source_id,'licensePlate',j->>'licensePlate','vin',j->>'vin'));
      PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','NmtVehicle',concat(source_id,':INSURANCE'),'FLEET_VEHICLE',concat('Vehicle insurance — ',label),'Insurance Carrier / Broker',ins_exp,NULL,jsonb_build_object('vehicleId',source_id,'licensePlate',j->>'licensePlate','vin',j->>'vin'));
      PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','NmtVehicle',concat(source_id,':INSPECTION'),'FLEET_VEHICLE',concat('Vehicle inspection / preventive maintenance — ',label),'Sulandra NMT / Applicable Authority',insp_exp,NULL,jsonb_build_object('vehicleId',source_id,'licensePlate',j->>'licensePlate','vin',j->>'vin'));
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE r record; j jsonb; exp date; source_id text; user_id text;
BEGIN
  IF to_regclass('"SpireMedicationAdministrationQualification"') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT to_jsonb(t) AS j FROM "SpireMedicationAdministrationQualification" t' LOOP
      j:=r.j; source_id:=j->>'id'; user_id:=j->>'userId';
      BEGIN exp:=NULLIF(j->>'expiresAt','')::timestamptz::date; EXCEPTION WHEN others THEN exp:=NULL; END;
      PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',j->>'legalEntityId','SpireMedicationAdministrationQualification',source_id,'CERTIFICATION',concat('Medication administration qualification — ',COALESCE(user_id,source_id)),'Ohio DODD / Delegating Nurse / Sulandra Health',exp,user_id,jsonb_build_object('qualificationType',j->>'qualificationType','qualificationLevel',j->>'qualificationLevel','qualificationStatus',j->>'status'));
    END LOOP;
  END IF;
END $$;

-- NMT driver trip assignments.
CREATE OR REPLACE FUNCTION "notify_nmt_trip_assignment"() RETURNS trigger AS $$
DECLARE j jsonb; driver_user text; driver_profile text; due_at timestamptz; trip_status text; priority text;
BEGIN
  j:=to_jsonb(NEW); trip_status:=COALESCE(j->>'status',''); driver_user:=COALESCE(j->>'driverUserId',j->>'assignedDriverUserId'); driver_profile:=COALESCE(j->>'driverProfileId',j->>'driverId');
  IF driver_user IS NULL AND driver_profile IS NOT NULL AND to_regclass('"NmtDriverProfile"') IS NOT NULL THEN
    BEGIN EXECUTE 'SELECT COALESCE(to_jsonb(d)->>''userId'',to_jsonb(d)->>''employeeUserId'') FROM "NmtDriverProfile" d WHERE d."id"=$1 LIMIT 1' INTO driver_user USING driver_profile; EXCEPTION WHEN others THEN driver_user:=NULL; END;
  END IF;
  BEGIN due_at:=COALESCE(NULLIF(j->>'scheduledPickupAt','')::timestamptz,NULLIF(j->>'requestedPickupAt','')::timestamptz,NULLIF(j->>'pickupAt','')::timestamptz); EXCEPTION WHEN others THEN due_at:=NULL; END;
  priority:=CASE WHEN due_at IS NOT NULL AND due_at<NOW()+INTERVAL '2 hours' THEN 'URGENT' ELSE 'HIGH' END;
  IF driver_user IS NOT NULL AND trip_status NOT IN ('COMPLETED','CANCELLED','NO_SHOW') THEN
    PERFORM "upsert_enterprise_work_notification"(j->>'organizationId',j->>'legalEntityId',driver_user,'[]'::jsonb,'NMT','NmtTrip',j->>'id','DRIVER_ASSIGNMENT',concat('NMT trip assignment ',COALESCE(j->>'tripNumber',j->>'id')),concat('Pickup: ',COALESCE(j->>'pickupName',j->>'pickupStreet','assigned pickup'),'. Destination: ',COALESCE(j->>'dropoffName',j->>'dropoffStreet','assigned destination'),'.'),priority,'/nmt-driver.html',due_at,jsonb_build_object('driverProfileId',driver_profile,'vehicleId',COALESCE(j->>'vehicleId',j->>'assignedVehicleId')));
  END IF;
  IF trip_status IN ('COMPLETED','CANCELLED','NO_SHOW') THEN UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=j->>'organizationId' AND "legalEntityId"=j->>'legalEntityId' AND "resourceType"='NmtTrip' AND "resourceId"=j->>'id' AND "status" IN ('OPEN','READ'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"NmtTrip"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "NmtTrip_work_notification" ON "NmtTrip"'; EXECUTE 'CREATE TRIGGER "NmtTrip_work_notification" AFTER INSERT OR UPDATE ON "NmtTrip" FOR EACH ROW EXECUTE FUNCTION "notify_nmt_trip_assignment"()'; END IF; END $$;

-- Home Health Plan of Care / certification work.
CREATE OR REPLACE FUNCTION "notify_home_health_poc"() RETURNS trigger AS $$
DECLARE j jsonb; poc_status text; due_at timestamptz; patient_id text;
BEGIN
  j:=to_jsonb(NEW); poc_status:=COALESCE(j->>'status',''); patient_id:=j->>'patientId';
  BEGIN due_at:=COALESCE(NULLIF(j->>'certificationEnd','')::timestamptz,NULLIF(j->>'periodEnd','')::timestamptz,NULLIF(j->>'endDate','')::date::timestamptz,NULLIF(j->>'reviewDueAt','')::timestamptz); EXCEPTION WHEN others THEN due_at:=NULL; END;
  IF poc_status NOT IN ('SIGNED','ACTIVE','SUPERSEDED','CLOSED','DISCONTINUED') THEN
    PERFORM "upsert_enterprise_work_notification"(j->>'organizationId',j->>'legalEntityId',NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","RN","DELEGATING_NURSE","CEO","DOO"]'::jsonb,'HOME_HEALTH','HomeHealthPlanOfCare',j->>'id','POC_REVIEW','Home Health Plan of Care review','A Plan of Care requires review, completion or signature.','HIGH',CASE WHEN patient_id IS NULL THEN '/home-health.html' ELSE concat('/spire.html?patientId=',patient_id) END,due_at,jsonb_build_object('episodeId',j->>'episodeId','patientId',patient_id,'status',poc_status));
  ELSE UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=j->>'organizationId' AND "legalEntityId"=j->>'legalEntityId' AND "resourceType"='HomeHealthPlanOfCare' AND "resourceId"=j->>'id' AND "status" IN ('OPEN','READ'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"HomeHealthPlanOfCare"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "HomeHealthPlanOfCare_work_notification" ON "HomeHealthPlanOfCare"'; EXECUTE 'CREATE TRIGGER "HomeHealthPlanOfCare_work_notification" AFTER INSERT OR UPDATE ON "HomeHealthPlanOfCare" FOR EACH ROW EXECUTE FUNCTION "notify_home_health_poc"()'; END IF; END $$;

-- Home Health episode recertification / discharge work.
CREATE OR REPLACE FUNCTION "notify_home_health_episode_recert"() RETURNS trigger AS $$
DECLARE j jsonb; ep_status text; due_at timestamptz; patient_id text; priority text;
BEGIN
  j:=to_jsonb(NEW); ep_status:=COALESCE(j->>'status',''); patient_id:=j->>'patientId';
  BEGIN due_at:=COALESCE(NULLIF(j->>'certificationEnd','')::timestamptz,NULLIF(j->>'certificationEndDate','')::date::timestamptz,NULLIF(j->>'periodEnd','')::timestamptz,NULLIF(j->>'episodeEndDate','')::date::timestamptz); EXCEPTION WHEN others THEN due_at:=NULL; END;
  priority:=CASE WHEN due_at IS NOT NULL AND due_at<=NOW()+INTERVAL '14 days' THEN 'URGENT' ELSE 'HIGH' END;
  IF ep_status IN ('ACTIVE','ADMITTED','START_OF_CARE','OPEN') AND due_at IS NOT NULL THEN
    PERFORM "upsert_enterprise_work_notification"(j->>'organizationId',j->>'legalEntityId',COALESCE(j->>'caseManagerUserId',j->>'primaryNurseUserId'),'["ADMINISTRATOR","PROGRAM_MANAGER","RN","DELEGATING_NURSE","CEO","DOO"]'::jsonb,'HOME_HEALTH','HomeHealthEpisode',j->>'id','RECERTIFICATION',concat('Home Health certification review — ',COALESCE(j->>'episodeNumber',j->>'id')),'Certification/episode end is approaching. Review recertification, continued skilled need, Plan of Care and discharge readiness.',priority,'/home-health.html',due_at,jsonb_build_object('patientId',patient_id,'episodeNumber',j->>'episodeNumber'));
  END IF;
  IF ep_status IN ('DISCHARGED','CLOSED','CANCELLED') THEN UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=j->>'organizationId' AND "legalEntityId"=j->>'legalEntityId' AND "resourceType"='HomeHealthEpisode' AND "resourceId"=j->>'id' AND "status" IN ('OPEN','READ'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"HomeHealthEpisode"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "HomeHealthEpisode_work_notification" ON "HomeHealthEpisode"'; EXECUTE 'CREATE TRIGGER "HomeHealthEpisode_work_notification" AFTER INSERT OR UPDATE ON "HomeHealthEpisode" FOR EACH ROW EXECUTE FUNCTION "notify_home_health_episode_recert"()'; END IF; END $$;

-- Signed SCLS handoffs with follow-up requirements.
CREATE OR REPLACE FUNCTION "notify_scls_handoff_followup"() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='SIGNED' AND COALESCE(NULLIF(trim(NEW."followUpRequired"),''),'')<>'' THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NULL,'["HOUSE_MANAGER","PROGRAM_MANAGER","RN","DELEGATING_NURSE","ADMINISTRATOR","CEO","DOO"]'::jsonb,'SCLS','SpireHouseShiftHandoff',NEW."id",'FOLLOW_UP',concat('SCLS handoff follow-up — ',NEW."shiftType"),NEW."followUpRequired",'HIGH',concat('/scls-residential.html'),NEW."shiftEnd",jsonb_build_object('homeId',NEW."homeId","shiftStart",NEW."shiftStart"));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireHouseShiftHandoff_work_notification" ON "SpireHouseShiftHandoff";
CREATE TRIGGER "SpireHouseShiftHandoff_work_notification" AFTER INSERT OR UPDATE OF "status","followUpRequired" ON "SpireHouseShiftHandoff" FOR EACH ROW EXECUTE FUNCTION "notify_scls_handoff_followup"();

-- High/critical incident follow-up.
CREATE OR REPLACE FUNCTION "notify_spire_incident_followup"() RETURNS trigger AS $$
DECLARE j jsonb; severity text; incident_status text; patient_id text; action_path text;
BEGIN
  j:=to_jsonb(NEW); severity:=upper(COALESCE(j->>'severity',j->>'priority',j->>'riskLevel','')); incident_status:=upper(COALESCE(j->>'status','OPEN')); patient_id:=COALESCE(j->>'patientId',j->>'clientId'); action_path:=CASE WHEN patient_id IS NULL THEN '/spire.html' ELSE concat('/spire.html?patientId=',patient_id,'#incidents') END;
  IF severity IN ('HIGH','CRITICAL','URGENT') AND incident_status NOT IN ('CLOSED','RESOLVED','CANCELLED') THEN
    PERFORM "upsert_enterprise_work_notification"(j->>'organizationId',j->>'legalEntityId',NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","RN","DELEGATING_NURSE","HOUSE_MANAGER","CEO","DOO"]'::jsonb,'SPIRE','SpireIncident',j->>'id','INCIDENT_FOLLOW_UP',concat('High-priority incident follow-up — ',COALESCE(j->>'incidentNumber',j->>'id')),COALESCE(j->>'summary',j->>'description',j->>'incidentType','Incident requires review and follow-up.'),CASE WHEN severity='CRITICAL' THEN 'CRITICAL' ELSE 'URGENT' END,action_path,NULL,jsonb_build_object('patientId',patient_id,'severity',severity,'incidentType',j->>'incidentType'));
  END IF;
  IF incident_status IN ('CLOSED','RESOLVED','CANCELLED') THEN UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=j->>'organizationId' AND "legalEntityId"=j->>'legalEntityId' AND "resourceType"='SpireIncident' AND "resourceId"=j->>'id' AND "status" IN ('OPEN','READ'); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"SpireIncident"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "SpireIncident_work_notification" ON "SpireIncident"'; EXECUTE 'CREATE TRIGGER "SpireIncident_work_notification" AFTER INSERT OR UPDATE ON "SpireIncident" FOR EACH ROW EXECUTE FUNCTION "notify_spire_incident_followup"()'; END IF; END $$;
