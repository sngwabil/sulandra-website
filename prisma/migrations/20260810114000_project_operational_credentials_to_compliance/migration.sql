CREATE OR REPLACE FUNCTION "upsert_operational_compliance_projection"(
  p_org text,p_entity text,p_source_table text,p_source_id text,p_category text,p_requirement text,p_authority text,
  p_expiration date,p_owner text,p_metadata jsonb
) RETURNS void AS $$
DECLARE
  item_id text;
  current_status text;
BEGIN
  IF p_org IS NULL OR p_entity IS NULL OR p_source_id IS NULL OR p_requirement IS NULL THEN RETURN; END IF;
  SELECT "id","status" INTO item_id,current_status
  FROM "CompanyComplianceItem"
  WHERE "organizationId"=p_org AND "legalEntityId"=p_entity
    AND "metadata"->>'sourceTable'=p_source_table AND "metadata"->>'sourceRecordId'=p_source_id
    AND "category"=p_category
  LIMIT 1;

  IF item_id IS NULL THEN
    INSERT INTO "CompanyComplianceItem"(
      "id","organizationId","legalEntityId","category","requirementName","authority","status","expirationDate",
      "renewalLeadDays","responsibleUserId","verificationMethod","notes","metadata","createdByUserId"
    ) VALUES(
      gen_random_uuid()::text,p_org,p_entity,p_category,p_requirement,p_authority,
      CASE WHEN p_expiration IS NOT NULL AND p_expiration<CURRENT_DATE THEN 'EXPIRED' ELSE 'PENDING_VERIFICATION' END,
      p_expiration,60,p_owner,'Automatically projected from an operational credential record.',
      'This compliance item is synchronized from an operating module. Verify the underlying credential/document and link supporting evidence.',
      jsonb_build_object('sourceTable',p_source_table,'sourceRecordId',p_source_id,'autoProjected',true)||COALESCE(p_metadata,'{}'::jsonb),
      'SYSTEM:OPERATIONS_COMPLIANCE'
    );
  ELSE
    UPDATE "CompanyComplianceItem"
    SET "requirementName"=p_requirement,"authority"=COALESCE(p_authority,"authority"),"expirationDate"=p_expiration,
        "responsibleUserId"=COALESCE(p_owner,"responsibleUserId"),
        "status"=CASE
          WHEN p_expiration IS NOT NULL AND p_expiration<CURRENT_DATE THEN 'EXPIRED'
          WHEN "status"='EXPIRED' AND (p_expiration IS NULL OR p_expiration>=CURRENT_DATE) THEN 'PENDING_VERIFICATION'
          ELSE "status" END,
        "metadata"="metadata"||COALESCE(p_metadata,'{}'::jsonb),"updatedAt"=NOW()
    WHERE "id"=item_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "project_home_health_staff_compliance"() RETURNS trigger AS $$
DECLARE j jsonb; exp date; source_id text; user_id text; discipline text; entity_id text; license_no text;
BEGIN
  j:=to_jsonb(NEW); entity_id:=j->>'legalEntityId'; user_id:=COALESCE(j->>'userId',j->>'employeeUserId');
  source_id:=COALESCE(j->>'id',concat_ws(':',user_id,j->>'discipline')); discipline:=COALESCE(j->>'discipline','CLINICAL');
  license_no:=COALESCE(j->>'licenseNumber',j->>'credentialNumber');
  BEGIN exp:=COALESCE(NULLIF(j->>'licenseExpirationDate','')::date,NULLIF(j->>'licenseExpiresAt','')::timestamptz::date,NULLIF(j->>'credentialExpiresAt','')::timestamptz::date,NULLIF(j->>'expirationDate','')::date); EXCEPTION WHEN others THEN exp:=NULL; END;
  PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'HomeHealthStaffProfile',source_id,'HOME_HEALTH',concat('Home Health ',replace(discipline,'_',' '),' credential — ',COALESCE(user_id,source_id)),'Applicable professional licensing / credential authority',exp,user_id,jsonb_build_object('discipline',discipline,'licenseNumber',license_no));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"HomeHealthStaffProfile"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "HomeHealthStaffProfile_compliance_projection" ON "HomeHealthStaffProfile"'; EXECUTE 'CREATE TRIGGER "HomeHealthStaffProfile_compliance_projection" AFTER INSERT OR UPDATE ON "HomeHealthStaffProfile" FOR EACH ROW EXECUTE FUNCTION "project_home_health_staff_compliance"()'; END IF; END $$;

