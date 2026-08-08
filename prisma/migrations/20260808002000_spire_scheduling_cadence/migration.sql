CREATE TABLE IF NOT EXISTS "SpireScheduleResource" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "name" text NOT NULL,
  "resourceType" text NOT NULL DEFAULT 'ROOM',
  "locationId" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireScheduleResource_org_idx" ON "SpireScheduleResource"("organizationId","resourceType","active");

CREATE TABLE IF NOT EXISTS "SpireProviderAvailability" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "providerUserId" text NOT NULL,
  "locationId" text,
  "weekday" integer NOT NULL,
  "startTime" text NOT NULL,
  "endTime" text NOT NULL,
  "slotMinutes" integer NOT NULL DEFAULT 30,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("weekday" BETWEEN 0 AND 6),
  CHECK ("slotMinutes" > 0)
);
CREATE INDEX IF NOT EXISTS "SpireProviderAvailability_provider_idx" ON "SpireProviderAvailability"("organizationId","providerUserId","weekday","active");

CREATE TABLE IF NOT EXISTS "SpireAppointmentStatusHistory" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "appointmentId" text NOT NULL REFERENCES "SpireAppointment"("id") ON DELETE CASCADE,
  "fromStatus" text,
  "toStatus" text NOT NULL,
  "reason" text,
  "changedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAppointmentStatusHistory_appt_idx" ON "SpireAppointmentStatusHistory"("organizationId","appointmentId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireAppointmentReminder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "appointmentId" text NOT NULL REFERENCES "SpireAppointment"("id") ON DELETE CASCADE,
  "channel" text NOT NULL DEFAULT 'EMAIL',
  "scheduledFor" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "sentAt" timestamptz,
  "deliveryDetail" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAppointmentReminder_due_idx" ON "SpireAppointmentReminder"("organizationId","status","scheduledFor");

CREATE TABLE IF NOT EXISTS "SpireAppointmentWaitlist" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "appointmentType" text NOT NULL,
  "providerUserId" text,
  "locationId" text,
  "preferredStart" timestamptz,
  "preferredEnd" timestamptz,
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'OPEN',
  "notes" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAppointmentWaitlist_org_idx" ON "SpireAppointmentWaitlist"("organizationId","status","priority","createdAt");

CREATE TABLE IF NOT EXISTS "SpireAppointmentTransportation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "appointmentId" text NOT NULL UNIQUE REFERENCES "SpireAppointment"("id") ON DELETE CASCADE,
  "required" boolean NOT NULL DEFAULT false,
  "mode" text,
  "vendor" text,
  "pickupAddress" text,
  "pickupAt" timestamptz,
  "returnPickupAt" timestamptz,
  "status" text NOT NULL DEFAULT 'NOT_REQUIRED',
  "confirmationNumber" text,
  "notes" text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireAppointmentPreparation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "appointmentId" text NOT NULL REFERENCES "SpireAppointment"("id") ON DELETE CASCADE,
  "itemType" text NOT NULL,
  "label" text NOT NULL,
  "required" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'PENDING',
  "completedAt" timestamptz,
  "completedById" text,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAppointmentPreparation_appt_idx" ON "SpireAppointmentPreparation"("organizationId","appointmentId","status");

ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "resourceId" text;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "durationMinutes" integer;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "recurrenceRule" text;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "recurrenceParentId" text;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "checkInAt" timestamptz;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "roomedAt" timestamptz;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "visitStartedAt" timestamptz;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "checkOutAt" timestamptz;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "cancelledAt" timestamptz;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "noShowAt" timestamptz;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "cancellationReason" text;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "visitPreparationStatus" text NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "transportationRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "createdById" text;
CREATE INDEX IF NOT EXISTS "SpireAppointment_provider_start_idx" ON "SpireAppointment"("organizationId","providerUserId","startsAt");
CREATE INDEX IF NOT EXISTS "SpireAppointment_location_start_idx" ON "SpireAppointment"("organizationId","locationId","startsAt");
