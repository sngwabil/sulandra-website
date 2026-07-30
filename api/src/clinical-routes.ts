import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

type ClinicalRouteDependencies = {
  authOf: (response: express.Response) => AuthContext;
};

const administratorRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.CEO,
  UserRole.COO,
]);
const nurseRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.CEO,
  UserRole.COO,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
]);
const directCareRoles = new Set<UserRole>([
  ...nurseRoles,
  UserRole.DSP,
  UserRole.HOUSE_MANAGER,
]);
const medicationAdministrationRoles = new Set<UserRole>([
  ...directCareRoles,
]);

const adminEmails = new Set([
  'admin@sulandrahealth.com',
  'doo@sulandrahealth.com',
]);

const isAdministrator = (auth: AuthContext) =>
  administratorRoles.has(auth.role)
  || adminEmails.has(String(auth.email || '').trim().toLowerCase());

const title = (value: unknown) => String(value || '')
  .toLowerCase()
  .replaceAll('_', ' ')
  .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

const stringFrom = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const clinicalAudit = async (
  prisma: PrismaClient,
  auth: AuthContext,
  action: string,
  resourceType: string,
  resourceId?: string,
  clientId?: string,
  beforeValue?: unknown,
  afterValue?: unknown,
) => {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"
       ("id","organizationId","actorUserId","actorEmail","clientId","action",
        "resourceType","resourceId","beforeValue","afterValue","ipAddress","userAgent","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,NOW())`,
    randomUUID(),
    auth.organizationId,
    auth.userId,
    auth.email ?? null,
    clientId ?? null,
    action,
    resourceType,
    resourceId ?? null,
    beforeValue == null ? null : JSON.stringify(beforeValue),
    afterValue == null ? null : JSON.stringify(afterValue),
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  );
};

const ensureAdministrator = (auth: AuthContext) => {
  if (!isAdministrator(auth)) {
    throw Object.assign(new Error('Spire administrator permission is required'), { status: 403 });
  }
};

const ensureDirectCare = (auth: AuthContext) => {
  if (!directCareRoles.has(auth.role) && !isAdministrator(auth)) {
    throw Object.assign(new Error('Clinical chart permission is required'), { status: 403 });
  }
};

