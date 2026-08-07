-- Keep the production job-opening catalog aligned with the Director of Operations role.
-- Historical migrations are intentionally not rewritten because deployed Prisma migration
-- checksums must remain immutable.

UPDATE "JobOpening"
   SET "title" = 'Director of Operations (DOO)'
 WHERE LOWER("title") LIKE '%chief operating officer%'
    OR LOWER("title") = 'coo'
    OR LOWER("slug") = 'chief-operating-officer-coo';

UPDATE "JobOpening"
   SET "slug" = 'director-of-operations-doo'
 WHERE LOWER("slug") = 'chief-operating-officer-coo';

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
