CREATE TABLE IF NOT EXISTS "EmployeeAuthSession" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "revokedById" TEXT,
  "revocationReason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeAuthSession_user_idx" ON "EmployeeAuthSession"("organizationId","userId","expiresAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeAuthSession_active_idx" ON "EmployeeAuthSession"("organizationId","userId","revokedAt","expiresAt");

CREATE TABLE IF NOT EXISTS "EmployeeMfaProfile" (
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encryptedSecret" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT FALSE,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "recoveryCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "enrolledAt" TIMESTAMPTZ,
  "lastVerifiedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY("organizationId","userId")
);

CREATE TABLE IF NOT EXISTS "EmployeePortalAccessControl" (
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "portal" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "reason" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY("organizationId","userId","portal")
);

CREATE TABLE IF NOT EXISTS "EmployeeLoginEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "userId" TEXT,
  "identifier" TEXT,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeLoginEvent_decision_check" CHECK ("decision" IN ('ALLOW','DENY'))
);
CREATE INDEX IF NOT EXISTS "EmployeeLoginEvent_user_idx" ON "EmployeeLoginEvent"("organizationId","userId","createdAt" DESC);

DO $$ BEGIN
  IF to_regclass('public."User"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeAuthSession_user_fk') THEN
    ALTER TABLE "EmployeeAuthSession" ADD CONSTRAINT "EmployeeAuthSession_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF to_regclass('public."User"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeMfaProfile_user_fk') THEN
    ALTER TABLE "EmployeeMfaProfile" ADD CONSTRAINT "EmployeeMfaProfile_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF to_regclass('public."User"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeePortalAccessControl_user_fk') THEN
    ALTER TABLE "EmployeePortalAccessControl" ADD CONSTRAINT "EmployeePortalAccessControl_user_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
