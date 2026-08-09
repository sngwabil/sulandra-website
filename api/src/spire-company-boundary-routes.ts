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
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};

type Dependencies = {
  authOf: (response: express.Response) => AuthContext;
};

type PatientRow = Record<string, unknown> & {
  id: string;
};

const elevatedRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.CEO,
  UserRole.DOO,
]);

const assignmentManagerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);

const assignmentSchema = z.object({
  employeeId: z.string().trim().min(1),
  homeIds: z.array(z.string().trim().min(1)).max(500).default([]),
  clientIds: z.array(z.string().trim().min(1)).max(2_000).default([]),
});

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const selectedEntityId = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw httpError(409, 'Select a Sulandra company before opening SPIRE');
  return auth.legalEntityId;
};
const elevated = (auth: AuthContext) => auth.enterpriseOwner === true
  || elevatedRoles.has(auth.role)
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const canManageAssignments = (auth: AuthContext) => auth.enterpriseOwner === true
  || assignmentManagerRoles.has(auth.role)
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';

const patientDisplay = (row: Record<string, unknown>) => ({
  id: String(row.id),
  patientId: String(row.id),
  medicalRecordNumber: row.medicalRecordNumber ?? null,
  name: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' '),
  firstName: row.firstName,
  lastName: row.lastName,
  dateOfBirth: row.dateOfBirth ?? null,
  homeName: row.homeName ?? null,
  programName: row.programName ?? null,
  enrollmentStatus: row.enrollmentStatus ?? null,
  serviceType: row.serviceType ?? null,
  flags: row.flags ?? [],
  allergies: row.allergies ?? [],
  diagnoses: row.diagnoses ?? [],
});

async function enrollmentExists(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const entityId = selectedEntityId(auth);
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "ClientEnrollment" enrollment
       WHERE enrollment."organizationId"=$1 AND enrollment."legalEntityId"=$2
         AND enrollment."clientId"=$3 AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
     ) AS allowed`,
    auth.organizationId,
    entityId,
    patientId,
  );
  return rows[0]?.allowed === true;
}

async function staffAssignmentExists(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  if (elevated(auth)) return true;
  const entityId = selectedEntityId(auth);
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment" assignment
       WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$2
         AND assignment."userId"=$3 AND assignment."clientId"=$4
       UNION ALL
       SELECT 1
       FROM "SpirePatientHomeAssignment" patient_home
       JOIN "SpireEmployeeHomeAssignment" employee_home
         ON employee_home."organizationId"=patient_home."organizationId"
        AND employee_home."legalEntityId"=patient_home."legalEntityId"
        AND employee_home."homeId"=patient_home."homeId"
       WHERE patient_home."organizationId"=$1 AND patient_home."legalEntityId"=$2
         AND employee_home."userId"=$3 AND patient_home."patientId"=$4
         AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">NOW())
       UNION ALL
       SELECT 1 FROM "UserEntityAccessGrant" grant_row
       WHERE grant_row."organizationId"=$1 AND grant_row."userId"=$3
         AND grant_row."scopeType"='CLIENT' AND grant_row."legalEntityId"=$2
         AND grant_row."clientId"=$4 AND grant_row."active"=TRUE
         AND grant_row."effectiveFrom"<=NOW()
         AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">NOW())
     ) AS allowed`,
    auth.organizationId,
    entityId,
    auth.userId,
    patientId,
  );
  return rows[0]?.allowed === true;
}

async function requirePatientScope(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  if (!(await enrollmentExists(prisma, auth, patientId))) {
    throw httpError(403, 'This client is not enrolled with the selected Sulandra company');
  }
  if (!(await staffAssignmentExists(prisma, auth, patientId))) {
    throw httpError(403, 'This client is outside your assigned SPIRE care scope for the selected company');
  }
}

