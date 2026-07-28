CREATE TABLE "EmployeePortalCredential" (
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastSignedInAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeePortalCredential_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "EmployeePortalCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "EmployeePortalCredential_username_key"
  ON "EmployeePortalCredential" (LOWER("username"));
CREATE INDEX "EmployeePortalCredential_lockedUntil_idx"
  ON "EmployeePortalCredential" ("lockedUntil");
