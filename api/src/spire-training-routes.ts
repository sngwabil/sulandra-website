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
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};
type Dependencies = { authOf: (response: express.Response) => AuthContext };

type TrainingScenario = {
  scenarioCode: string;
  scenarioType: 'SCLS' | 'HOME_HEALTH' | 'NMT' | 'GENERAL';
  displayName: string;
  dateOfBirth: string | null;
  description: string;
  seedData: Record<string, unknown>;
};

const managerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);
const entryTypes = ['VITALS','FLOWSHEET','PROGRESS_NOTE','MAR','ASSESSMENT','INCIDENT','TASK','ORDER','TRANSPORT','COMMUNICATION','OTHER'] as const;
const chartEntrySchema = z.object({
  entryType: z.enum(entryTypes),
  payload: z.record(z.unknown()).default({}),
});
const customCaseSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  dateOfBirth: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().min(10).max(6_000),
  seedData: z.record(z.unknown()).default({}),
});
const assignmentSchema = z.object({
  userId: z.string().trim().min(1),
  active: z.boolean().default(true),
});

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const selectedEntityId = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw httpError(409, 'Select a Sulandra company before opening SPIRE Training');
  return auth.legalEntityId;
};
const owner = (auth: AuthContext) => auth.enterpriseOwner === true
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const manager = (auth: AuthContext) => owner(auth) || managerRoles.has(auth.role);

