CREATE OR REPLACE FUNCTION "notify_scls_handoff_followup"() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='SIGNED' AND COALESCE(NULLIF(trim(NEW."followUpRequired"),''),'')<>'' THEN
    PERFORM "upsert_enterprise_work_notification"(
      NEW."organizationId",NEW."legalEntityId",NULL,
      '["HOUSE_MANAGER","PROGRAM_MANAGER","RN","DELEGATING_NURSE","ADMINISTRATOR","CEO","DOO"]'::jsonb,
      'SCLS','SpireHouseShiftHandoff',NEW."id",'FOLLOW_UP',concat('SCLS handoff follow-up — ',NEW."shiftType"),
      NEW."followUpRequired",'HIGH','/scls-residential.html',NEW."shiftEnd",
      jsonb_build_object('homeId',NEW."homeId",'shiftStart',NEW."shiftStart")
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