const canAccessClient = async (prisma: PrismaClient, auth: AuthContext, clientId: string) => {
  if (isAdministrator(auth)) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS (
       SELECT 1
       FROM "SpireEmployeeClientAssignment" a
       WHERE a."organizationId"=$1 AND a."userId"=$2 AND a."clientId"=$3
       UNION ALL
       SELECT 1
       FROM "SpireEmployeeHomeAssignment" h
       JOIN "SpireClientProfile" c
         ON c."organizationId"=h."organizationId" AND c."homeId"=h."homeId"
       WHERE h."organizationId"=$1 AND h."userId"=$2 AND c."clientId"=$3 AND c."active"=TRUE
     ) AS "allowed"`,
    auth.organizationId,
    auth.userId,
    clientId,
  );
  return rows[0]?.allowed === true;
};

const requireClientAccess = async (prisma: PrismaClient, auth: AuthContext, clientId: string) => {
  ensureDirectCare(auth);
  if (!(await canAccessClient(prisma, auth, clientId))) {
    throw Object.assign(new Error('This client is not assigned to the signed-in employee'), { status: 403 });
  }
};

const assignmentSchema = z.object({
  employeeId: z.string().trim().min(1),
  homeIds: z.array(z.string().trim().min(1)).max(500).default([]),
  clientIds: z.array(z.string().trim().min(1)).max(2_000).default([]),
});

const medicationOrderSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(250),
  dose: z.string().trim().min(1).max(160),
  route: z.string().trim().min(1).max(80),
  frequency: z.string().trim().min(1).max(160),
  dueTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(24),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  instructions: z.string().trim().max(4_000).optional(),
});

const medicationStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'HELD', 'DISCONTINUED', 'COMPLETED']),
  reason: z.string().trim().min(1).max(1_000).optional(),
  dueTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(24).optional(),
  frequency: z.string().trim().min(1).max(160).optional(),
});

const marActionSchema = z.object({
  administrationId: z.string().trim().min(1),
  status: z.enum(['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_AVAILABLE', 'ERROR']),
  note: z.string().trim().max(2_000).optional(),
});

const noteSchema = z.object({
  clientId: z.string().trim().min(1),
  noteType: z.string().trim().min(1).max(120).default('PROGRESS_NOTE'),
  body: z.string().trim().min(1).max(50_000),
});

const vitalSchema = z.object({
  clientId: z.string().trim().min(1),
  temperature: z.coerce.number().min(80).max(115).optional(),
  pulse: z.coerce.number().int().min(0).max(300).optional(),
  respirations: z.coerce.number().int().min(0).max(100).optional(),
  systolic: z.coerce.number().int().min(0).max(350).optional(),
  diastolic: z.coerce.number().int().min(0).max(250).optional(),
  spo2: z.coerce.number().int().min(0).max(100).optional(),
  weight: z.coerce.number().min(0).max(2_000).optional(),
  oxygen: z.string().trim().max(120).optional(),
});

const intakeSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).max(500).optional(),
  mimeType: z.string().trim().max(200).optional(),
  storageKey: z.string().trim().max(1_000).optional(),
  extractedData: z.record(z.unknown()).default({}),
  extractionProvider: z.string().trim().max(120).optional(),
});

const intakeReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  clientId: z.string().trim().min(1).optional(),
  reviewNotes: z.string().trim().max(4_000).optional(),
  extractedData: z.record(z.unknown()).optional(),
});

const normalizeHome = (row: Record<string, unknown>) => ({
  id: String(row.id),
  name: stringFrom(row, 'name', 'displayName', 'title')
    || stringFrom(row, 'address', 'streetAddress')
    || `Home ${String(row.id).slice(0, 8)}`,
  address: stringFrom(row, 'address', 'streetAddress', 'locationAddress'),
});

const normalizeClient = (row: Record<string, unknown>) => {
  const firstName = stringFrom(row, 'firstName') || '';
  const lastName = stringFrom(row, 'lastName') || '';
  return {
    id: String(row.clientId || row.id),
    profileId: row.profileId || row.id,
    homeId: row.homeId || row.locationId || null,
    name: stringFrom(row, 'displayName', 'fullName', 'name')
      || `${firstName} ${lastName}`.trim()
      || `Client ${String(row.clientId || row.id).slice(0, 8)}`,
    dob: row.dateOfBirth || row.dob || null,
    allergies: row.allergies || null,
    diagnoses: row.diagnoses || [],
    medicalHistory: row.medicalHistory || {},
  };
};

const listHomes = async (prisma: PrismaClient, organizationId: string) => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ record: Record<string, unknown> }>>(
      `SELECT to_jsonb(l) AS "record" FROM "Location" l
       WHERE l."organizationId"=$1
       ORDER BY COALESCE(to_jsonb(l)->>'name', to_jsonb(l)->>'address', l."id")`,
      organizationId,
    );
    if (rows.length) return rows.map((row) => normalizeHome(row.record));
  } catch (error) {
    console.warn('[spire] Location lookup unavailable; using SpireHome', error);
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "id","name","address" FROM "SpireHome"
     WHERE "organizationId"=$1 AND "active"=TRUE ORDER BY "name"`,
    organizationId,
  );
  return rows.map(normalizeHome);
};