const scenarioCatalog: Record<string, TrainingScenario[]> = {
  SCLS: [
    {
      scenarioCode: 'SCLS-TRAIN-001', scenarioType: 'SCLS', displayName: 'TRAINING — James Carter', dateOfBirth: '1992-04-18',
      description: 'Adult shared-living practice case focused on seizure precautions, dysphagia supports, scheduled medications, daily weights, temperature checks, ISP goals and shift documentation.',
      seedData: {
        banner: 'TRAINING CHART — NOT A REAL CLIENT — DO NOT BILL',
        allergies: ['Penicillin — rash'], diagnoses: ['Cerebral palsy', 'Seizure disorder', 'Dysphagia'],
        risks: ['Seizure precautions', 'Aspiration precautions', 'Fall risk'], diet: 'Mechanical soft; nectar-thick liquids',
        mobility: 'Wheelchair for distance; one-person assist for transfers', communication: 'Verbal; allow extra response time',
        medications: [
          { name: 'Levetiracetam', dose: '500 mg', route: 'PO', schedule: ['08:00','20:00'] },
          { name: 'Baclofen', dose: '10 mg', route: 'PO', schedule: ['08:00','14:00','20:00'] },
        ],
        flowsheet: ['Weight', 'Temperature', 'Seizure activity', 'Bowel movement', 'Meal intake', 'Fluid intake', 'ISP goal progress'],
        expectedTasks: ['Complete morning medication pass', 'Record weight', 'Document breakfast intake', 'Complete person-centered progress note'],
      },
    },
    {
      scenarioCode: 'SCLS-TRAIN-002', scenarioType: 'SCLS', displayName: 'TRAINING — Maria Lewis', dateOfBirth: '1987-09-03',
      description: 'Community-living practice case focused on diabetes supports, behavior support implementation, client rights, choice, community integration and incident decision-making.',
      seedData: {
        banner: 'TRAINING CHART — NOT A REAL CLIENT — DO NOT BILL',
        allergies: ['No known drug allergies'], diagnoses: ['Type 2 diabetes', 'Mild intellectual disability', 'Anxiety'],
        risks: ['Hypoglycemia', 'Elopement when anxious'], communication: 'Speaks independently; prefers written choices for schedule changes',
        medications: [{ name: 'Metformin', dose: '500 mg', route: 'PO', schedule: ['08:00','18:00'] }],
        flowsheet: ['Blood glucose', 'Meal intake', 'Mood/behavior', 'Community activity', 'ISP goal progress'],
        expectedTasks: ['Offer meaningful activity choices', 'Record pre-breakfast glucose', 'Document behavior supports used', 'Complete progress note'],
      },
    },
  ],
  HOME_HEALTH: [
    {
      scenarioCode: 'HH-TRAIN-001', scenarioType: 'HOME_HEALTH', displayName: 'TRAINING — Helen Brooks', dateOfBirth: '1948-01-22',
      description: 'Home-health nursing practice case after hospital discharge for CHF exacerbation, emphasizing medication reconciliation, cardiopulmonary assessment, daily weights, edema, education and physician notification thresholds.',
      seedData: {
        banner: 'TRAINING CHART — NOT A REAL PATIENT — DO NOT BILL',
        diagnoses: ['Congestive heart failure', 'Hypertension', 'Chronic kidney disease stage 3'],
        allergies: ['Sulfa antibiotics — hives'],
        hospitalOrders: ['Daily weight', 'Low sodium diet', 'Call provider for weight gain >2 lb/day or >5 lb/week', 'Skilled nursing twice weekly'],
        medications: [
          { name: 'Furosemide', dose: '40 mg', route: 'PO', schedule: ['08:00'] },
          { name: 'Metoprolol succinate', dose: '50 mg', route: 'PO', schedule: ['08:00'] },
        ],
        flowsheet: ['Weight', 'Blood pressure', 'Pulse', 'Respirations', 'SpO2', 'Edema', 'Lung sounds', 'Dyspnea'],
        expectedTasks: ['Complete start-of-care assessment', 'Reconcile discharge medications', 'Record weight and cardiopulmonary findings', 'Document patient education'],
      },
    },
    {
      scenarioCode: 'HH-TRAIN-002', scenarioType: 'HOME_HEALTH', displayName: 'TRAINING — Samuel Reed', dateOfBirth: '1961-06-11',
      description: 'Skilled home-health wound-care practice case with diabetes, surgical wound assessment, pain evaluation, infection monitoring and supply documentation.',
      seedData: {
        banner: 'TRAINING CHART — NOT A REAL PATIENT — DO NOT BILL',
        diagnoses: ['Type 2 diabetes', 'Post-operative lower-extremity wound'],
        flowsheet: ['Temperature', 'Pain score', 'Wound length', 'Wound width', 'Wound depth', 'Drainage', 'Periwound skin', 'Blood glucose'],
        expectedTasks: ['Assess wound', 'Perform ordered wound care', 'Document supplies used', 'Escalate signs of infection'],
      },
    },
  ],
  NMT: [
    {
      scenarioCode: 'NMT-TRAIN-001', scenarioType: 'NMT', displayName: 'TRAINING — Robert Miles', dateOfBirth: '1955-12-07',
      description: 'Non-medical transportation practice case for a wheelchair rider attending dialysis with oxygen, pickup-window verification, securement checklist, trip status documentation and safe handoff.',
      seedData: {
        banner: 'TRAINING RIDER — NOT A REAL CLIENT — DO NOT BILL',
        mobility: 'Wheelchair; requires lift and four-point securement', oxygen: 'Portable oxygen 2 L/min via nasal cannula',
        trip: { pickupWindow: '06:15-06:30', appointmentTime: '07:00', returnWillCall: true, destinationType: 'Dialysis center' },
        safetyChecklist: ['Identity verified', 'Wheelchair securement', 'Seat belt', 'Oxygen secured upright', 'Personal items accounted for'],
        expectedTasks: ['Accept trip', 'Record arrival', 'Complete securement checklist', 'Record pickup/dropoff signatures', 'Close trip'],
      },
    },
    {
      scenarioCode: 'NMT-TRAIN-002', scenarioType: 'NMT', displayName: 'TRAINING — Evelyn Price', dateOfBirth: '1942-03-16',
      description: 'Ambulatory transportation practice case focused on fall risk, curb-to-curb assistance, appointment timing, no-show workflow and incident escalation.',
      seedData: {
        banner: 'TRAINING RIDER — NOT A REAL CLIENT — DO NOT BILL',
        mobility: 'Ambulates with rolling walker; standby assistance', risks: ['Fall risk'],
        trip: { pickupWindow: '10:10-10:25', appointmentTime: '11:00', destinationType: 'Primary care clinic' },
        expectedTasks: ['Verify rider', 'Assist safely to vehicle', 'Document pickup/dropoff', 'Practice no-show and incident workflow'],
      },
    },
  ],
  SULANDRA_HEALTH: [
    {
      scenarioCode: 'SH-TRAIN-001', scenarioType: 'GENERAL', displayName: 'TRAINING — Enterprise Practice Case', dateOfBirth: null,
      description: 'Enterprise training case for privacy, documentation standards, escalation, record access, cross-company routing and compliance exercises.',
      seedData: {
        banner: 'TRAINING RECORD — NOT A REAL CLIENT OR PATIENT — DO NOT BILL',
        expectedTasks: ['Identify correct company', 'Apply minimum-necessary access', 'Route documentation correctly', 'Complete audit/compliance exercise'],
      },
    },
  ],
};

async function entityCode(prisma: PrismaClient, auth: AuthContext) {
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    auth.organizationId, selectedEntityId(auth),
  );
  if (!rows[0]) throw httpError(404, 'Selected company was not found');
  return rows[0].code;
}

