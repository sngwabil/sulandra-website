CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Multi-company foundation for the Sulandra enterprise. LegalEntity records describe
-- operating context only; parentLegalEntityId must not be treated as proof of legal
-- ownership. The planned companies remain PLANNED until formation/transfer is complete.

CREATE TABLE IF NOT EXISTS "LegalEntity" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "code" text NOT NULL,
  "legalName" text NOT NULL,
  "displayName" text NOT NULL,
  "entityType" text NOT NULL DEFAULT 'OPERATING',
  "status" text NOT NULL DEFAULT 'PLANNED',
  "parentLegalEntityId" text REFERENCES "LegalEntity"("id") ON DELETE SET NULL,
  "isEmployer" boolean NOT NULL DEFAULT false,
  "isProvider" boolean NOT NULL DEFAULT false,
  "branding" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "contact" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "LegalEntity_type_check" CHECK ("entityType" IN ('HOLDING','OPERATING')),
  CONSTRAINT "LegalEntity_status_check" CHECK ("status" IN ('ACTIVE','PLANNED','INACTIVE')),
  CONSTRAINT "LegalEntity_org_code_key" UNIQUE ("organizationId","code")
);
CREATE INDEX IF NOT EXISTS "LegalEntity_org_status_idx" ON "LegalEntity"("organizationId","status","displayName");

CREATE TABLE IF NOT EXISTS "Department" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL REFERENCES "LegalEntity"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sharedEnterprise" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Department_entity_code_key" UNIQUE ("legalEntityId","code")
);
CREATE INDEX IF NOT EXISTS "Department_org_entity_idx" ON "Department"("organizationId","legalEntityId","active","name");

CREATE TABLE IF NOT EXISTS "Employment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "legalEntityId" text NOT NULL REFERENCES "LegalEntity"("id") ON DELETE RESTRICT,
  "departmentId" text REFERENCES "Department"("id") ON DELETE SET NULL,
  "employeeNumber" text,
  "jobTitle" text,
  "employmentType" text NOT NULL DEFAULT 'EMPLOYEE',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "primaryEmployment" boolean NOT NULL DEFAULT false,
  "startsAt" date NOT NULL DEFAULT CURRENT_DATE,
  "endsAt" date,
  "source" text NOT NULL DEFAULT 'MANUAL',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Employment_type_check" CHECK ("employmentType" IN ('OWNER','EMPLOYEE','CONTRACTOR','TEMPORARY','VOLUNTEER')),
  CONSTRAINT "Employment_status_check" CHECK ("status" IN ('ACTIVE','LEAVE','SUSPENDED','TERMINATED')),
  CONSTRAINT "Employment_dates_check" CHECK ("endsAt" IS NULL OR "endsAt">="startsAt")
);
CREATE INDEX IF NOT EXISTS "Employment_org_user_idx" ON "Employment"("organizationId","userId","status");
CREATE INDEX IF NOT EXISTS "Employment_org_entity_department_idx" ON "Employment"("organizationId","legalEntityId","departmentId","status");
CREATE UNIQUE INDEX IF NOT EXISTS "Employment_active_user_entity_key" ON "Employment"("organizationId","userId","legalEntityId") WHERE "status"<>'TERMINATED';
CREATE UNIQUE INDEX IF NOT EXISTS "Employment_primary_user_key" ON "Employment"("organizationId","userId") WHERE "primaryEmployment"=true AND "status"<>'TERMINATED';

