-- Complete the COO -> DOO role rename for EmployeeApplication.
-- This migration is intentionally defensive because production installations
-- may expose the application role column as "appliedRole" rather than "role".

DO $$
DECLARE
  current_definition TEXT;
  role_column TEXT;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO current_definition
    FROM pg_constraint c
   WHERE c.conname = 'EmployeeApplication_role_check'
     AND c.conrelid = '"EmployeeApplication"'::regclass;

  IF current_definition IS NOT NULL THEN
    ALTER TABLE "EmployeeApplication"
      DROP CONSTRAINT "EmployeeApplication_role_check";

    current_definition := replace(current_definition, '''COO''', '''DOO''');

    EXECUTE format(
      'ALTER TABLE "EmployeeApplication" ADD CONSTRAINT "EmployeeApplication_role_check" %s',
      current_definition
    );
    RETURN;
  END IF;

  SELECT column_name
    INTO role_column
    FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'EmployeeApplication'
     AND column_name IN ('appliedRole', 'role')
   ORDER BY CASE column_name WHEN 'appliedRole' THEN 1 ELSE 2 END
   LIMIT 1;

  IF role_column IS NULL THEN
    RAISE EXCEPTION 'EmployeeApplication does not contain appliedRole or role';
  END IF;

  EXECUTE format(
    'ALTER TABLE "EmployeeApplication" ADD CONSTRAINT "EmployeeApplication_role_check" CHECK (%1$I IS NULL OR %1$I::text IN (''ADMINISTRATOR'',''PROGRAM_MANAGER'',''AUDITOR'',''DSP'',''DELEGATING_NURSE'',''LPN'',''RN'',''HOUSE_MANAGER'',''HR_MANAGER'',''SCHEDULER'',''BILLING_SPECIALIST'',''ADMINISTRATIVE_ASSISTANT'',''CEO'',''DOO'',''DRIVER'',''GENERAL''))',
    role_column
  );
END $$;