async function scopedPatients(prisma: PrismaClient, auth: AuthContext) {
  const entityId = selectedEntityId(auth);
  const rows = await prisma.$queryRawUnsafe<PatientRow[]>(
    `SELECT patient.*,
       enrollment."status" AS "enrollmentStatus",enrollment."serviceType",
       COALESCE(
         (SELECT COALESCE(service_home."name",patient_home."homeId")
          FROM "SpirePatientHomeAssignment" patient_home
          LEFT JOIN "ServiceHome" service_home
            ON service_home."organizationId"=patient_home."organizationId"
           AND service_home."legalEntityId"=patient_home."legalEntityId"
           AND service_home."id"=patient_home."homeId"
          WHERE patient_home."organizationId"=patient."organizationId"
            AND patient_home."legalEntityId"=$2 AND patient_home."patientId"=patient."id"
            AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">NOW())
          ORDER BY patient_home."primary" DESC,patient_home."startsAt" DESC LIMIT 1),
         NULL
       ) AS "homeName",
       enrollment."programCode" AS "programName",
       COALESCE((SELECT jsonb_agg(jsonb_build_object('label',flag."label",'severity',flag."severity"))
                 FROM "SpirePatientFlag" flag
                 WHERE flag."organizationId"=patient."organizationId" AND flag."patientId"=patient."id" AND flag."active"=TRUE),'[]'::jsonb) AS flags,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('substance',allergy."substance",'reaction',allergy."reaction",'severity',allergy."severity"))
                 FROM "SpirePatientAllergy" allergy
                 WHERE allergy."organizationId"=patient."organizationId" AND allergy."patientId"=patient."id" AND allergy."status"='ACTIVE'),'[]'::jsonb) AS allergies,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('display',diagnosis."display",'code',diagnosis."code"))
                 FROM "SpirePatientDiagnosis" diagnosis
                 WHERE diagnosis."organizationId"=patient."organizationId" AND diagnosis."patientId"=patient."id" AND diagnosis."status"='ACTIVE'),'[]'::jsonb) AS diagnoses
     FROM "SpirePatient" patient
     JOIN "ClientEnrollment" enrollment
       ON enrollment."organizationId"=patient."organizationId" AND enrollment."clientId"=patient."id"
      AND enrollment."legalEntityId"=$2 AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
     WHERE patient."organizationId"=$1 AND patient."active"=TRUE
     ORDER BY patient."lastName",patient."firstName"`,
    auth.organizationId,
    entityId,
  );
  if (elevated(auth)) return rows;
  const allowed: PatientRow[] = [];
  for (const row of rows) if (await staffAssignmentExists(prisma, auth, String(row.id))) allowed.push(row);
  return allowed;
}

async function scopedHomes(prisma: PrismaClient, auth: AuthContext) {
  const entityId = selectedEntityId(auth);
  const homes = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "id","name",COALESCE("streetAddress",'') ||
       CASE WHEN COALESCE("city",'')<>'' THEN ', ' || "city" ELSE '' END ||
       CASE WHEN COALESCE("state",'')<>'' THEN ', ' || "state" ELSE '' END AS "address"
     FROM "ServiceHome"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=TRUE
     ORDER BY "name"`,
    auth.organizationId,
    entityId,
  ).catch(() => []);
  if (homes.length) return homes;
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "id","name","address" FROM "SpireHome"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=TRUE ORDER BY "name"`,
    auth.organizationId,
    entityId,
  ).catch(() => []);
}

async function recordScopeAccess(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireChartAccessEvent"
       ("organizationId","legalEntityId","patientId","actorUserId","actorEmail","action","resourceType","resourceId","ipAddress","userAgent")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    auth.organizationId,
    selectedEntityId(auth),
    patientId,
    auth.userId,
    auth.email ?? null,
    action,
    resourceType,
    resourceId ?? null,
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  ).catch(() => undefined);
}