-- This is deliberately distinct from EmployeeAccessGrant, which tracks equipment,
-- systems and facility provisioning. UserEntityAccessGrant controls company scope.
CREATE TABLE IF NOT EXISTS "UserEntityAccessGrant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "scopeType" text NOT NULL,
  "legalEntityId" text REFERENCES "LegalEntity"("id") ON DELETE CASCADE,
  "departmentId" text REFERENCES "Department"("id") ON DELETE CASCADE,
  "clientId" text,
  "roleCode" text NOT NULL DEFAULT 'MEMBER',
  "permissionKey" text NOT NULL DEFAULT 'PORTAL_ACCESS',
  "accessLevel" text NOT NULL DEFAULT 'READ',
  "active" boolean NOT NULL DEFAULT true,
  "effectiveFrom" timestamptz NOT NULL DEFAULT now(),
  "effectiveTo" timestamptz,
  "grantedById" text,
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserEntityAccessGrant_scope_check" CHECK ("scopeType" IN ('ENTERPRISE','LEGAL_ENTITY','DEPARTMENT','CLIENT')),
  CONSTRAINT "UserEntityAccessGrant_level_check" CHECK ("accessLevel" IN ('READ','WRITE','MANAGE')),
  CONSTRAINT "UserEntityAccessGrant_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom"),
  CONSTRAINT "UserEntityAccessGrant_target_check" CHECK (
    ("scopeType"='ENTERPRISE') OR
    ("scopeType"='LEGAL_ENTITY' AND "legalEntityId" IS NOT NULL) OR
    ("scopeType"='DEPARTMENT' AND "departmentId" IS NOT NULL) OR
    ("scopeType"='CLIENT' AND "clientId" IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS "UserEntityAccessGrant_user_idx" ON "UserEntityAccessGrant"("organizationId","userId","active","scopeType");
CREATE INDEX IF NOT EXISTS "UserEntityAccessGrant_entity_idx" ON "UserEntityAccessGrant"("organizationId","legalEntityId","departmentId","active");
CREATE INDEX IF NOT EXISTS "UserEntityAccessGrant_client_idx" ON "UserEntityAccessGrant"("organizationId","clientId","active") WHERE "clientId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UserEntityAccessGrant_active_scope_key" ON "UserEntityAccessGrant"(
  "organizationId","userId","scopeType",COALESCE("legalEntityId",''),COALESCE("departmentId",''),COALESCE("clientId",''),"roleCode","permissionKey"
) WHERE "active"=true;

CREATE TABLE IF NOT EXISTS "ClientEnrollment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "clientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "legalEntityId" text NOT NULL REFERENCES "LegalEntity"("id") ON DELETE RESTRICT,
  "departmentId" text REFERENCES "Department"("id") ON DELETE SET NULL,
  "serviceType" text NOT NULL,
  "programCode" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "primaryEnrollment" boolean NOT NULL DEFAULT false,
  "startsAt" date NOT NULL DEFAULT CURRENT_DATE,
  "endsAt" date,
  "source" text NOT NULL DEFAULT 'MANUAL',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ClientEnrollment_status_check" CHECK ("status" IN ('PENDING','ACTIVE','PAUSED','DISCHARGED','INACTIVE')),
  CONSTRAINT "ClientEnrollment_dates_check" CHECK ("endsAt" IS NULL OR "endsAt">="startsAt")
);
CREATE INDEX IF NOT EXISTS "ClientEnrollment_client_idx" ON "ClientEnrollment"("organizationId","clientId","status");
CREATE INDEX IF NOT EXISTS "ClientEnrollment_entity_idx" ON "ClientEnrollment"("organizationId","legalEntityId","departmentId","status");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientEnrollment_active_service_key" ON "ClientEnrollment"("organizationId","clientId","legalEntityId","serviceType") WHERE "status" IN ('PENDING','ACTIVE','PAUSED');
CREATE UNIQUE INDEX IF NOT EXISTS "ClientEnrollment_primary_client_key" ON "ClientEnrollment"("organizationId","clientId") WHERE "primaryEnrollment"=true AND "status" IN ('PENDING','ACTIVE','PAUSED');

INSERT INTO "LegalEntity" ("organizationId","code","legalName","displayName","entityType","status","isEmployer","isProvider","metadata")
SELECT o."id", seed."code", seed."legalName", seed."displayName", seed."entityType", seed."status", seed."isEmployer", seed."isProvider",
       jsonb_build_object('seededBy','multi_company_entity_foundation','legalOwnershipPending',seed."ownershipPending")
FROM "Organization" o
CROSS JOIN (VALUES
  ('SULANDRA_HEALTH','Sulandra Health LLC','Sulandra Health','HOLDING','PLANNED',false,false,true),
  ('SCLS','Sulandra Community Living Services LLC','Sulandra Community Living Services','OPERATING','ACTIVE',true,true,false),
  ('HOME_HEALTH','Sulandra Home Health Care Services LLC','Sulandra Home Health Care Services','OPERATING','PLANNED',false,false,true),
  ('NMT','Sulandra NMT Services LLC','Sulandra NMT Services','OPERATING','PLANNED',false,false,true)
) AS seed("code","legalName","displayName","entityType","status","isEmployer","isProvider","ownershipPending")
ON CONFLICT ("organizationId","code") DO NOTHING;

INSERT INTO "Department" ("organizationId","legalEntityId","code","name","sharedEnterprise","active","metadata")
SELECT e."organizationId", e."id", seed."code", seed."name", seed."sharedEnterprise", true,
       jsonb_build_object('seededBy','multi_company_entity_foundation')
FROM "LegalEntity" e
JOIN (VALUES
  ('SULANDRA_HEALTH','EXECUTIVE','Executive',true),
  ('SULANDRA_HEALTH','HUMAN_RESOURCES','Human Resources',true),
  ('SULANDRA_HEALTH','FINANCE','Finance',true),
  ('SULANDRA_HEALTH','TECHNOLOGY','Technology',true),
  ('SULANDRA_HEALTH','EDUCATION_COMPLIANCE','Education & Compliance',true),
  ('SCLS','EXECUTIVE','Executive',false),
  ('SCLS','HUMAN_RESOURCES','Human Resources',false),
  ('SCLS','ADMINISTRATION','Administration',false),
  ('SCLS','COMMUNITY_LIVING','Community Living Services',false),
  ('SCLS','CLINICAL_SERVICES','Clinical Services',false),
  ('SCLS','SCHEDULING','Scheduling',false),
  ('SCLS','BILLING','Billing',false),
  ('SCLS','EDUCATION_COMPLIANCE','Education & Compliance',true),
  ('HOME_HEALTH','ADMINISTRATION','Administration',false),
  ('HOME_HEALTH','INTAKE','Intake',false),
  ('HOME_HEALTH','NURSING','Nursing',false),
  ('HOME_HEALTH','CLINICAL_SERVICES','Clinical Services',false),
  ('HOME_HEALTH','SCHEDULING','Scheduling',false),
  ('HOME_HEALTH','BILLING','Billing',false),
  ('HOME_HEALTH','QUALITY_COMPLIANCE','Quality & Compliance',false),
  ('NMT','ADMINISTRATION','Administration',false),
  ('NMT','DISPATCH','Dispatch',false),
  ('NMT','DRIVERS','Drivers',false),
  ('NMT','FLEET','Fleet',false),
  ('NMT','BILLING','Billing',false),
  ('NMT','SAFETY_COMPLIANCE','Safety & Compliance',false)
) AS seed("entityCode","code","name","sharedEnterprise") ON seed."entityCode"=e."code"
ON CONFLICT ("legalEntityId","code") DO NOTHING;

-- Preserve every current account by giving it a primary SCLS employment.
INSERT INTO "Employment" (
  "organizationId","userId","legalEntityId","departmentId","jobTitle","employmentType","status","primaryEmployment","startsAt","source","metadata"
)
SELECT u."organizationId", u."id", e."id", d."id", replace(initcap(replace(u."role"::text,'_',' ')),'Doo','Director Of Operations'),
       CASE WHEN lower(u."email")='admin@sulandrahealth.com' THEN 'OWNER' ELSE 'EMPLOYEE' END,
       'ACTIVE', true, CURRENT_DATE, 'EXISTING_SCLS_BACKFILL', jsonb_build_object('previousRole',u."role"::text)
FROM "User" u
JOIN "LegalEntity" e ON e."organizationId"=u."organizationId" AND e."code"='SCLS'
LEFT JOIN "Department" d ON d."legalEntityId"=e."id" AND d."code"=CASE u."role"::text
  WHEN 'CEO' THEN 'EXECUTIVE'
  WHEN 'HR_MANAGER' THEN 'HUMAN_RESOURCES'
  WHEN 'RN' THEN 'CLINICAL_SERVICES'
  WHEN 'LPN' THEN 'CLINICAL_SERVICES'
  WHEN 'DELEGATING_NURSE' THEN 'CLINICAL_SERVICES'
  WHEN 'PROGRAM_MANAGER' THEN 'COMMUNITY_LIVING'
  WHEN 'HOUSE_MANAGER' THEN 'COMMUNITY_LIVING'
  WHEN 'DSP' THEN 'COMMUNITY_LIVING'
  WHEN 'SCHEDULER' THEN 'SCHEDULING'
  WHEN 'BILLING_SPECIALIST' THEN 'BILLING'
  ELSE 'ADMINISTRATION'
END
WHERE NOT EXISTS (
  SELECT 1 FROM "Employment" existing
  WHERE existing."organizationId"=u."organizationId" AND existing."userId"=u."id"
    AND existing."legalEntityId"=e."id" AND existing."status"<>'TERMINATED'
);

-- Enrich the compatibility backfill when the existing Employee 360 profile table
-- has already been created by a previous application release.
DO $$
BEGIN
  IF to_regclass('public."EmployeeManagementProfile"') IS NOT NULL THEN
    UPDATE "Employment" employment
    SET "employeeNumber"=COALESCE(profile."employeeNumber",employment."employeeNumber"),
        "jobTitle"=COALESCE(NULLIF(profile."jobTitle",''),employment."jobTitle"),
        "status"=CASE WHEN profile."employmentStatus" IN ('ACTIVE','LEAVE','SUSPENDED','TERMINATED') THEN profile."employmentStatus" ELSE employment."status" END,
        "startsAt"=COALESCE(profile."hireDate",employment."startsAt"),
        "endsAt"=profile."terminationDate",
        "departmentId"=COALESCE((
          SELECT department."id" FROM "Department" department
          WHERE department."legalEntityId"=employment."legalEntityId"
            AND (upper(department."code")=upper(replace(profile."department",' ','_')) OR lower(department."name")=lower(profile."department"))
          LIMIT 1
        ),employment."departmentId"),
        "updatedAt"=now()
    FROM "EmployeeManagementProfile" profile
    WHERE employment."organizationId"=profile."organizationId"
      AND employment."userId"=profile."userId"
      AND employment."source"='EXISTING_SCLS_BACKFILL';
  END IF;
END $$;

-- Existing users retain SCLS portal access. Enterprise owner access covers all
-- companies, while the normal user grant is constrained to SCLS.
INSERT INTO "UserEntityAccessGrant" (
  "organizationId","userId","scopeType","legalEntityId","roleCode","permissionKey","accessLevel","grantedById","reason","metadata"
)
SELECT u."organizationId",u."id",'LEGAL_ENTITY',e."id",u."role"::text,'PORTAL_ACCESS',
       CASE WHEN u."role"::text IN ('ADMINISTRATOR','CEO','DOO','HR_MANAGER') OR lower(u."email")='admin@sulandrahealth.com' THEN 'MANAGE' ELSE 'READ' END,
       u."id",'Existing SCLS access preserved during multi-company migration',jsonb_build_object('source','EXISTING_SCLS_BACKFILL')
FROM "User" u JOIN "LegalEntity" e ON e."organizationId"=u."organizationId" AND e."code"='SCLS'
WHERE NOT EXISTS (
  SELECT 1 FROM "UserEntityAccessGrant" grant_row
  WHERE grant_row."organizationId"=u."organizationId" AND grant_row."userId"=u."id"
    AND grant_row."scopeType"='LEGAL_ENTITY' AND grant_row."legalEntityId"=e."id"
    AND grant_row."permissionKey"='PORTAL_ACCESS' AND grant_row."active"=true
);

INSERT INTO "UserEntityAccessGrant" (
  "organizationId","userId","scopeType","roleCode","permissionKey","accessLevel","grantedById","reason","metadata"
)
SELECT u."organizationId",u."id",'ENTERPRISE','ENTERPRISE_OWNER','PORTAL_ACCESS','MANAGE',u."id",
       'Enterprise owner access',jsonb_build_object('source','OWNER_AUTHORITY_BACKFILL')
FROM "User" u
WHERE lower(u."email")='admin@sulandrahealth.com'
  AND NOT EXISTS (
    SELECT 1 FROM "UserEntityAccessGrant" grant_row
    WHERE grant_row."organizationId"=u."organizationId" AND grant_row."userId"=u."id"
      AND grant_row."scopeType"='ENTERPRISE' AND grant_row."permissionKey"='PORTAL_ACCESS' AND grant_row."active"=true
  );

-- Current clinical clients remain enrolled with SCLS. Intake requests are not
-- enrollments and therefore are intentionally not promoted by this migration.
INSERT INTO "ClientEnrollment" (
  "organizationId","clientId","legalEntityId","departmentId","serviceType","status","primaryEnrollment","startsAt","source","metadata"
)
SELECT patient."organizationId",patient."id",entity."id",department."id",'COMMUNITY_LIVING',
       CASE WHEN patient."active" THEN 'ACTIVE' ELSE 'INACTIVE' END,true,patient."createdAt"::date,'EXISTING_SCLS_BACKFILL',
       jsonb_build_object('legacyClientId',patient."legacyClientId")
FROM "SpirePatient" patient
JOIN "LegalEntity" entity ON entity."organizationId"=patient."organizationId" AND entity."code"='SCLS'
LEFT JOIN "Department" department ON department."legalEntityId"=entity."id" AND department."code"='COMMUNITY_LIVING'
WHERE NOT EXISTS (
  SELECT 1 FROM "ClientEnrollment" enrollment
  WHERE enrollment."organizationId"=patient."organizationId" AND enrollment."clientId"=patient."id"
    AND enrollment."legalEntityId"=entity."id" AND enrollment."serviceType"='COMMUNITY_LIVING'
    AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
);
