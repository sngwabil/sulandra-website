import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { evaluateSpireEvvPrebill, recordSpireEvvPrebillDecision } from './spire-evv-prebill.js';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};
type Dependencies = { authOf: (response: express.Response) => AuthContext };

const readRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.BILLING_SPECIALIST,
  UserRole.AUDITOR, UserRole.CEO, UserRole.DOO,
]);
const writeRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.BILLING_SPECIALIST,
  UserRole.CEO, UserRole.DOO,
]);
const owner = (auth: AuthContext) => auth.enterpriseOwner === true
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const entity = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw httpError(409, 'Select a Sulandra company before EVV billing validation');
  return auth.legalEntityId;
};
const ensureRead = (auth: AuthContext) => {
  entity(auth);
  if (!readRoles.has(auth.role) && !owner(auth)) throw httpError(403, 'Revenue Cycle EVV validation access is required');
};
const ensureWrite = (auth: AuthContext) => {
  ensureRead(auth);
  if (!writeRoles.has(auth.role) && !owner(auth)) throw httpError(403, 'Revenue Cycle EVV validation write access is required');
};
const clean = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);

async function revenueEvent(prisma: PrismaClient, auth: AuthContext, id: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "RevenueCycleServiceEvent"
      WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
    auth.organizationId, entity(auth), id,
  );
  if (!rows[0]) throw httpError(404, 'Revenue service event was not found');
  return rows[0];
}

export const registerSpireEvvRevenueGate = (app: express.Express, prisma: PrismaClient, deps: Dependencies) => {
  const { authOf } = deps;

  // Read-only explanation endpoint for the Revenue Cycle UI and audit review.
  app.get('/api/revenue-cycle/events/:eventId/evv-readiness', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureRead(auth);
      const event = await revenueEvent(prisma, auth, req.params.eventId);
      const decision = await evaluateSpireEvvPrebill(prisma, {
        organizationId: auth.organizationId,
        legalEntityId: entity(auth),
        event,
      });
      res.json({ data: decision });
    } catch (error) { next(error); }
  });

  // This middleware intentionally registers before Revenue Cycle's READY action.
  // SCLS EVV service events cannot become billable until the exact canonical visit
  // has a current ACCEPTED PRODUCTION transmission. UAT simulation never satisfies it.
  app.post('/api/revenue-cycle/events/:eventId/action', async (req, res, next) => {
    if (clean(req.body?.action, 40).toUpperCase() !== 'READY') return void next();
    try {
      const auth = authOf(res); ensureWrite(auth);
      const event = await revenueEvent(prisma, auth, req.params.eventId);
      const decision = await evaluateSpireEvvPrebill(prisma, {
        organizationId: auth.organizationId,
        legalEntityId: entity(auth),
        event,
      });
      if (decision.required) {
        await recordSpireEvvPrebillDecision(prisma, {
          organizationId: auth.organizationId,
          legalEntityId: entity(auth),
          actorUserId: auth.userId,
          action: 'READY',
          decision,
        });
      }
      if (decision.required && !decision.ready) {
        throw httpError(409, 'EVV pre-bill match failed. This service cannot be marked READY for billing.', {
          code: 'EVV_PREBILL_MATCH_FAILED',
          evvPrebill: decision,
        });
      }
      next();
    } catch (error) { next(error); }
  });

  // Re-check at batch creation so READY status cannot become a bypass if a visit is
  // corrected, rejected or otherwise changes after the original readiness decision.
  app.post('/api/revenue-cycle/batches', async (req, res, next) => {
    if (!Array.isArray(req.body?.serviceEventIds) || req.body.serviceEventIds.length === 0) return void next();
    try {
      const auth = authOf(res); ensureWrite(auth);
      const ids = [...new Set(req.body.serviceEventIds.map((value: unknown) => clean(value)).filter(Boolean))];
      if (!ids.length) return void next();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "RevenueCycleServiceEvent"
          WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=ANY($3::text[])`,
        auth.organizationId, entity(auth), ids,
      );
      if (rows.length !== ids.length) return void next();

      const failed = [];
      for (const event of rows) {
        const decision = await evaluateSpireEvvPrebill(prisma, {
          organizationId: auth.organizationId,
          legalEntityId: entity(auth),
          event,
        });
        if (!decision.required) continue;
        await recordSpireEvvPrebillDecision(prisma, {
          organizationId: auth.organizationId,
          legalEntityId: entity(auth),
          actorUserId: auth.userId,
          action: 'BATCH',
          decision,
        });
        if (!decision.ready) failed.push(decision);
      }
      if (failed.length) {
        throw httpError(409, 'EVV pre-bill match failed. One or more SCLS services cannot enter a billing batch.', {
          code: 'EVV_PREBILL_BATCH_BLOCKED',
          failed,
        });
      }
      next();
    } catch (error) { next(error); }
  });
};