CREATE OR REPLACE FUNCTION "project_nmt_driver_compliance"() RETURNS trigger AS $$
DECLARE j jsonb; exp date; bg_exp date; source_id text; user_id text; entity_id text; license_no text;
BEGIN
  j:=to_jsonb(NEW); entity_id:=j->>'legalEntityId'; user_id:=COALESCE(j->>'userId',j->>'employeeUserId');source_id:=COALESCE(j->>'id',user_id);license_no:=COALESCE(j->>'driverLicenseNumber',j->>'licenseNumber');
  BEGIN exp:=COALESCE(NULLIF(j->>'driverLicenseExpiresAt','')::timestamptz::date,NULLIF(j->>'licenseExpirationDate','')::date,NULLIF(j->>'licenseExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN exp:=NULL; END;
  BEGIN bg_exp:=COALESCE(NULLIF(j->>'backgroundCheckExpiresAt','')::timestamptz::date,NULLIF(j->>'backgroundCheckExpirationDate','')::date,NULLIF(j->>'screeningExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN bg_exp:=NULL; END;
  PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'NmtDriverProfile',source_id,'DRIVER_COMPLIANCE',concat('NMT driver license / qualification — ',COALESCE(user_id,source_id)),'Ohio BMV / Sulandra NMT',exp,user_id,jsonb_build_object('driverLicenseNumber',license_no,'licenseState',COALESCE(j->>'licenseState',j->>'driverLicenseState')));
  IF bg_exp IS NOT NULL THEN PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'NmtDriverProfile',concat(source_id,':BACKGROUND'),'DRIVER_COMPLIANCE',concat('NMT driver background / screening — ',COALESCE(user_id,source_id)),'Applicable payer / regulatory requirements',bg_exp,user_id,jsonb_build_object('parentDriverProfileId',source_id)); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"NmtDriverProfile"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "NmtDriverProfile_compliance_projection" ON "NmtDriverProfile"'; EXECUTE 'CREATE TRIGGER "NmtDriverProfile_compliance_projection" AFTER INSERT OR UPDATE ON "NmtDriverProfile" FOR EACH ROW EXECUTE FUNCTION "project_nmt_driver_compliance"()'; END IF; END $$;

CREATE OR REPLACE FUNCTION "project_nmt_vehicle_compliance"() RETURNS trigger AS $$
DECLARE j jsonb; reg_exp date; ins_exp date; insp_exp date; source_id text; entity_id text; label text;
BEGIN
  j:=to_jsonb(NEW); entity_id:=j->>'legalEntityId'; source_id:=j->>'id';label:=COALESCE(j->>'vehicleNumber',j->>'fleetNumber',j->>'licensePlate',source_id);
  BEGIN reg_exp:=COALESCE(NULLIF(j->>'registrationExpirationDate','')::date,NULLIF(j->>'registrationExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN reg_exp:=NULL; END;
  BEGIN ins_exp:=COALESCE(NULLIF(j->>'insuranceExpirationDate','')::date,NULLIF(j->>'insuranceExpiresAt','')::timestamptz::date); EXCEPTION WHEN others THEN ins_exp:=NULL; END;
  BEGIN insp_exp:=COALESCE(NULLIF(j->>'inspectionExpirationDate','')::date,NULLIF(j->>'inspectionExpiresAt','')::timestamptz::date,NULLIF(j->>'nextInspectionDueAt','')::timestamptz::date); EXCEPTION WHEN others THEN insp_exp:=NULL; END;
  PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'NmtVehicle',concat(source_id,':REGISTRATION'),'FLEET_VEHICLE',concat('Vehicle registration — ',label),'Ohio BMV',reg_exp,NULL,jsonb_build_object('vehicleId',source_id,'licensePlate',j->>'licensePlate','vin',j->>'vin'));
  PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'NmtVehicle',concat(source_id,':INSURANCE'),'FLEET_VEHICLE',concat('Vehicle insurance — ',label),'Insurance Carrier / Broker',ins_exp,NULL,jsonb_build_object('vehicleId',source_id,'licensePlate',j->>'licensePlate','vin',j->>'vin'));
  PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'NmtVehicle',concat(source_id,':INSPECTION'),'FLEET_VEHICLE',concat('Vehicle inspection / preventive maintenance — ',label),'Sulandra NMT / Applicable Authority',insp_exp,NULL,jsonb_build_object('vehicleId',source_id,'licensePlate',j->>'licensePlate','vin',j->>'vin'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"NmtVehicle"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "NmtVehicle_compliance_projection" ON "NmtVehicle"'; EXECUTE 'CREATE TRIGGER "NmtVehicle_compliance_projection" AFTER INSERT OR UPDATE ON "NmtVehicle" FOR EACH ROW EXECUTE FUNCTION "project_nmt_vehicle_compliance"()'; END IF; END $$;

CREATE OR REPLACE FUNCTION "project_medication_qualification_compliance"() RETURNS trigger AS $$
DECLARE j jsonb; exp date; source_id text; user_id text; entity_id text;
BEGIN
  j:=to_jsonb(NEW); entity_id:=j->>'legalEntityId';user_id:=j->>'userId';source_id:=j->>'id';
  BEGIN exp:=NULLIF(j->>'expiresAt','')::timestamptz::date; EXCEPTION WHEN others THEN exp:=NULL; END;
  PERFORM "upsert_operational_compliance_projection"(j->>'organizationId',entity_id,'SpireMedicationAdministrationQualification',source_id,'CERTIFICATION',concat('Medication administration qualification — ',COALESCE(user_id,source_id)),'Ohio DODD / Delegating Nurse / Sulandra Health',exp,user_id,jsonb_build_object('qualificationType',j->>'qualificationType','qualificationLevel',j->>'qualificationLevel','qualificationStatus',j->>'status'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"SpireMedicationAdministrationQualification"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "SpireMedicationQualification_compliance_projection" ON "SpireMedicationAdministrationQualification"'; EXECUTE 'CREATE TRIGGER "SpireMedicationQualification_compliance_projection" AFTER INSERT OR UPDATE ON "SpireMedicationAdministrationQualification" FOR EACH ROW EXECUTE FUNCTION "project_medication_qualification_compliance"()'; END IF; END $$;

-- Historical projection is intentionally handled by the ordinary-SQL backfill
-- migration that follows. Trigger functions require NEW/OLD row context and must
-- never be invoked directly from a DO block during deployment.
