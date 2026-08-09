-- Activate the Sulandra companies for formation-stage recruiting, onboarding,
-- intranet, and education without representing an unapproved service line as
-- licensed, enrolled, accepting referrals, or ready to bill.

UPDATE "LegalEntity"
SET "status"='ACTIVE',
    "isEmployer"=true,
    "isProvider"=CASE WHEN "code"='SCLS' THEN true ELSE false END,
    "metadata"=COALESCE("metadata",'{}'::jsonb) || CASE "code"
      WHEN 'SCLS' THEN jsonb_build_object(
        'formationStatus','ACTIVE',
        'licensingStatus','ACTIVE',
        'serviceOperationsStatus','ACTIVE',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','ACTIVE',
        'billingStatus','ACTIVE',
        'enabledModules',jsonb_build_array(
          'CAREERS','ONBOARDING','EMPLOYEE_360','TIME_ATTENDANCE','COMPLIANCE',
          'EDUCATION','INTRANET','CLIENT_INTAKE','SPIRE','BILLING','SCLS_OPERATIONS'
        )
      )
      WHEN 'SULANDRA_HEALTH' THEN jsonb_build_object(
        'formationStatus','APPLICATION_IN_PROGRESS',
        'licensingStatus','NOT_APPLICABLE',
        'serviceOperationsStatus','PRE_LAUNCH',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','NOT_APPLICABLE',
        'billingStatus','DISABLED',
        'enabledModules',jsonb_build_array('CAREERS','ONBOARDING','EDUCATION','INTRANET')
      )
      WHEN 'HOME_HEALTH' THEN jsonb_build_object(
        'formationStatus','APPLICATION_IN_PROGRESS',
        'licensingStatus','PENDING_APPROVAL',
        'serviceOperationsStatus','PRE_LAUNCH',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','NOT_ACCEPTING',
        'billingStatus','DISABLED',
        'enabledModules',jsonb_build_array('CAREERS','ONBOARDING','EDUCATION','INTRANET')
      )
      WHEN 'NMT' THEN jsonb_build_object(
        'formationStatus','APPLICATION_IN_PROGRESS',
        'licensingStatus','PENDING_APPROVAL',
        'serviceOperationsStatus','PRE_LAUNCH',
        'hiringStatus','ACTIVE',
        'trainingStatus','ACTIVE',
        'referralStatus','NOT_ACCEPTING',
        'billingStatus','DISABLED',
        'enabledModules',jsonb_build_array('CAREERS','ONBOARDING','EDUCATION','INTRANET')
      )
      ELSE '{}'::jsonb
    END,
    "updatedAt"=now()
WHERE "code" IN ('SULANDRA_HEALTH','SCLS','HOME_HEALTH','NMT');

COMMENT ON COLUMN "LegalEntity"."status" IS
  'Company workspace status. ACTIVE does not by itself establish provider licensure, payer enrollment, referral readiness, or billing authority; use metadata lifecycle fields and isProvider.';
