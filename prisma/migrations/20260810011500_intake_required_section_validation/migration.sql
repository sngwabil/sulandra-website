CREATE OR REPLACE FUNCTION "validate_client_intake_completed_section"()
RETURNS trigger AS $$
DECLARE
  missing text[] := ARRAY[]::text[];
  value text;
BEGIN
  IF NEW."status" <> 'COMPLETE' THEN
    RETURN NEW;
  END IF;

  CASE NEW."sectionKey"
    WHEN 'referral_admission' THEN
      IF COALESCE(btrim(NEW."payload"->>'referralSource'),'')='' THEN missing:=array_append(missing,'referralSource'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'requestedService'),'')='' THEN missing:=array_append(missing,'requestedService'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'reasonForReferral'),'')='' THEN missing:=array_append(missing,'reasonForReferral'); END IF;
    WHEN 'demographics_identity' THEN
      IF COALESCE(btrim(NEW."payload"->>'firstName'),'')='' THEN missing:=array_append(missing,'firstName'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'lastName'),'')='' THEN missing:=array_append(missing,'lastName'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'dateOfBirth'),'')='' THEN missing:=array_append(missing,'dateOfBirth'); END IF;
    WHEN 'contact_residence' THEN
      FOREACH value IN ARRAY ARRAY['streetAddress','city','state','zip','livingArrangement'] LOOP
        IF COALESCE(btrim(NEW."payload"->>value),'')='' THEN missing:=array_append(missing,value); END IF;
      END LOOP;
    WHEN 'communication' THEN
      IF COALESCE(btrim(NEW."payload"->>'primaryMethod'),'')='' THEN missing:=array_append(missing,'primaryMethod'); END IF;
    WHEN 'important_to_for' THEN
      IF COALESCE(btrim(NEW."payload"->>'importantTo'),'')='' THEN missing:=array_append(missing,'importantTo'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'importantFor'),'')='' THEN missing:=array_append(missing,'importantFor'); END IF;
    WHEN 'preferences_routines' THEN
      IF COALESCE(btrim(NEW."payload"->>'likesInterests'),'')='' THEN missing:=array_append(missing,'likesInterests'); END IF;
    WHEN 'goals_outcomes' THEN
      IF COALESCE(btrim(NEW."payload"->>'lifeGoals'),'')='' THEN missing:=array_append(missing,'lifeGoals'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'serviceGoals'),'')='' THEN missing:=array_append(missing,'serviceGoals'); END IF;
    WHEN 'rights_choice_privacy' THEN
      IF COALESCE(btrim(NEW."payload"->>'privacyPreferences'),'')='' THEN missing:=array_append(missing,'privacyPreferences'); END IF;
    WHEN 'legal_decision_maker' THEN
      IF COALESCE(btrim(NEW."payload"->>'hasGuardian'),'')='' THEN missing:=array_append(missing,'hasGuardian'); END IF;
    WHEN 'emergency_contacts' THEN
      IF COALESCE(btrim(NEW."payload"->>'primaryContactName'),'')='' THEN missing:=array_append(missing,'primaryContactName'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'primaryPhone'),'')='' THEN missing:=array_append(missing,'primaryPhone'); END IF;
    WHEN 'service_authorization' THEN
      IF COALESCE(btrim(NEW."payload"->>'authorizedService'),'')='' THEN missing:=array_append(missing,'authorizedService'); END IF;
    WHEN 'ohioisp_person_centered_plan' THEN
      IF COALESCE(btrim(NEW."payload"->>'assessedNeeds'),'')='' THEN missing:=array_append(missing,'assessedNeeds'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'outcomes'),'')='' THEN missing:=array_append(missing,'outcomes'); END IF;
    WHEN 'diagnoses_history' THEN
      IF COALESCE(btrim(NEW."payload"->>'diagnoses'),'')='' THEN missing:=array_append(missing,'diagnoses'); END IF;
    WHEN 'allergies' THEN
      IF COALESCE((NEW."payload"->>'noKnownAllergies')::boolean,false)=false AND COALESCE(btrim(NEW."payload"->>'allergyList'),'')='' THEN
        missing:=array_append(missing,'noKnownAllergies or allergyList');
      END IF;
    WHEN 'medications_reconciliation' THEN
      IF COALESCE((NEW."payload"->>'noCurrentMedications')::boolean,false)=false AND COALESCE(btrim(NEW."payload"->>'medications'),'')='' THEN
        missing:=array_append(missing,'noCurrentMedications or medications');
      END IF;
    WHEN 'providers_appointments' THEN
      IF COALESCE(btrim(NEW."payload"->>'primaryCare'),'')='' THEN missing:=array_append(missing,'primaryCare'); END IF;
    WHEN 'nutrition_swallowing' THEN
      IF COALESCE(btrim(NEW."payload"->>'dietOrder'),'')='' THEN missing:=array_append(missing,'dietOrder'); END IF;
    WHEN 'mobility_transfers_falls' THEN
      IF COALESCE(btrim(NEW."payload"->>'mobilityBaseline'),'')='' THEN missing:=array_append(missing,'mobilityBaseline'); END IF;
    WHEN 'safety_emergency' THEN
      IF COALESCE(btrim(NEW."payload"->>'emergencyPlan'),'')='' THEN missing:=array_append(missing,'emergencyPlan'); END IF;
    WHEN 'service_schedule_staffing' THEN
      IF COALESCE(btrim(NEW."payload"->>'serviceSchedule'),'')='' THEN missing:=array_append(missing,'serviceSchedule'); END IF;
    WHEN 'delegation_training' THEN
      IF COALESCE(btrim(NEW."payload"->>'individualSpecificTraining'),'')='' THEN missing:=array_append(missing,'individualSpecificTraining'); END IF;
    WHEN 'consents_releases' THEN
      IF COALESCE((NEW."payload"->>'serviceConsentReviewed')::boolean,false)=false THEN missing:=array_append(missing,'serviceConsentReviewed'); END IF;
      IF COALESCE((NEW."payload"->>'privacyReviewed')::boolean,false)=false THEN missing:=array_append(missing,'privacyReviewed'); END IF;
    WHEN 'external_documents' THEN
      IF COALESCE(btrim(NEW."payload"->>'ohioIspStatus'),'')='' THEN missing:=array_append(missing,'ohioIspStatus'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'marStatus'),'')='' THEN missing:=array_append(missing,'marStatus'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'insuranceStatus'),'')='' THEN missing:=array_append(missing,'insuranceStatus'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'trainingStatus'),'')='' THEN missing:=array_append(missing,'trainingStatus'); END IF;
    WHEN 'intake_summary' THEN
      IF COALESCE(btrim(NEW."payload"->>'strengths'),'')='' THEN missing:=array_append(missing,'strengths'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'immediatePriorities'),'')='' THEN missing:=array_append(missing,'immediatePriorities'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'intakeCoordinatorSummary'),'')='' THEN missing:=array_append(missing,'intakeCoordinatorSummary'); END IF;
    WHEN 'scls_residential_setup' THEN
      IF COALESCE(btrim(NEW."payload"->>'serviceHome'),'')='' THEN missing:=array_append(missing,'serviceHome'); END IF;
    WHEN 'scls_isp_implementation' THEN
      FOREACH value IN ARRAY ARRAY['outcomeImplementation','dailyDocumentation','riskProtocols'] LOOP
        IF COALESCE(btrim(NEW."payload"->>value),'')='' THEN missing:=array_append(missing,value); END IF;
      END LOOP;
    WHEN 'home_health_referral' THEN
      IF COALESCE(btrim(NEW."payload"->>'referringProvider'),'')='' THEN missing:=array_append(missing,'referringProvider'); END IF;
      IF COALESCE(btrim(NEW."payload"->>'skilledNeed'),'')='' THEN missing:=array_append(missing,'skilledNeed'); END IF;
    WHEN 'home_health_home_safety' THEN
      IF COALESCE(btrim(NEW."payload"->>'homeSafety'),'')='' THEN missing:=array_append(missing,'homeSafety'); END IF;
    WHEN 'nmt_rider_profile' THEN
      IF COALESCE(btrim(NEW."payload"->>'ambulatoryStatus'),'')='' THEN missing:=array_append(missing,'ambulatoryStatus'); END IF;
    WHEN 'nmt_trip_orders' THEN
      FOREACH value IN ARRAY ARRAY['orderingFacility','tripPurpose','pickupLocation','destination'] LOOP
        IF COALESCE(btrim(NEW."payload"->>value),'')='' THEN missing:=array_append(missing,value); END IF;
      END LOOP;
    ELSE
      NULL;
  END CASE;

  IF cardinality(missing)>0 THEN
    RAISE EXCEPTION 'Cannot complete intake section %. Missing required field(s): %', NEW."sectionKey", array_to_string(missing,', ')
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ClientIntakeSection_validate_completion" ON "ClientIntakeSection";
CREATE TRIGGER "ClientIntakeSection_validate_completion"
BEFORE INSERT OR UPDATE OF "status","payload" ON "ClientIntakeSection"
FOR EACH ROW EXECUTE FUNCTION "validate_client_intake_completed_section"();
