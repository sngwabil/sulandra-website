-- SPIRE 1.1 Step 2 regulatory metadata correction.
-- Current Ohio rules as of 2026-08-17:
-- - OAC 5123-9-17 Adult Day Support effective 2026-07-16.
-- - OAC 5123-9-06 (IO/L1) effective 2026-07-01 and requires HCBS records
--   for six years from receipt of payment or until an initiated audit resolves,
--   whichever is longer.
-- - OAC 5123-9-40 applies the same retention rule to SELF waiver services.

UPDATE "SpireDoddDocumentationProfile"
SET "effectiveFrom"='2026-07-16'::date,"updatedAt"=now()
WHERE "code"='ADULT_DAY_5123_9_17';

UPDATE "SpireRetentionPolicy"
SET "authority"='OAC 5123-9-06(J) for IO/L1; OAC 5123-9-40(K) for SELF, as applicable',
    "effectiveFrom"='2026-07-01'::date,
    "updatedAt"=now()
WHERE "code"='DODD_SERVICE_DOCUMENTATION_6Y';