async function seedDefaultCases(prisma: PrismaClient, auth: AuthContext) {
  const entityId = selectedEntityId(auth);
  const code = await entityCode(prisma, auth);
  const scenarios = scenarioCatalog[code] || scenarioCatalog.SULANDRA_HEALTH;
  for (const scenario of scenarios) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireTrainingCase"
         ("id","organizationId","legalEntityId","scenarioCode","scenarioType","displayName","dateOfBirth","description","seedData","status","createdById")
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'ACTIVE',$10
       WHERE NOT EXISTS(
         SELECT 1 FROM "SpireTrainingCase"
         WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "scenarioCode"=$4 AND "status"='ACTIVE'
       )`,
      randomUUID(), auth.organizationId, entityId, scenario.scenarioCode, scenario.scenarioType,
      scenario.displayName, scenario.dateOfBirth, scenario.description, JSON.stringify(scenario.seedData), auth.userId,
    );
  }
}

async function trainingCase(prisma: PrismaClient, auth: AuthContext, caseId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireTrainingCase"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 AND "status"='ACTIVE' LIMIT 1`,
    auth.organizationId, selectedEntityId(auth), caseId,
  );
  if (!rows[0]) throw httpError(404, 'Training case was not found in the selected company');
  return rows[0];
}

async function caseAccess(prisma: PrismaClient, auth: AuthContext, caseId: string) {
  const row = await trainingCase(prisma, auth, caseId);
  if (manager(auth)) return row;
  const assignments = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireTrainingAssignment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "caseId"=$3 AND "userId"=$4 AND "active"=TRUE
     ) AS allowed`,
    auth.organizationId, selectedEntityId(auth), caseId, auth.userId,
  );
  if (assignments[0]?.allowed !== true) throw httpError(403, 'This practice case is not assigned to you');
  return row;
}

async function trainingEvent(prisma: PrismaClient, auth: AuthContext, eventType: string, caseId: string | null, details: Record<string, unknown>) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireTrainingEvent" ("id","organizationId","legalEntityId","caseId","actorUserId","eventType","details")
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    randomUUID(), auth.organizationId, selectedEntityId(auth), caseId, auth.userId, eventType, JSON.stringify(details),
  );
}

export const registerSpireTrainingRoutes = (app: express.Express, prisma: PrismaClient, dependencies: Dependencies) => {
  const { authOf } = dependencies;

  app.get('/api/admin/spire/training/cases', async (_req, res, next) => {
    try {
      const auth = authOf(res); if (!manager(auth)) throw httpError(403, 'Training administration access is required');
      await seedDefaultCases(prisma, auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT training_case.*,
           (SELECT count(*)::int FROM "SpireTrainingAssignment" assignment
            WHERE assignment."organizationId"=training_case."organizationId" AND assignment."legalEntityId"=training_case."legalEntityId"
              AND assignment."caseId"=training_case."id" AND assignment."active"=TRUE) AS "assignedEmployees",
           (SELECT count(*)::int FROM "SpireTrainingChartEntry" entry
            WHERE entry."organizationId"=training_case."organizationId" AND entry."legalEntityId"=training_case."legalEntityId"
              AND entry."caseId"=training_case."id" AND entry."status"='RECORDED') AS "practiceEntries"
         FROM "SpireTrainingCase" training_case
         WHERE training_case."organizationId"=$1 AND training_case."legalEntityId"=$2 AND training_case."status"='ACTIVE'
         ORDER BY training_case."scenarioCode",training_case."displayName"`,
        auth.organizationId, selectedEntityId(auth),
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/spire/training/cases', async (req, res, next) => {
    try {
      const auth = authOf(res); if (!manager(auth)) throw httpError(403, 'Training administration access is required');
      const input = customCaseSchema.parse(req.body); const code = await entityCode(prisma, auth);
      const id = randomUUID(); const scenarioCode = `${code}-CUSTOM-${Date.now().toString(36).toUpperCase()}`;
      const type: TrainingScenario['scenarioType'] = code === 'SCLS' ? 'SCLS' : code === 'HOME_HEALTH' ? 'HOME_HEALTH' : code === 'NMT' ? 'NMT' : 'GENERAL';
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireTrainingCase"
           ("id","organizationId","legalEntityId","scenarioCode","scenarioType","displayName","dateOfBirth","description","seedData","status","createdById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'ACTIVE',$10) RETURNING *`,
        id, auth.organizationId, selectedEntityId(auth), scenarioCode, type,
        `TRAINING — ${input.displayName.replace(/^TRAINING\s*[—-]\s*/i, '')}`, input.dateOfBirth || null,
        input.description, JSON.stringify({ banner: 'TRAINING CHART — NOT A REAL CLIENT/PATIENT — DO NOT BILL', ...input.seedData }), auth.userId,
      );
      await trainingEvent(prisma, auth, 'TRAINING_CASE_CREATED', id, { scenarioCode });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/training/cases', async (_req, res, next) => {
    try {
      const auth = authOf(res); const entityId = selectedEntityId(auth);
      const rows = manager(auth)
        ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireTrainingCase" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "status"='ACTIVE' ORDER BY "displayName"`,
          auth.organizationId, entityId,
        )
        : await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT training_case.* FROM "SpireTrainingAssignment" assignment
           JOIN "SpireTrainingCase" training_case ON training_case."id"=assignment."caseId"
           WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$2 AND assignment."userId"=$3
             AND assignment."active"=TRUE AND training_case."status"='ACTIVE' ORDER BY training_case."displayName"`,
          auth.organizationId, entityId, auth.userId,
        );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/training/cases/:caseId', async (req, res, next) => {
    try {
      const auth = authOf(res); const row = await caseAccess(prisma, auth, req.params.caseId);
      const entries = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireTrainingChartEntry"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "caseId"=$3 AND "status"='RECORDED'
         ORDER BY "createdAt" DESC LIMIT 500`,
        auth.organizationId, selectedEntityId(auth), req.params.caseId,
      );
      res.json({ data: { case: row, entries, trainingOnly: true, billable: false } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/training/cases/:caseId/entries', async (req, res, next) => {
    try {
      const auth = authOf(res); await caseAccess(prisma, auth, req.params.caseId); const input = chartEntrySchema.parse(req.body);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireTrainingChartEntry" ("id","organizationId","legalEntityId","caseId","userId","entryType","payload","status")
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'RECORDED')`,
        id, auth.organizationId, selectedEntityId(auth), req.params.caseId, auth.userId, input.entryType, JSON.stringify(input.payload),
      );
      await trainingEvent(prisma, auth, 'TRAINING_CHART_ENTRY_RECORDED', req.params.caseId, { entryType: input.entryType, entryId: id });
      res.status(201).json({ data: { id, ...input, trainingOnly: true, billable: false } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/spire/training/cases/:caseId/assignments', async (req, res, next) => {
    try {
      const auth = authOf(res); if (!manager(auth)) throw httpError(403, 'Training administration access is required');
      await trainingCase(prisma, auth, req.params.caseId); const input = assignmentSchema.parse(req.body);
      const employment = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "Employment"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3
           AND "status" IN ('ACTIVE','LEAVE') AND "startsAt"<=CURRENT_DATE
           AND ("endsAt" IS NULL OR "endsAt">=CURRENT_DATE) LIMIT 1`,
        auth.organizationId, selectedEntityId(auth), input.userId,
      );
      if (!employment[0]) throw httpError(409, 'The employee is not active in the selected company');
      if (input.active) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SpireTrainingAssignment" ("id","organizationId","legalEntityId","caseId","userId","assignedById","active")
           VALUES($1,$2,$3,$4,$5,$6,TRUE)
           ON CONFLICT ("organizationId","legalEntityId","caseId","userId") WHERE "active"=TRUE DO NOTHING`,
          randomUUID(), auth.organizationId, selectedEntityId(auth), req.params.caseId, input.userId, auth.userId,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE "SpireTrainingAssignment" SET "active"=FALSE,"completedAt"=NOW()
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "caseId"=$3 AND "userId"=$4 AND "active"=TRUE`,
          auth.organizationId, selectedEntityId(auth), req.params.caseId, input.userId,
        );
      }
      await trainingEvent(prisma, auth, input.active ? 'TRAINING_CASE_ASSIGNED' : 'TRAINING_CASE_UNASSIGNED', req.params.caseId, { userId: input.userId });
      res.json({ data: { caseId: req.params.caseId, userId: input.userId, active: input.active } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/spire/training/cases/:caseId/reset', async (req, res, next) => {
    try {
      const auth = authOf(res); if (!manager(auth)) throw httpError(403, 'Training administration access is required');
      await trainingCase(prisma, auth, req.params.caseId);
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      const deleted = userId
        ? await prisma.$executeRawUnsafe(
          `DELETE FROM "SpireTrainingChartEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "caseId"=$3 AND "userId"=$4`,
          auth.organizationId, selectedEntityId(auth), req.params.caseId, userId,
        )
        : await prisma.$executeRawUnsafe(
          `DELETE FROM "SpireTrainingChartEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "caseId"=$3`,
          auth.organizationId, selectedEntityId(auth), req.params.caseId,
        );
      await trainingEvent(prisma, auth, 'TRAINING_CASE_RESET', req.params.caseId, { userId: userId || null, deletedEntries: deleted });
      res.json({ data: { caseId: req.params.caseId, userId: userId || null, deletedEntries: deleted } });
    } catch (error) { next(error); }
  });
};
