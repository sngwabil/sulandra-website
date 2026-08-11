CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- External connectivity foundation. Secrets are not stored in this schema; provider
-- credentials are referenced by environment/secret-manager key names only.

CREATE TABLE IF NOT EXISTS "SpireIntegrationEndpoint" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "baseUrl" text,
  "protocol" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DISABLED',
  "credentialRef" text,
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastHealthAt" timestamptz,
  "lastHealthStatus" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIntegrationEndpoint_kind_check" CHECK ("kind" IN ('PACS','LIS','DEVICE_GATEWAY','CLEARINGHOUSE','ERX','PDMP','TELEHEALTH','SMART_OAUTH','PUSH','MOBILE_BUILD')),
  CONSTRAINT "SpireIntegrationEndpoint_status_check" CHECK ("status" IN ('DISABLED','CONFIGURED','ACTIVE','DEGRADED','ERROR'))
);
CREATE INDEX IF NOT EXISTS "SpireIntegrationEndpoint_scope_idx" ON "SpireIntegrationEndpoint"("organizationId","legalEntityId","kind","status");

CREATE TABLE IF NOT EXISTS "SpireIntegrationMessage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "patientId" text,
  "direction" text NOT NULL,
  "messageType" text NOT NULL,
  "externalId" text,
  "status" text NOT NULL DEFAULT 'QUEUED',
  "payloadSha256" text,
  "payloadMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz,
  "lastError" text,
  "receivedAt" timestamptz,
  "sentAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIntegrationMessage_direction_check" CHECK ("direction" IN ('INBOUND','OUTBOUND')),
  CONSTRAINT "SpireIntegrationMessage_status_check" CHECK ("status" IN ('QUEUED','PROCESSING','SENT','RECEIVED','ACKNOWLEDGED','FAILED','DEAD_LETTER','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpireIntegrationMessage_endpoint_idx" ON "SpireIntegrationMessage"("organizationId","legalEntityId","endpointId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireIntegrationMessage_external_idx" ON "SpireIntegrationMessage"("organizationId","externalId");

CREATE TABLE IF NOT EXISTS "SpireImagingStudyLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "studyInstanceUid" text NOT NULL,
  "accessionNumber" text,
  "modality" text,
  "studyDate" timestamptz,
  "description" text,
  "viewerLaunchPath" text,
  "source" text NOT NULL DEFAULT 'PACS',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","studyInstanceUid")
);
CREATE INDEX IF NOT EXISTS "SpireImagingStudyLink_patient_idx" ON "SpireImagingStudyLink"("organizationId","legalEntityId","patientId","studyDate" DESC);

CREATE TABLE IF NOT EXISTS "SpireLabInterfaceRecord" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "externalOrderId" text,
  "externalResultId" text,
  "messageStandard" text NOT NULL DEFAULT 'HL7V2',
  "messageEvent" text,
  "specimenId" text,
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "provenance" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireLabInterfaceRecord_patient_idx" ON "SpireLabInterfaceRecord"("organizationId","legalEntityId","patientId","receivedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDeviceFeedRegistration" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "deviceIdentifier" text NOT NULL,
  "deviceType" text NOT NULL,
  "manufacturer" text,
  "model" text,
  "location" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDeviceFeedRegistration_patient_idx" ON "SpireDeviceFeedRegistration"("organizationId","legalEntityId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireX12Transaction" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "patientId" text,
  "transactionSet" text NOT NULL,
  "direction" text NOT NULL,
  "controlNumber" text,
  "claimId" text,
  "status" text NOT NULL DEFAULT 'QUEUED',
  "acknowledgementCode" text,
  "rejectionReason" text,
  "payloadSha256" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "submittedAt" timestamptz,
  "acknowledgedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireX12Transaction_set_check" CHECK ("transactionSet" IN ('270','271','276','277','278','837P','837I','835','999','TA1')),
  CONSTRAINT "SpireX12Transaction_direction_check" CHECK ("direction" IN ('INBOUND','OUTBOUND'))
);
CREATE INDEX IF NOT EXISTS "SpireX12Transaction_scope_idx" ON "SpireX12Transaction"("organizationId","legalEntityId","transactionSet","status","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireErxTransaction" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "medicationOrderId" text,
  "transactionType" text NOT NULL,
  "networkMessageId" text,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "controlledSubstance" boolean NOT NULL DEFAULT false,
  "epcsRequired" boolean NOT NULL DEFAULT false,
  "epcsSatisfiedAt" timestamptz,
  "prescriberUserId" text,
  "pharmacyNcpdpId" text,
  "responseCode" text,
  "responseText" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireErxTransaction_type_check" CHECK ("transactionType" IN ('NEWRX','RXCHANGE','RXRENEWAL','CANCELRX','RXFILL','STATUS'))
);
CREATE INDEX IF NOT EXISTS "SpireErxTransaction_patient_idx" ON "SpireErxTransaction"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePdmpQuery" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "requestedById" text NOT NULL,
  "purpose" text NOT NULL,
  "status" text NOT NULL DEFAULT 'REQUESTED',
  "externalRequestId" text,
  "resultSummary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "SpirePdmpQuery_patient_idx" ON "SpirePdmpQuery"("organizationId","legalEntityId","patientId","requestedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireTelehealthSession" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "encounterId" text,
  "endpointId" text REFERENCES "SpireIntegrationEndpoint"("id") ON DELETE SET NULL,
  "roomKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "consentRecordedAt" timestamptz,
  "startedAt" timestamptz,
  "endedAt" timestamptz,
  "transportMode" text NOT NULL DEFAULT 'SFU',
  "region" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireTelehealthSession_status_check" CHECK ("status" IN ('SCHEDULED','WAITING','ACTIVE','ENDED','CANCELLED','FAILED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireTelehealthSession_room_idx" ON "SpireTelehealthSession"("organizationId","roomKey");