const listClients = async (prisma: PrismaClient, organizationId: string) => {
  const profiles = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "id" AS "profileId","clientId","homeId","displayName","dateOfBirth",
            "allergies","diagnoses","medicalHistory"
     FROM "SpireClientProfile"
     WHERE "organizationId"=$1 AND "active"=TRUE ORDER BY "displayName"`,
    organizationId,
  );
  if (profiles.length) return profiles.map(normalizeClient);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ record: Record<string, unknown> }>>(
      `SELECT to_jsonb(c) AS "record" FROM "Client" c
       WHERE c."organizationId"=$1 ORDER BY c."id"`,
      organizationId,
    );
    return rows.map((row) => normalizeClient(row.record));
  } catch (error) {
    console.warn('[spire] Client lookup unavailable', error);
    return [];
  }
};

const generateMarOccurrences = async (
  prisma: PrismaClient,
  order: { id: string; organizationId: string; clientId: string; startDate: Date; endDate?: Date; dueTimes: string[] },
) => {
  const through = order.endDate && order.endDate < new Date(Date.now() + 31 * 86_400_000)
    ? order.endDate
    : new Date(Date.now() + 30 * 86_400_000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireMedicationAdministration"
       ("id","organizationId","clientId","medicationOrderId","scheduledFor","status","createdAt","updatedAt")
     SELECT gen_random_uuid()::text, $1, $2, $3,
            (d::date + t::time) AT TIME ZONE COALESCE($7, 'America/New_York'),
            'SCHEDULED', NOW(), NOW()
     FROM generate_series($4::date, $5::date, INTERVAL '1 day') d
     CROSS JOIN unnest($6::text[]) t
     ON CONFLICT ("medicationOrderId","scheduledFor") DO NOTHING`,
    order.organizationId,
    order.clientId,
    order.id,
    order.startDate.toISOString().slice(0, 10),
    through.toISOString().slice(0, 10),
    order.dueTimes,
    process.env.SPIRE_TIME_ZONE || 'America/New_York',
  );
};

