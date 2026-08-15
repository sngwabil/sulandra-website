-- Supersede the formation-stage/pre-launch lifecycle after owner confirmation
-- that the Sulandra operating companies have received their approvals.
--
-- Keep the parent holding company distinct from provider entities while removing
-- PRE_LAUNCH/PENDING_APPROVAL lifecycle flags from the operating companies.

UPDATE "LegalEntity"
SET "status"='ACTIVE',
    "isEmployer"=true,
    "isProvider"=CASE WHEN "code"='SULANDRA_HEALTH' THEN false ELSE true END,
    "metadata"=COALESCE("metadata",'{}'::jsonb) || CASE "code"
      WHEN 'SULANDRA_HEALTH' THEN jsonb_build_object(
        'formationStatus','ACTIVE',
        'licensingStatus','NOT_APPLICABLE',
        'serviceOperationsStatus','ENTERPRISE_ACTIVE',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','NOT_APPLICABLE',
        'billingStatus','NOT_APPLICABLE',
        'approvalStatus','APPROVED',
        'approvalRecordSource','OWNER_CONFIRMED',
        'enabledModules',jsonb_build_array(
          'CAREERS','ONBOARDING','EMPLOYEE_360','TIME_ATTENDANCE','COMPLIANCE',
          'EDUCATION','INTRANET'
        )
      )
      WHEN 'SCLS' THEN jsonb_build_object(
        'formationStatus','ACTIVE',
        'licensingStatus','ACTIVE',
        'serviceOperationsStatus','ACTIVE',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','ACTIVE',
        'billingStatus','ACTIVE',
        'approvalStatus','APPROVED',
        'approvalRecordSource','OWNER_CONFIRMED',
        'enabledModules',jsonb_build_array(
          'CAREERS','ONBOARDING','EMPLOYEE_360','TIME_ATTENDANCE','COMPLIANCE',
          'EDUCATION','INTRANET','CLIENT_INTAKE','SPIRE','BILLING','SCLS_OPERATIONS'
        )
      )
      WHEN 'HOME_HEALTH' THEN jsonb_build_object(
        'formationStatus','ACTIVE',
        'licensingStatus','ACTIVE',
        'serviceOperationsStatus','ACTIVE',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','ACTIVE',
        'billingStatus','ACTIVE',
        'approvalStatus','APPROVED',
        'approvalRecordSource','OWNER_CONFIRMED',
        'enabledModules',jsonb_build_array(
          'CAREERS','ONBOARDING','EMPLOYEE_360','TIME_ATTENDANCE','COMPLIANCE',
          'EDUCATION','INTRANET','CLIENT_INTAKE','SPIRE','BILLING','HOME_HEALTH_OPERATIONS'
        )
      )
      WHEN 'NMT' THEN jsonb_build_object(
        'formationStatus','ACTIVE',
        'licensingStatus','ACTIVE',
        'serviceOperationsStatus','ACTIVE',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','ACTIVE',
        'billingStatus','ACTIVE',
        'approvalStatus','APPROVED',
        'approvalRecordSource','OWNER_CONFIRMED',
        'enabledModules',jsonb_build_array(
          'CAREERS','ONBOARDING','EMPLOYEE_360','TIME_ATTENDANCE','COMPLIANCE',
          'EDUCATION','INTRANET','CLIENT_INTAKE','SPIRE','BILLING','NMT_OPERATIONS'
        )
      )
      ELSE '{}'::jsonb
    END,
    "updatedAt"=now()
WHERE "code" IN ('SULANDRA_HEALTH','SCLS','HOME_HEALTH','NMT');

-- Defensive cleanup: if older metadata carried any explicit pre-launch flag under
-- a generic key, remove it so frontend lifecycle badges cannot resurrect it.
UPDATE "LegalEntity"
SET "metadata"=(COALESCE("metadata",'{}'::jsonb) - 'preLaunch' - 'prelaunch' - 'preLaunchLocked'),
    "updatedAt"=now()
WHERE "code" IN ('SULANDRA_HEALTH','SCLS','HOME_HEALTH','NMT');