CREATE TABLE IF NOT EXISTS "SpireSmartClient" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "clientId" text NOT NULL,
  "name" text NOT NULL,
  "redirectUris" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "launchUris" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowedScopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tokenEndpointAuthMethod" text NOT NULL DEFAULT 'private_key_jwt',
  "jwksUri" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","clientId")
);

CREATE TABLE IF NOT EXISTS "SpireOAuthAuthorization" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "clientId" text NOT NULL,
  "userId" text NOT NULL,
  "patientId" text,
  "scope" text NOT NULL,
  "codeHash" text,
  "accessTokenHash" text,
  "refreshTokenHash" text,
  "pkceChallenge" text,
  "status" text NOT NULL DEFAULT 'AUTHORIZED',
  "authorizedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "SpireOAuthAuthorization_client_idx" ON "SpireOAuthAuthorization"("organizationId","clientId","userId","status","expiresAt");

CREATE TABLE IF NOT EXISTS "SpirePushDevice" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "userId" text NOT NULL,
  "platform" text NOT NULL,
  "provider" text NOT NULL,
  "tokenHash" text NOT NULL,
  "tokenCiphertext" text,
  "appBundleId" text,
  "environment" text NOT NULL DEFAULT 'PRODUCTION',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpirePushDevice_platform_check" CHECK ("platform" IN ('IOS','ANDROID')),
  CONSTRAINT "SpirePushDevice_provider_check" CHECK ("provider" IN ('APNS','FCM'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpirePushDevice_token_idx" ON "SpirePushDevice"("organizationId","userId","provider","tokenHash");

CREATE TABLE IF NOT EXISTS "SpirePushDelivery" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "userId" text NOT NULL,
  "deviceId" text REFERENCES "SpirePushDevice"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "status" text NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" text,
  "errorCode" text,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "sentAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "SpirePushDelivery_user_idx" ON "SpirePushDelivery"("organizationId","userId","status","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireMobileBuild" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "platform" text NOT NULL,
  "bundleId" text NOT NULL,
  "version" text NOT NULL,
  "buildNumber" text NOT NULL,
  "gitSha" text,
  "distribution" text NOT NULL,
  "status" text NOT NULL DEFAULT 'REGISTERED',
  "artifactUrl" text,
  "releasedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("platform","bundleId","version","buildNumber")
);
