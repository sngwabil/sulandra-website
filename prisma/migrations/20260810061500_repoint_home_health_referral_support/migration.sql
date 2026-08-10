-- Repoint support records from the abandoned draft submission table to the
-- richer HomeHealthReferral model used by the secure referral API.
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment"
  DROP CONSTRAINT IF EXISTS "HomeHealthReferralAttachment_referralId_fkey";
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment"
  ADD CONSTRAINT "HomeHealthReferralAttachment_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "HomeHealthReferral"("id") ON DELETE CASCADE;

ALTER TABLE IF EXISTS "HomeHealthReferralEvent"
  DROP CONSTRAINT IF EXISTS "HomeHealthReferralEvent_referralId_fkey";
ALTER TABLE IF EXISTS "HomeHealthReferralEvent"
  ADD CONSTRAINT "HomeHealthReferralEvent_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "HomeHealthReferral"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "HomeHealthReferralAttachment_active_referral_idx"
  ON "HomeHealthReferralAttachment"("organizationId","legalEntityId","referralId","uploadedAt" DESC);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralEvent_active_referral_idx"
  ON "HomeHealthReferralEvent"("organizationId","legalEntityId","referralId","createdAt" DESC);
