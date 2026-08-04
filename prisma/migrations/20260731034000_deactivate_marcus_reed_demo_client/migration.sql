-- One-time cleanup for the exact Spire demo client record.
-- Deactivation removes the client from all production Spire lists while preserving audit integrity.
UPDATE "SpireClientProfile"
SET "active" = FALSE,
    "updatedAt" = NOW()
WHERE lower(trim("displayName")) = 'marcus reed'
  AND "active" = TRUE;
