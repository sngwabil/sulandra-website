-- Keep current production data aligned with the Director of Operations role.
-- Historical deployed migration files remain immutable so Prisma checksums stay valid.

DO $$
BEGIN
  IF to_regclass('"EmployeeApplication"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema=current_schema()
         AND table_name='EmployeeApplication'
         AND column_name='appliedRole'
    ) THEN
      EXECUTE 'UPDATE "EmployeeApplication" SET "appliedRole"=''DOO'' WHERE "appliedRole"::text=''COO''';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema=current_schema()
         AND table_name='EmployeeApplication'
         AND column_name='role'
    ) THEN
      EXECUTE 'UPDATE "EmployeeApplication" SET "role"=''DOO'' WHERE "role"::text=''COO''';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"JobOpening"') IS NULL THEN
    RAISE NOTICE 'JobOpening table is not present; skipping Director of Operations catalog cleanup.';
    RETURN;
  END IF;

  -- If a new DOO opening already exists for the same organization, archive the legacy duplicate
  -- before attempting to move its slug onto the canonical value.
  UPDATE "JobOpening" old
     SET "status" = 'ARCHIVED'
   WHERE LOWER(old."slug") = 'chief-operating-officer-coo'
     AND EXISTS (
       SELECT 1
         FROM "JobOpening" current
        WHERE current."organizationId" = old."organizationId"
          AND LOWER(current."slug") = 'director-of-operations-doo'
          AND current."id" <> old."id"
     );

  UPDATE "JobOpening"
     SET "title" = 'Director of Operations (DOO)'
   WHERE LOWER("title") LIKE '%chief operating officer%'
      OR LOWER("title") = 'coo'
      OR LOWER("slug") = 'chief-operating-officer-coo';

  UPDATE "JobOpening" old
     SET "slug" = 'director-of-operations-doo'
   WHERE LOWER(old."slug") = 'chief-operating-officer-coo'
     AND NOT EXISTS (
       SELECT 1
         FROM "JobOpening" current
        WHERE current."organizationId" = old."organizationId"
          AND LOWER(current."slug") = 'director-of-operations-doo'
          AND current."id" <> old."id"
     );

  UPDATE "JobOpening"
     SET "applicationPath" = REPLACE("applicationPath", 'applycoo.html', 'applydoo.html')
   WHERE "applicationPath" LIKE '%applycoo.html%';

  UPDATE "JobOpening"
     SET "summary" = REPLACE(REPLACE("summary", 'Chief Operating Officer', 'Director of Operations'), 'COO', 'DOO')
   WHERE "summary" LIKE '%Chief Operating Officer%' OR "summary" LIKE '%COO%';

  UPDATE "JobOpening"
     SET "description" = REPLACE(REPLACE("description", 'Chief Operating Officer', 'Director of Operations'), 'COO', 'DOO')
   WHERE "description" LIKE '%Chief Operating Officer%' OR "description" LIKE '%COO%';

  UPDATE "JobOpening"
     SET "requirements" = REPLACE(REPLACE("requirements", 'Chief Operating Officer', 'Director of Operations'), 'COO', 'DOO')
   WHERE "requirements" LIKE '%Chief Operating Officer%' OR "requirements" LIKE '%COO%';

  UPDATE "JobOpening"
     SET "benefits" = REPLACE(REPLACE("benefits", 'Chief Operating Officer', 'Director of Operations'), 'COO', 'DOO')
   WHERE "benefits" LIKE '%Chief Operating Officer%' OR "benefits" LIKE '%COO%';
END $$;
