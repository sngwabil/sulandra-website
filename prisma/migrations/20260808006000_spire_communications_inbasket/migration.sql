ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "threadId" text;
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "parentMessageId" text;
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "senderDisplayName" text;
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "recipientType" text NOT NULL DEFAULT 'USER';
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "recipientPoolId" text;
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "requiresAcknowledgement" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "acknowledgementDueAt" timestamptz;
ALTER TABLE "SpireClinicalMessage" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "SpireClinicalMessage_patient_thread_idx" ON "SpireClinicalMessage"("organizationId","patientId","threadId","createdAt");

ALTER TABLE "SpireClinicalMessageRecipient" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz;
ALTER TABLE "SpireClinicalMessageRecipient" ADD COLUMN IF NOT EXISTS "deliveryStatus" text NOT NULL DEFAULT 'DELIVERED';
ALTER TABLE "SpireClinicalMessageRecipient" ADD COLUMN IF NOT EXISTS "failureReason" text;

CREATE TABLE IF NOT EXISTS "SpireMessageThread" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "organizationId" text NOT NULL,
 "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
 "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
 "subject" text NOT NULL,
 "threadType" text NOT NULL DEFAULT 'CLINICAL',
 "priority" text NOT NULL DEFAULT 'NORMAL',
 "status" text NOT NULL DEFAULT 'OPEN',
 "createdById" text,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMessageThread_patient_idx" ON "SpireMessageThread"("organizationId","patientId","status","updatedAt");

CREATE TABLE IF NOT EXISTS "SpireRoutingPool" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "organizationId" text NOT NULL,
 "name" text NOT NULL,
 "poolType" text NOT NULL DEFAULT 'CLINICAL',
 "description" text,
 "active" boolean NOT NULL DEFAULT true,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("organizationId","name")
);
CREATE TABLE IF NOT EXISTS "SpireRoutingPoolMember" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "organizationId" text NOT NULL,
 "poolId" text NOT NULL REFERENCES "SpireRoutingPool"("id") ON DELETE CASCADE,
 "userId" text NOT NULL,
 "active" boolean NOT NULL DEFAULT true,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("poolId","userId")
);

CREATE TABLE IF NOT EXISTS "SpireClinicalMessageAttachment" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "organizationId" text NOT NULL,
 "messageId" text NOT NULL REFERENCES "SpireClinicalMessage"("id") ON DELETE CASCADE,
 "documentId" text REFERENCES "SpireClinicalDocument"("id") ON DELETE SET NULL,
 "displayName" text,
 "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "assignedPoolId" text;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "readAt" timestamptz;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "acknowledgedAt" timestamptz;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "acknowledgedById" text;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "completedAt" timestamptz;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "completedById" text;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "snoozedUntil" timestamptz;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "threadId" text;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "messageId" text;
ALTER TABLE "SpireInBasketItem" ADD COLUMN IF NOT EXISTS "requiresAcknowledgement" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "SpireInBasket_priority_idx" ON "SpireInBasketItem"("organizationId","assignedToUserId","status","priority","dueAt");

CREATE TABLE IF NOT EXISTS "SpireCommunicationContact" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "organizationId" text NOT NULL,
 "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
 "contactType" text NOT NULL,
 "name" text NOT NULL,
 "relationship" text,
 "email" text,
 "phone" text,
 "preferredMethod" text,
 "active" boolean NOT NULL DEFAULT true,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCommunicationContact_patient_idx" ON "SpireCommunicationContact"("organizationId","patientId","active");

CREATE TABLE IF NOT EXISTS "SpireCommunicationLog" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "organizationId" text NOT NULL,
 "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
 "contactId" text REFERENCES "SpireCommunicationContact"("id") ON DELETE SET NULL,
 "channel" text NOT NULL,
 "direction" text NOT NULL DEFAULT 'OUTBOUND',
 "subject" text,
 "summary" text NOT NULL,
 "deliveryStatus" text NOT NULL DEFAULT 'DOCUMENTED',
 "acknowledgedAt" timestamptz,
 "createdById" text,
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCommunicationLog_patient_idx" ON "SpireCommunicationLog"("organizationId","patientId","createdAt");