export const registerClinicalRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  dependencies: ClinicalRouteDependencies,
) => {
  const { authOf } = dependencies;

  app.get('/api/admin/employees', async (_req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","email","role",to_jsonb(u) AS "record" FROM "User" u
         WHERE "organizationId"=$1 ORDER BY LOWER(COALESCE("email",''))`,
        auth.organizationId,
      );
      res.json({ data: rows.map((row) => {
        const record = jsonObject(row.record);
        return {
          id: row.id,
          email: row.email,
          role: row.role,
          displayName: stringFrom(record, 'displayName', 'fullName', 'name')
            || [stringFrom(record, 'firstName'), stringFrom(record, 'lastName')].filter(Boolean).join(' ')
            || row.email || title(row.role),
        };
      }) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/homes', async (_req, res, next) => {
    try { const auth = authOf(res); ensureAdministrator(auth); res.json({ data: await listHomes(prisma, auth.organizationId) }); }
    catch (error) { next(error); }
  });

  app.get('/api/admin/clients', async (_req, res, next) => {
    try { const auth = authOf(res); ensureAdministrator(auth); res.json({ data: await listClients(prisma, auth.organizationId) }); }
    catch (error) { next(error); }
  });

  app.get('/api/admin/spire/assignments/:employeeId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth);
      const homeRows = await prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
        `SELECT "homeId" FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
        auth.organizationId, req.params.employeeId,
      );
      const clientRows = await prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
        `SELECT "clientId" FROM "SpireEmployeeClientAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
        auth.organizationId, req.params.employeeId,
      );
      res.json({ data: { employeeId: req.params.employeeId, homeIds: homeRows.map(x => x.homeId), clientIds: clientRows.map(x => x.clientId) } });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/spire/assignments', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth);
      const input = assignmentSchema.parse(req.body);
      const priorHomes = await prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
        `SELECT "homeId" FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
        auth.organizationId, input.employeeId,
      );
      const priorClients = await prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
        `SELECT "clientId" FROM "SpireEmployeeClientAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
        auth.organizationId, input.employeeId,
      );
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`DELETE FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "userId"=$2`, auth.organizationId, input.employeeId);
        await tx.$executeRawUnsafe(`DELETE FROM "SpireEmployeeClientAssignment" WHERE "organizationId"=$1 AND "userId"=$2`, auth.organizationId, input.employeeId);
        for (const homeId of [...new Set(input.homeIds)]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireEmployeeHomeAssignment" ("id","organizationId","userId","homeId","assignedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
            randomUUID(), auth.organizationId, input.employeeId, homeId, auth.userId,
          );
        }
        for (const clientId of [...new Set(input.clientIds)]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireEmployeeClientAssignment" ("id","organizationId","userId","clientId","assignedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
            randomUUID(), auth.organizationId, input.employeeId, clientId, auth.userId,
          );
        }
      });
      await clinicalAudit(prisma, auth, 'ACCESS_ASSIGNMENTS_REPLACED', 'User', input.employeeId, undefined,
        { homeIds: priorHomes.map(x => x.homeId), clientIds: priorClients.map(x => x.clientId) },
        { homeIds: input.homeIds, clientIds: input.clientIds });
      res.json({ data: input });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/workspace', async (_req, res, next) => {
    try {
      const auth = authOf(res); ensureDirectCare(auth);
      const allHomes = await listHomes(prisma, auth.organizationId);
      const allClients = await listClients(prisma, auth.organizationId);
      let homes = allHomes;
      let clients = allClients;
      if (!isAdministrator(auth)) {
        const assignedHomes = await prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
          `SELECT "homeId" FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
          auth.organizationId, auth.userId,
        );
        const assignedClients = await prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
          `SELECT "clientId" FROM "SpireEmployeeClientAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
          auth.organizationId, auth.userId,
        );
        const homeIds = new Set(assignedHomes.map(x => x.homeId));
        const clientIds = new Set(assignedClients.map(x => x.clientId));
        homes = allHomes.filter(home => homeIds.has(home.id));
        clients = allClients.filter(client => clientIds.has(client.id) || (client.homeId && homeIds.has(String(client.homeId))));
      }
      const clientIds = clients.map(client => client.id);
      const tasks = clientIds.length ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","clientId","type","title",to_char("dueAt" AT TIME ZONE $3,'HH24:MI') AS "time","dueAt","status"
         FROM "SpireClinicalTask"
         WHERE "organizationId"=$1 AND "clientId"=ANY($2::text[]) AND "status" IN ('OPEN','IN_PROGRESS')
           AND "dueAt" >= date_trunc('day', NOW() AT TIME ZONE $3) AT TIME ZONE $3
           AND "dueAt" < (date_trunc('day', NOW() AT TIME ZONE $3) + INTERVAL '1 day') AT TIME ZONE $3
         UNION ALL
         SELECT a."id",a."clientId",'Medication' AS "type",o."name" || ' ' || o."dose" AS "title",
                to_char(a."scheduledFor" AT TIME ZONE $3,'HH24:MI') AS "time",a."scheduledFor" AS "dueAt",a."status"
         FROM "SpireMedicationAdministration" a
         JOIN "SpireMedicationOrder" o ON o."id"=a."medicationOrderId"
         WHERE a."organizationId"=$1 AND a."clientId"=ANY($2::text[]) AND a."status" IN ('SCHEDULED','DUE')
           AND o."status"='ACTIVE'
           AND a."scheduledFor" >= date_trunc('day', NOW() AT TIME ZONE $3) AT TIME ZONE $3
           AND a."scheduledFor" < (date_trunc('day', NOW() AT TIME ZONE $3) + INTERVAL '1 day') AT TIME ZONE $3
         ORDER BY "dueAt"`,
        auth.organizationId, clientIds, process.env.SPIRE_TIME_ZONE || 'America/New_York',
      ) : [];
      res.json({ data: { homes, clients, tasks, permissions: {
        isAdmin: isAdministrator(auth), isNurse: nurseRoles.has(auth.role),
        canAdministerMedications: medicationAdministrationRoles.has(auth.role),
      } } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/clients/:clientId/chart', async (req, res, next) => {
    try {
      const auth = authOf(res); await requireClientAccess(prisma, auth, req.params.clientId);
      const profile = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireClientProfile" WHERE "organizationId"=$1 AND "clientId"=$2 AND "active"=TRUE LIMIT 1`,
        auth.organizationId, req.params.clientId,
      );
      const medications = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireMedicationOrder" WHERE "organizationId"=$1 AND "clientId"=$2 ORDER BY "createdAt" DESC`,
        auth.organizationId, req.params.clientId,
      );
      const notes = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","noteType","body","signedByUserId","signedAt" FROM "SpireClinicalNote" WHERE "organizationId"=$1 AND "clientId"=$2 ORDER BY "signedAt" DESC LIMIT 100`,
        auth.organizationId, req.params.clientId,
      );
      const vitals = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireVitalSign" WHERE "organizationId"=$1 AND "clientId"=$2 ORDER BY "recordedAt" DESC LIMIT 100`,
        auth.organizationId, req.params.clientId,
      );
      await clinicalAudit(prisma, auth, 'CHART_VIEWED', 'Client', req.params.clientId, req.params.clientId);
      res.json({ data: { profile: profile[0] || null, medications, notes, vitals } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/clients/:clientId/mar', async (req, res, next) => {
    try {
      const auth = authOf(res); await requireClientAccess(prisma, auth, req.params.clientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT a.*,o."name",o."dose",o."route",o."frequency",o."instructions",o."status" AS "orderStatus"
         FROM "SpireMedicationAdministration" a JOIN "SpireMedicationOrder" o ON o."id"=a."medicationOrderId"
         WHERE a."organizationId"=$1 AND a."clientId"=$2
           AND a."scheduledFor" >= NOW() - INTERVAL '24 hours'
           AND a."scheduledFor" < NOW() + INTERVAL '7 days'
         ORDER BY a."scheduledFor"`,
        auth.organizationId, req.params.clientId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/mar/actions', async (req, res, next) => {
    try {
      const auth = authOf(res);
      if (!medicationAdministrationRoles.has(auth.role) && !isAdministrator(auth)) throw Object.assign(new Error('Medication administration permission is required'), { status: 403 });
      const input = marActionSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT a.*,o."status" AS "orderStatus" FROM "SpireMedicationAdministration" a JOIN "SpireMedicationOrder" o ON o."id"=a."medicationOrderId"
         WHERE a."id"=$1 AND a."organizationId"=$2 LIMIT 1`, input.administrationId, auth.organizationId,
      );
      const prior = rows[0];
      if (!prior) throw Object.assign(new Error('MAR entry was not found'), { status: 404 });
      await requireClientAccess(prisma, auth, String(prior.clientId));
      if (prior.orderStatus !== 'ACTIVE' && input.status === 'GIVEN') throw Object.assign(new Error('Held or discontinued medication cannot be administered'), { status: 409 });
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireMedicationAdministration" SET "status"=$1,"resultNote"=$2,"administeredAt"=NOW(),"administeredByUserId"=$3,"updatedAt"=NOW() WHERE "id"=$4`,
        input.status, input.note ?? null, auth.userId, input.administrationId,
      );
      await clinicalAudit(prisma, auth, 'MAR_STATUS_RECORDED', 'SpireMedicationAdministration', input.administrationId, String(prior.clientId), prior, input);
      res.json({ data: { id: input.administrationId, ...input, administeredByUserId: auth.userId } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/notes', async (req, res, next) => {
    try {
      const auth = authOf(res); const input = noteSchema.parse(req.body); await requireClientAccess(prisma, auth, input.clientId);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireClinicalNote" ("id","organizationId","clientId","noteType","body","signedByUserId","signedAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
        id, auth.organizationId, input.clientId, input.noteType, input.body, auth.userId,
      );
      await clinicalAudit(prisma, auth, 'CLINICAL_NOTE_SIGNED', 'SpireClinicalNote', id, input.clientId, undefined, { noteType: input.noteType });
      res.status(201).json({ data: { id, ...input, signedByUserId: auth.userId } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/vitals', async (req, res, next) => {
    try {
      const auth = authOf(res); const input = vitalSchema.parse(req.body); await requireClientAccess(prisma, auth, input.clientId);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireVitalSign" ("id","organizationId","clientId","temperature","pulse","respirations","systolic","diastolic","spo2","weight","oxygen","recordedByUserId","recordedAt","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
        id, auth.organizationId, input.clientId, input.temperature ?? null, input.pulse ?? null,
        input.respirations ?? null, input.systolic ?? null, input.diastolic ?? null,
        input.spo2 ?? null, input.weight ?? null, input.oxygen ?? null, auth.userId,
      );
      await clinicalAudit(prisma, auth, 'VITALS_RECORDED', 'SpireVitalSign', id, input.clientId, undefined, input);
      res.status(201).json({ data: { id, ...input, recordedByUserId: auth.userId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/spire/medication-orders', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth); const input = medicationOrderSchema.parse(req.body);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireMedicationOrder" ("id","organizationId","clientId","name","dose","route","frequency","dueTimes","startDate","endDate","instructions","status","orderedByUserId","lastModifiedByUserId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'ACTIVE',$12,$12,NOW(),NOW())`,
        id, auth.organizationId, input.clientId, input.name, input.dose, input.route, input.frequency,
        JSON.stringify(input.dueTimes), input.startDate.toISOString().slice(0, 10),
        input.endDate?.toISOString().slice(0, 10) ?? null, input.instructions ?? null, auth.userId,
      );
      await generateMarOccurrences(prisma, { id, organizationId: auth.organizationId, clientId: input.clientId, startDate: input.startDate, endDate: input.endDate, dueTimes: input.dueTimes });
      await clinicalAudit(prisma, auth, 'MEDICATION_ORDER_CREATED', 'SpireMedicationOrder', id, input.clientId, undefined, input);
      res.status(201).json({ data: { id, ...input, status: 'ACTIVE' } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/clients/:clientId/medication-orders', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireMedicationOrder" WHERE "organizationId"=$1 AND "clientId"=$2 ORDER BY "createdAt" DESC`,
        auth.organizationId, req.params.clientId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/spire/medication-orders/:orderId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth); const input = medicationStatusSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireMedicationOrder" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.orderId,
      );
      const prior = rows[0]; if (!prior) throw Object.assign(new Error('Medication order was not found'), { status: 404 });
      const dueTimes = input.dueTimes ?? (Array.isArray(prior.dueTimes) ? prior.dueTimes.map(String) : []);
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireMedicationOrder" SET "status"=$1,"frequency"=COALESCE($2,"frequency"),"dueTimes"=COALESCE($3::jsonb,"dueTimes"),
          "holdReason"=CASE WHEN $1='HELD' THEN $4 ELSE NULL END,
          "discontinueReason"=CASE WHEN $1='DISCONTINUED' THEN $4 ELSE NULL END,
          "lastModifiedByUserId"=$5,"updatedAt"=NOW() WHERE "id"=$6`,
        input.status, input.frequency ?? null, input.dueTimes ? JSON.stringify(input.dueTimes) : null,
        input.reason ?? null, auth.userId, req.params.orderId,
      );
      if (input.status !== 'ACTIVE') {
        await prisma.$executeRawUnsafe(
          `UPDATE "SpireMedicationAdministration" SET "status"='HELD',"updatedAt"=NOW()
           WHERE "medicationOrderId"=$1 AND "scheduledFor">=NOW() AND "status" IN ('SCHEDULED','DUE')`, req.params.orderId,
        );
      } else if (input.dueTimes) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "SpireMedicationAdministration" WHERE "medicationOrderId"=$1 AND "scheduledFor">=NOW() AND "status" IN ('SCHEDULED','DUE','HELD')`, req.params.orderId,
        );
        await generateMarOccurrences(prisma, {
          id: req.params.orderId, organizationId: auth.organizationId, clientId: String(prior.clientId),
          startDate: new Date(String(prior.startDate)), endDate: prior.endDate ? new Date(String(prior.endDate)) : undefined, dueTimes,
        });
      }
      await clinicalAudit(prisma, auth, 'MEDICATION_ORDER_CHANGED', 'SpireMedicationOrder', req.params.orderId, String(prior.clientId), prior, input);
      res.json({ data: { id: req.params.orderId, ...input } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/spire/intake-imports', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth); const input = intakeSchema.parse(req.body); const id = randomUUID();
      const status = Object.keys(input.extractedData).length ? 'REVIEW_REQUIRED' : 'QUEUED';
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireIntakeImport" ("id","organizationId","clientId","fileName","mimeType","storageKey","status","extractionProvider","extractedData","submittedByUserId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,NOW(),NOW())`,
        id, auth.organizationId, input.clientId ?? null, input.fileName ?? null, input.mimeType ?? null,
        input.storageKey ?? null, status, input.extractionProvider ?? null, JSON.stringify(input.extractedData), auth.userId,
      );
      await clinicalAudit(prisma, auth, 'INTAKE_IMPORT_CREATED', 'SpireIntakeImport', id, input.clientId, undefined, { status, fileName: input.fileName });
      res.status(202).json({ data: { id, status, ...input } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/spire/intake-imports/:importId/review', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth); const input = intakeReviewSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireIntakeImport" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.importId,
      );
      const prior = rows[0]; if (!prior) throw Object.assign(new Error('Intake import was not found'), { status: 404 });
      const extracted = input.extractedData ?? jsonObject(prior.extractedData);
      const clientId = input.clientId ?? String(prior.clientId || extracted.clientId || randomUUID());
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "SpireIntakeImport" SET "status"=$1,"clientId"=$2,"extractedData"=$3::jsonb,"reviewNotes"=$4,"reviewedByUserId"=$5,"reviewedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$6`,
          input.status, clientId, JSON.stringify(extracted), input.reviewNotes ?? null, auth.userId, req.params.importId,
        );
        if (input.status === 'APPROVED') {
          const displayName = String(extracted.displayName || extracted.fullName || extracted.name || 'New Client');
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireClientProfile" ("id","organizationId","clientId","homeId","displayName","dateOfBirth","allergies","diagnoses","medicalHistory","emergencyContacts","guardians","providers","risks","diet","mobility","communication","behavioralSupports","sourceIntakeImportId","verifiedAt","verifiedByUserId","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,NOW(),$19,NOW(),NOW())
             ON CONFLICT ("organizationId","clientId") DO UPDATE SET
               "homeId"=EXCLUDED."homeId","displayName"=EXCLUDED."displayName","dateOfBirth"=EXCLUDED."dateOfBirth","allergies"=EXCLUDED."allergies",
               "diagnoses"=EXCLUDED."diagnoses","medicalHistory"=EXCLUDED."medicalHistory","emergencyContacts"=EXCLUDED."emergencyContacts",
               "guardians"=EXCLUDED."guardians","providers"=EXCLUDED."providers","risks"=EXCLUDED."risks","diet"=EXCLUDED."diet",
               "mobility"=EXCLUDED."mobility","communication"=EXCLUDED."communication","behavioralSupports"=EXCLUDED."behavioralSupports",
               "sourceIntakeImportId"=EXCLUDED."sourceIntakeImportId","verifiedAt"=NOW(),"verifiedByUserId"=EXCLUDED."verifiedByUserId","updatedAt"=NOW()`,
            randomUUID(), auth.organizationId, clientId, extracted.homeId ?? null, displayName,
            extracted.dateOfBirth ?? null, extracted.allergies ?? null,
            JSON.stringify(extracted.diagnoses ?? []), JSON.stringify(extracted.medicalHistory ?? {}),
            JSON.stringify(extracted.emergencyContacts ?? []), JSON.stringify(extracted.guardians ?? []),
            JSON.stringify(extracted.providers ?? []), JSON.stringify(extracted.risks ?? []),
            JSON.stringify(extracted.diet ?? {}), JSON.stringify(extracted.mobility ?? {}),
            JSON.stringify(extracted.communication ?? {}), JSON.stringify(extracted.behavioralSupports ?? {}),
            req.params.importId, auth.userId,
          );
        }
      });
      await clinicalAudit(prisma, auth, `INTAKE_IMPORT_${input.status}`, 'SpireIntakeImport', req.params.importId, clientId, prior, { ...input, extractedData: extracted });
      res.json({ data: { id: req.params.importId, clientId, ...input, extractedData: extracted } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/audit', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureAdministrator(auth);
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireClinicalAuditEvent" WHERE "organizationId"=$1 ORDER BY "createdAt" DESC LIMIT $2`,
        auth.organizationId, limit,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });
};
