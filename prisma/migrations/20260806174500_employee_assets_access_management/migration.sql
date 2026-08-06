CREATE TABLE IF NOT EXISTS "EmployeeAsset" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "assetTag" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "manufacturer" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL DEFAULT '',
  "serialNumber" TEXT NOT NULL DEFAULT '',
  "purchaseDate" DATE,
  "purchaseCost" NUMERIC(12,2),
  "warrantyEndDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "locationId" TEXT,
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAsset_category_check" CHECK ("category" IN ('COMPUTER','PHONE','TABLET','VEHICLE','BADGE','KEY','UNIFORM','MEDICAL_DEVICE','FURNITURE','TOOL','OTHER')),
  CONSTRAINT "EmployeeAsset_status_check" CHECK ("status" IN ('AVAILABLE','ASSIGNED','IN_REPAIR','LOST','STOLEN','RETIRED','DISPOSED')),
  CONSTRAINT "EmployeeAsset_condition_check" CHECK ("condition" IN ('NEW','GOOD','FAIR','POOR','DAMAGED')),
  CONSTRAINT "EmployeeAsset_cost_check" CHECK ("purchaseCost" IS NULL OR "purchaseCost">=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeAsset_asset_tag_unique" ON "EmployeeAsset"("organizationId","assetTag");
CREATE INDEX IF NOT EXISTS "EmployeeAsset_status_idx" ON "EmployeeAsset"("organizationId","status","category");
CREATE INDEX IF NOT EXISTS "EmployeeAsset_warranty_idx" ON "EmployeeAsset"("organizationId","warrantyEndDate") WHERE "warrantyEndDate" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "EmployeeAssetAssignment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ NOT NULL,
  "expectedReturnDate" DATE,
  "returnedAt" TIMESTAMPTZ,
  "conditionAtIssue" TEXT NOT NULL DEFAULT 'GOOD',
  "conditionAtReturn" TEXT,
  "issueNotes" TEXT NOT NULL DEFAULT '',
  "returnNotes" TEXT NOT NULL DEFAULT '',
  "chargesAssessed" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "acknowledgedAt" TIMESTAMPTZ,
  "acknowledgmentComments" TEXT NOT NULL DEFAULT '',
  "issuedById" TEXT NOT NULL,
  "returnedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAssetAssignment_issue_condition_check" CHECK ("conditionAtIssue" IN ('NEW','GOOD','FAIR','POOR','DAMAGED')),
  CONSTRAINT "EmployeeAssetAssignment_return_condition_check" CHECK ("conditionAtReturn" IS NULL OR "conditionAtReturn" IN ('GOOD','FAIR','POOR','DAMAGED','LOST','STOLEN')),
  CONSTRAINT "EmployeeAssetAssignment_charge_check" CHECK ("chargesAssessed">=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeAssetAssignment_active_asset_unique" ON "EmployeeAssetAssignment"("organizationId","assetId") WHERE "returnedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "EmployeeAssetAssignment_employee_idx" ON "EmployeeAssetAssignment"("organizationId","employeeId","returnedAt","expectedReturnDate");
CREATE INDEX IF NOT EXISTS "EmployeeAssetAssignment_ack_idx" ON "EmployeeAssetAssignment"("organizationId","employeeId","acknowledgmentRequired","acknowledgedAt") WHERE "returnedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "EmployeeAccessGrant" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "accessType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "identifier" TEXT NOT NULL DEFAULT '',
  "locationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "leastPrivilegeJustification" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "grantedById" TEXT NOT NULL,
  "revokedById" TEXT,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAccessGrant_type_check" CHECK ("accessType" IN ('BUILDING','SERVICE_HOME','SYSTEM','APPLICATION','EMAIL','VPN','DATABASE','SHARED_DRIVE','KEY','BADGE','VEHICLE','OTHER')),
  CONSTRAINT "EmployeeAccessGrant_status_check" CHECK ("status" IN ('REQUESTED','APPROVED','ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
  CONSTRAINT "EmployeeAccessGrant_dates_check" CHECK ("expiresAt" IS NULL OR "effectiveAt" IS NULL OR "expiresAt">="effectiveAt")
);
CREATE INDEX IF NOT EXISTS "EmployeeAccessGrant_employee_idx" ON "EmployeeAccessGrant"("organizationId","employeeId","status","expiresAt");
CREATE INDEX IF NOT EXISTS "EmployeeAccessGrant_expiry_idx" ON "EmployeeAccessGrant"("organizationId","status","expiresAt") WHERE "status" IN ('APPROVED','ACTIVE') AND "expiresAt" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "EmployeeAssetMaintenance" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "maintenanceType" TEXT NOT NULL,
  "reportedAt" TIMESTAMPTZ NOT NULL,
  "scheduledAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "description" TEXT NOT NULL,
  "vendor" TEXT NOT NULL DEFAULT '',
  "cost" NUMERIC(12,2),
  "resolution" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAssetMaintenance_type_check" CHECK ("maintenanceType" IN ('INSPECTION','REPAIR','PREVENTIVE','REPLACEMENT','CLEANING','OTHER')),
  CONSTRAINT "EmployeeAssetMaintenance_status_check" CHECK ("status" IN ('OPEN','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  CONSTRAINT "EmployeeAssetMaintenance_cost_check" CHECK ("cost" IS NULL OR "cost">=0)
);
CREATE INDEX IF NOT EXISTS "EmployeeAssetMaintenance_asset_idx" ON "EmployeeAssetMaintenance"("organizationId","assetId","status","scheduledAt");
CREATE INDEX IF NOT EXISTS "EmployeeAssetMaintenance_due_idx" ON "EmployeeAssetMaintenance"("organizationId","status","scheduledAt") WHERE "status" IN ('OPEN','SCHEDULED','IN_PROGRESS');

CREATE TABLE IF NOT EXISTS "EmployeeFacility" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "facilityType" TEXT NOT NULL,
  "address" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "managerUserId" TEXT,
  "emergencyContact" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeFacility_type_check" CHECK ("facilityType" IN ('OFFICE','SERVICE_HOME','WAREHOUSE','TRAINING_SITE','VEHICLE_LOT','OTHER')),
  CONSTRAINT "EmployeeFacility_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE','CLOSED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeFacility_org_idx" ON "EmployeeFacility"("organizationId","status","facilityType","name");

CREATE TABLE IF NOT EXISTS "EmployeeAssetIncident" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "assetId" TEXT,
  "employeeId" TEXT,
  "accessGrantId" TEXT,
  "incidentType" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "severity" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reportedToLawEnforcement" BOOLEAN NOT NULL DEFAULT FALSE,
  "reportNumber" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAssetIncident_type_check" CHECK ("incidentType" IN ('LOST_ASSET','STOLEN_ASSET','DAMAGE','SECURITY_BREACH','ACCESS_MISUSE','KEY_LOSS','BADGE_LOSS','VEHICLE_INCIDENT','OTHER')),
  CONSTRAINT "EmployeeAssetIncident_severity_check" CHECK ("severity" IN ('LOW','MODERATE','HIGH','CRITICAL')),
  CONSTRAINT "EmployeeAssetIncident_status_check" CHECK ("status" IN ('OPEN','INVESTIGATING','RESOLVED','CLOSED')),
  CONSTRAINT "EmployeeAssetIncident_link_check" CHECK ("assetId" IS NOT NULL OR "employeeId" IS NOT NULL OR "accessGrantId" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "EmployeeAssetIncident_org_idx" ON "EmployeeAssetIncident"("organizationId","status","severity","occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeAssetIncident_employee_idx" ON "EmployeeAssetIncident"("organizationId","employeeId","status") WHERE "employeeId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "EmployeeAssetAccessEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAssetAccessEvent_details_object_check" CHECK (jsonb_typeof("details")='object')
);
CREATE INDEX IF NOT EXISTS "EmployeeAssetAccessEvent_org_idx" ON "EmployeeAssetAccessEvent"("organizationId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeAssetAccessEvent_employee_idx" ON "EmployeeAssetAccessEvent"("organizationId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeAssetAccessEvent_resource_idx" ON "EmployeeAssetAccessEvent"("organizationId","resourceType","resourceId","createdAt");
