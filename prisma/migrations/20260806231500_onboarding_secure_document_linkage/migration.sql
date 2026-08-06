CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSecureDocument_source_unique" ON "EmployeeSecureDocument"("organizationId","sourceType","sourceId") WHERE "sourceId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "materializeApplicantSecureDocuments"() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "EmployeeSecureDocument" (
    "id","organizationId","employeeId","sourceType","sourceId","category","sensitivity","fileName","mimeType","sizeBytes",
    "bucket","objectKey","sha256","etag","encryption","kmsKeyId","ivBase64","authTagBase64","malwareStatus","malwareEngine",
    "malwareSignature","malwareDetail","version","retentionUntil","legalHold","status","uploadedById","createdAt","updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    NEW."organizationId",
    NEW."employeeId",
    'APPLICANT',
    d."id",
    d."category"::text,
    CASE
      WHEN d."category"::text IN ('BACKGROUND_CHECK') THEN 'BACKGROUND'
      WHEN d."category"::text IN ('SOCIAL_SECURITY_CARD','DRIVER_LICENSE') THEN 'IDENTITY'
      WHEN d."category"::text IN ('TB_TEST','PHYSICAL') THEN 'MEDICAL'
      ELSE 'GENERAL'
    END,
    COALESCE(d."fileName",d."label",'Applicant document'),
    COALESCE(d."mimeType",'application/octet-stream'),
    COALESCE(d."sizeBytes",0),
    o."bucket",o."objectKey",o."sha256",o."etag",o."encryption",o."kmsKeyId",o."ivBase64",o."authTagBase64",
    o."malwareStatus",o."malwareEngine",o."malwareSignature",o."malwareDetail",
    1,NULL,FALSE,'ACTIVE',NEW."linkedById",COALESCE(d."createdAt",NOW()),NOW()
  FROM "ApplicantSecureDocumentObject" o
  JOIN "ApplicantDocument" d ON d."id"=o."applicantDocumentId"
  WHERE o."organizationId"=NEW."organizationId" AND o."applicationId"=NEW."applicationId"
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "EmployeeOnboardingLink_materialize_secure_documents" ON "EmployeeOnboardingLink";
CREATE TRIGGER "EmployeeOnboardingLink_materialize_secure_documents"
AFTER INSERT OR UPDATE OF "employeeId" ON "EmployeeOnboardingLink"
FOR EACH ROW EXECUTE FUNCTION "materializeApplicantSecureDocuments"();
