-- Move sensitive onboarding paperwork out of the public offer stage.
-- Existing pending rows created before employee-profile creation are legacy placeholders,
-- not signed applicant documents, and must not block offer acceptance or hiring.
DELETE FROM "EmploymentOfferDocument" AS document
USING "EmploymentOffer" AS offer
WHERE document."offerId" = offer."id"
  AND document."status" = 'PENDING'
  AND offer."employeeId" IS NULL
  AND offer."status" IN ('OFFER_SENT', 'OFFER_VIEWED', 'OFFER_ACCEPTED');
