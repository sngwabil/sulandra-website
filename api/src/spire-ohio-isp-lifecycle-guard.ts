import type express from 'express';
import type { PrismaClient } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  email?: string;
  legalEntityId?: string;
};
type Dependencies = { authOf: (response: express.Response) => AuthContext };

const requiredDomains = [
  'COMMUNICATION',
  'ADVOCACY_ENGAGEMENT',
  'SAFETY_SECURITY',
  'SOCIAL_SPIRITUALITY',
  'DAILY_LIFE_EMPLOYMENT',
  'COMMUNITY_LIVING',
  'HEALTHY_LIVING',
] as const;
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

async function ohioIspActivationReadiness(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  carePlanId: string,
) {
  if (!auth.legalEntityId) return null;
  const profiles = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT p.* FROM "SpireOhioIspPlan" p
      JOIN "LegalEntity" e ON e."organizationId"=p."organizationId" AND e."id"=p."legalEntityId"
     WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND p."patientId"=$3 AND p."carePlanId"=$4
       AND e."code"='SCLS' LIMIT 1`,
    auth.organizationId, auth.legalEntityId, patientId, carePlanId,
  );
  const profile = profiles[0];
  if (!profile) return null;
  const planId = String(profile.id);
  const [domains, outcomes, missingSupport, incompleteSupports] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ domainCode: string; status: string }>>(
      `SELECT "domainCode","status" FROM "SpireOhioIspAssessmentDomain" WHERE "ohioIspPlanId"=$1`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM "SpireOhioIspOutcome" WHERE "ohioIspPlanId"=$1 AND "status"<>'DISCONTINUED'`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ title: string }>>(
      `SELECT o."title" FROM "SpireOhioIspOutcome" o
       WHERE o."ohioIspPlanId"=$1 AND o."status"='IN_PROGRESS'
         AND NOT EXISTS(SELECT 1 FROM "SpireOhioIspSupport" s WHERE s."outcomeId"=o."id" AND s."status"='ACTIVE')`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ title: string }>>(
      `SELECT "title" FROM "SpireOhioIspSupport"
       WHERE "ohioIspPlanId"=$1 AND "status"='ACTIVE' AND (
         NULLIF(BTRIM(COALESCE("providerName",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("fundingSource",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("frequency",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("scope",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("instructions",'')),'') IS NULL
       )`, planId,
    ),
  ]);
  const blockers: string[] = [];
  const fields: Array<[string, string]> = [
    ['sourcePlanId', 'Record the OhioISP/source plan identifier'],
    ['sourcePlanVersion', 'Record the OhioISP/source plan version'],
    ['importantTo', 'Document what is important TO the person'],
    ['importantFor', 'Document what is important FOR the person'],
    ['knownRisks', 'Document known or likely risks'],
    ['skillsAndAbilities', 'Document skills and abilities'],
  ];
  for (const [field, message] of fields) if (!hasText(profile[field])) blockers.push(message);
  if (!profile.effectiveStartDate) blockers.push('Set the OhioISP effective start date');
  if (!profile.effectiveEndDate) blockers.push('Set the OhioISP effective end date');
  const completeDomains = new Set(
    domains.filter((d) => ['COMPLETE', 'NOT_APPLICABLE'].includes(d.status)).map((d) => d.domainCode),
  );
  for (const code of requiredDomains) {
    if (!completeDomains.has(code)) blockers.push(`Complete the ${code.toLowerCase().replaceAll('_', ' ')} assessment domain`);
  }
  if (Number(outcomes[0]?.count || 0) < 1) blockers.push('Add at least one OhioISP outcome');
  for (const row of missingSupport) blockers.push(`Add an active support for outcome: ${row.title}`);
  for (const row of incompleteSupports) blockers.push(`Complete provider, funding source, frequency, scope and instructions for support: ${row.title}`);
  return { ohioIspPlanId: planId, blockers, ready: blockers.length === 0 };
}

export const registerSpireOhioIspLifecycleGuard = (
  app: express.Express,
  prisma: PrismaClient,
  dependencies: Dependencies,
) => {
  const { authOf } = dependencies;
  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/lifecycle', async (req, _res, next) => {
    try {
      if (String(req.body?.action || '') !== 'ACTIVATE') return void next();
      const auth = authOf(_res);
      const info = await ohioIspActivationReadiness(prisma, auth, req.params.patientId, req.params.carePlanId);
      if (!info) return void next();
      if (!info.ready) throw httpError(409, 'The OhioISP is not ready for activation', info);
      next();
    } catch (error) { next(error); }
  });
};