async function resolvePatientFromRequest(prisma: PrismaClient, auth: AuthContext, req: express.Request) {
  const original = req.originalUrl.split('?')[0] || '';
  const direct = original.match(/\/api\/(?:admin\/)?spire\/(?:patients|clients)\/([^/]+)/);
  if (direct?.[1]) return decodeURIComponent(direct[1]);
  const bodyId = typeof req.body?.patientId === 'string' ? req.body.patientId.trim()
    : typeof req.body?.clientId === 'string' ? req.body.clientId.trim()
      : '';
  if (bodyId) return bodyId;

  if (original === '/api/spire/mar/actions' && typeof req.body?.administrationId === 'string') {
    const rows = await prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
      `SELECT "clientId" FROM "SpireMedicationAdministration"
       WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      auth.organizationId,
      req.body.administrationId,
    );
    return rows[0]?.clientId || null;
  }

  const orderMatch = original.match(/\/api\/admin\/spire\/medication-orders\/([^/]+)/);
  if (orderMatch?.[1]) {
    const rows = await prisma.$queryRawUnsafe<Array<{ patientId: string | null; clientId: string | null }>>(
      `SELECT "patientId","clientId" FROM "SpireMedicationOrder"
       WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      auth.organizationId,
      decodeURIComponent(orderMatch[1]),
    );
    return rows[0]?.patientId || rows[0]?.clientId || null;
  }
  return null;
}

export const registerSpireCompanyBoundaryRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  dependencies: Dependencies,
) => {
  const { authOf } = dependencies;

  app.get('/api/spire/patients', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await scopedPatients(prisma, auth);
      res.json({ data: rows.map(patientDisplay) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/clients', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      if (!canManageAssignments(auth)) throw httpError(403, 'SPIRE administration access is required');
      const rows = await scopedPatients(prisma, auth);
      res.json({ data: rows.map(patientDisplay) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/homes', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      if (!canManageAssignments(auth)) throw httpError(403, 'SPIRE administration access is required');
      res.json({ data: await scopedHomes(prisma, auth) });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/workspace', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const [patientRows, allHomes] = await Promise.all([scopedPatients(prisma, auth), scopedHomes(prisma, auth)]);
      const clients = patientRows.map(patientDisplay);
      const clientIds = clients.map((client) => client.id);
      let homes = allHomes;
      if (!elevated(auth)) {
        const rows = await prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
          `SELECT "homeId" FROM "SpireEmployeeHomeAssignment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId,
          selectedEntityId(auth),
          auth.userId,
        );
        const allowedHomeIds = new Set(rows.map((row) => row.homeId));
        homes = allHomes.filter((home) => allowedHomeIds.has(String(home.id)));
      }
      const tasks = clientIds.length ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT task."id",task."clientId",task."type",task."title",
                to_char(task."dueAt" AT TIME ZONE $4,'HH24:MI') AS "time",task."dueAt",task."status"
         FROM "SpireClinicalTask" task
         WHERE task."organizationId"=$1 AND task."legalEntityId"=$2
           AND task."clientId"=ANY($3::text[]) AND task."status" IN ('OPEN','IN_PROGRESS')
           AND task."dueAt">=date_trunc('day',NOW() AT TIME ZONE $4) AT TIME ZONE $4
           AND task."dueAt"<(date_trunc('day',NOW() AT TIME ZONE $4)+INTERVAL '1 day') AT TIME ZONE $4
         UNION ALL
         SELECT administration."id",administration."clientId",'Medication',medication."name" || ' ' || medication."dose",
                to_char(administration."scheduledFor" AT TIME ZONE $4,'HH24:MI'),administration."scheduledFor",administration."status"
         FROM "SpireMedicationAdministration" administration
         JOIN "SpireMedicationOrder" medication ON medication."id"=administration."medicationOrderId"
         WHERE administration."organizationId"=$1 AND administration."legalEntityId"=$2
           AND administration."clientId"=ANY($3::text[]) AND administration."status" IN ('SCHEDULED','DUE')
           AND medication."status"='ACTIVE'
           AND administration."scheduledFor">=date_trunc('day',NOW() AT TIME ZONE $4) AT TIME ZONE $4
           AND administration."scheduledFor"<(date_trunc('day',NOW() AT TIME ZONE $4)+INTERVAL '1 day') AT TIME ZONE $4
         ORDER BY "dueAt"`,
        auth.organizationId,
        selectedEntityId(auth),
        clientIds,
        process.env.SPIRE_TIME_ZONE || 'America/New_York',
      ).catch(() => []) : [];
      res.json({
        data: {
          homes,
          clients,
          tasks,
          company: { legalEntityId: selectedEntityId(auth) },
          permissions: {
            isAdmin: canManageAssignments(auth),
            canAdministerMedications: auth.role !== UserRole.AUDITOR,
          },
        },
      });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/schedule', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const patientRows = await scopedPatients(prisma, auth);
      const patientIds = patientRows.map((row) => String(row.id));
      if (!patientIds.length) return void res.json({ data: [] });
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT appointment."id",appointment."patientId",appointment."startsAt",appointment."endsAt",appointment."status",
                appointment."appointmentType",appointment."locationId",appointment."providerUserId",
                patient."firstName",patient."preferredName",patient."lastName"
         FROM "SpireAppointment" appointment
         JOIN "SpirePatient" patient ON patient."id"=appointment."patientId" AND patient."organizationId"=appointment."organizationId"
         WHERE appointment."organizationId"=$1 AND appointment."legalEntityId"=$2
           AND appointment."patientId"=ANY($3::text[])
           AND appointment."startsAt">=date_trunc('day',NOW())
           AND appointment."startsAt"<date_trunc('day',NOW())+INTERVAL '1 day'
         ORDER BY appointment."startsAt"`,
        auth.organizationId,
        selectedEntityId(auth),
        patientIds,
      );
      res.json({ data: rows.map((row) => ({
        id: row.id,
        patientId: row.patientId,
        patientName: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' '),
        time: new Date(String(row.startsAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        status: row.status,
        type: row.appointmentType,
        provider: row.providerUserId,
        location: row.locationId,
      })) });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/inbasket', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT item.*,patient."firstName",patient."preferredName",patient."lastName"
         FROM "SpireInBasketItem" item
         LEFT JOIN "SpirePatient" patient ON patient."id"=item."patientId" AND patient."organizationId"=item."organizationId"
         WHERE item."organizationId"=$1 AND item."legalEntityId"=$2
           AND item."assignedToUserId"=$3 AND item."status"<>'DONE'
           AND (item."patientId" IS NULL OR EXISTS(
             SELECT 1 FROM "ClientEnrollment" enrollment
             WHERE enrollment."organizationId"=item."organizationId" AND enrollment."legalEntityId"=$2
               AND enrollment."clientId"=item."patientId" AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
           ))
         ORDER BY CASE item."priority" WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,item."createdAt" DESC
         LIMIT 250`,
        auth.organizationId,
        selectedEntityId(auth),
        auth.userId,
      );
      const allowed = [];
      for (const row of rows) {
        if (!row.patientId || elevated(auth) || await staffAssignmentExists(prisma, auth, String(row.patientId))) {
          allowed.push({ ...row, patientName: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' ') });
        }
      }
      res.json({ data: allowed });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/assignments/:employeeId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      if (!canManageAssignments(auth)) throw httpError(403, 'SPIRE assignment management access is required');
      const entityId = selectedEntityId(auth);
      const [homeRows, clientRows] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
          `SELECT "homeId" FROM "SpireEmployeeHomeAssignment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId, entityId, req.params.employeeId,
        ),
        prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
          `SELECT "clientId" FROM "SpireEmployeeClientAssignment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId, entityId, req.params.employeeId,
        ),
      ]);
      res.json({ data: {
        employeeId: req.params.employeeId,
        legalEntityId: entityId,
        homeIds: homeRows.map((row) => row.homeId),
        clientIds: clientRows.map((row) => row.clientId),
      } });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/spire/assignments', async (req, res, next) => {
    try {
      const auth = authOf(res);
      if (!canManageAssignments(auth)) throw httpError(403, 'SPIRE assignment management access is required');
      const entityId = selectedEntityId(auth);
      const input = assignmentSchema.parse(req.body);
      const employee = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "Employment"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3
           AND "status" IN ('ACTIVE','LEAVE') AND "startsAt"<=CURRENT_DATE
           AND ("endsAt" IS NULL OR "endsAt">=CURRENT_DATE) LIMIT 1`,
        auth.organizationId, entityId, input.employeeId,
      );
      if (!employee[0]) throw httpError(409, 'The employee is not active in the selected company');

      if (input.clientIds.length) {
        const rows = await prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
          `SELECT "clientId" FROM "ClientEnrollment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2
             AND "clientId"=ANY($3::text[]) AND "status" IN ('PENDING','ACTIVE','PAUSED')`,
          auth.organizationId, entityId, [...new Set(input.clientIds)],
        );
        const valid = new Set(rows.map((row) => row.clientId));
        const invalid = [...new Set(input.clientIds)].filter((id) => !valid.has(id));
        if (invalid.length) throw httpError(409, 'One or more clients are not enrolled with the selected company');
      }

      if (input.homeIds.length) {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "ServiceHome"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=ANY($3::text[]) AND "active"=TRUE
           UNION
           SELECT "id" FROM "SpireHome"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=ANY($3::text[]) AND "active"=TRUE`,
          auth.organizationId, entityId, [...new Set(input.homeIds)],
        ).catch(() => []);
        const valid = new Set(rows.map((row) => row.id));
        const invalid = [...new Set(input.homeIds)].filter((id) => !valid.has(id));
        if (invalid.length) throw httpError(409, 'One or more homes do not belong to the selected company');
      }

      const [priorHomes, priorClients] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
          `SELECT "homeId" FROM "SpireEmployeeHomeAssignment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId, entityId, input.employeeId,
        ),
        prisma.$queryRawUnsafe<Array<{ clientId: string }>>(
          `SELECT "clientId" FROM "SpireEmployeeClientAssignment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId, entityId, input.employeeId,
        ),
      ]);

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId, entityId, input.employeeId,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireEmployeeClientAssignment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3`,
          auth.organizationId, entityId, input.employeeId,
        );
        for (const homeId of [...new Set(input.homeIds)]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireEmployeeHomeAssignment"
               ("id","organizationId","legalEntityId","userId","homeId","assignedByUserId","createdAt")
             VALUES($1,$2,$3,$4,$5,$6,NOW())`,
            randomUUID(), auth.organizationId, entityId, input.employeeId, homeId, auth.userId,
          );
        }
        for (const clientId of [...new Set(input.clientIds)]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireEmployeeClientAssignment"
               ("id","organizationId","legalEntityId","userId","clientId","assignedByUserId","createdAt")
             VALUES($1,$2,$3,$4,$5,$6,NOW())`,
            randomUUID(), auth.organizationId, entityId, input.employeeId, clientId, auth.userId,
          );
        }
      });

      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireClinicalAuditEvent"
           ("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","beforeValue","afterValue","ipAddress","userAgent","createdAt")
         VALUES($1,$2,$3,$4,$5,NULL,'ACCESS_ASSIGNMENTS_REPLACED','User',$6,$7::jsonb,$8::jsonb,$9,$10,NOW())`,
        randomUUID(), auth.organizationId, entityId, auth.userId, auth.email ?? null, input.employeeId,
        JSON.stringify({ homeIds: priorHomes.map((row) => row.homeId), clientIds: priorClients.map((row) => row.clientId) }),
        JSON.stringify({ homeIds: input.homeIds, clientIds: input.clientIds }),
        auth.ipAddress ?? null, auth.userAgent ?? null,
      ).catch(() => undefined);
      res.json({ data: { ...input, legalEntityId: entityId } });
    } catch (error) { next(error); }
  });

  app.use(['/api/spire', '/api/admin/spire'], async (req, res, next) => {
    try {
      const auth = authOf(res);
      selectedEntityId(auth);
      const patientId = await resolvePatientFromRequest(prisma, auth, req);
      if (patientId) {
        await requirePatientScope(prisma, auth, patientId);
        await recordScopeAccess(prisma, auth, patientId, 'COMPANY_SCOPE_AUTHORIZED', 'COMPANY_SCOPE', req.originalUrl.split('?')[0]);
      }
      next();
    } catch (error) { next(error); }
  });
};
