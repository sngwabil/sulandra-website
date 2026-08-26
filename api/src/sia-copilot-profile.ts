import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
};

type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

type IdentitySnapshot = {
  displayName: string | null;
  workEmail: string | null;
  employeeUsername: string | null;
  role: string;
};

type CopilotPreferences = {
  preferredName: string | null;
  responseStyle: 'CONCISE' | 'GUIDED' | 'DETAILED';
  proactiveHints: boolean;
  rememberRecentApps: boolean;
};

type CopilotRecentContext = {
  lastPage: string | null;
  lastApplication: string | null;
  lastPageTitle: string | null;
  recentApplications: string[];
};

type CopilotProfile = {
  id: string;
  organizationId: string;
  userId: string;
  profileVersion: number;
  identitySnapshot: IdentitySnapshot;
  preferences: CopilotPreferences;
  recentContext: CopilotRecentContext;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastSeenAt: string | Date;
};

const allRoles = Object.values(UserRole) as UserRole[];
const DEFAULT_PREFERENCES: CopilotPreferences = {
  preferredName: null,
  responseStyle: 'GUIDED',
  proactiveHints: true,
  rememberRecentApps: true,
};
const DEFAULT_CONTEXT: CopilotRecentContext = {
  lastPage: null,
  lastApplication: null,
  lastPageTitle: null,
  recentApplications: [],
};

const updateSchema = z.object({
  preferredName: z.string().trim().min(1).max(80).nullable().optional(),
  responseStyle: z.enum(['CONCISE', 'GUIDED', 'DETAILED']).optional(),
  proactiveHints: z.boolean().optional(),
  rememberRecentApps: z.boolean().optional(),
});

const contextSchema = z.object({
  page: z.string().trim().min(1).max(240).optional(),
  application: z.string().trim().min(1).max(160).optional(),
  pageTitle: z.string().trim().min(1).max(180).optional(),
});

let profileReadyPromise: Promise<void> | null = null;
const ensureProfileStorage = (prisma: PrismaClient) => profileReadyPromise ??= (async () => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SIAEmployeeProfile" (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL DEFAULT 1,
    "identitySnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "recentContext" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SIAEmployeeProfile_identity_idx" ON "SIAEmployeeProfile"("organizationId","userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SIAEmployeeProfile_seen_idx" ON "SIAEmployeeProfile"("organizationId","lastSeenAt" DESC)`);
})().catch((error) => {
  profileReadyPromise = null;
  throw error;
});

const normalizePreferences = (value: unknown): CopilotPreferences => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const responseStyle = ['CONCISE', 'GUIDED', 'DETAILED'].includes(String(input.responseStyle))
    ? String(input.responseStyle) as CopilotPreferences['responseStyle']
    : DEFAULT_PREFERENCES.responseStyle;
  return {
    preferredName: typeof input.preferredName === 'string' && input.preferredName.trim() ? input.preferredName.trim().slice(0, 80) : null,
    responseStyle,
    proactiveHints: typeof input.proactiveHints === 'boolean' ? input.proactiveHints : DEFAULT_PREFERENCES.proactiveHints,
    rememberRecentApps: typeof input.rememberRecentApps === 'boolean' ? input.rememberRecentApps : DEFAULT_PREFERENCES.rememberRecentApps,
  };
};

const normalizeContext = (value: unknown): CopilotRecentContext => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const recentApplications = Array.isArray(input.recentApplications)
    ? input.recentApplications.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim().slice(0, 160)).slice(0, 8)
    : [];
  return {
    lastPage: typeof input.lastPage === 'string' && input.lastPage.trim() ? input.lastPage.trim().slice(0, 240) : null,
    lastApplication: typeof input.lastApplication === 'string' && input.lastApplication.trim() ? input.lastApplication.trim().slice(0, 160) : null,
    lastPageTitle: typeof input.lastPageTitle === 'string' && input.lastPageTitle.trim() ? input.lastPageTitle.trim().slice(0, 180) : null,
    recentApplications,
  };
};

const loadIdentitySnapshot = async (prisma: PrismaClient, auth: AuthContext): Promise<IdentitySnapshot> => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      displayName: string | null;
      email: string | null;
      username: string | null;
    }>>(
      `SELECT COALESCE(
          NULLIF(to_jsonb(user_row)->>'displayName',''),
          NULLIF(to_jsonb(user_row)->>'name',''),
          NULLIF(to_jsonb(user_row)->>'fullName',''),
          NULLIF(user_row."email",'')
        ) AS "displayName",
        user_row."email" AS "email",
        credential."username" AS "username"
       FROM "User" user_row
       LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
       WHERE user_row."organizationId"=$1 AND user_row."id"=$2
       LIMIT 1`,
      auth.organizationId,
      auth.userId,
    );
    const row = rows[0];
    return {
      displayName: row?.displayName?.trim() || null,
      workEmail: row?.email?.trim().toLowerCase() || auth.email?.trim().toLowerCase() || null,
      employeeUsername: row?.username?.trim() || null,
      role: auth.role,
    };
  } catch (error) {
    console.warn('[sia-copilot] identity snapshot lookup unavailable', { userId: auth.userId, error });
    return {
      displayName: auth.email?.trim() || null,
      workEmail: auth.email?.trim().toLowerCase() || null,
      employeeUsername: null,
      role: auth.role,
    };
  }
};

const hydrateProfile = (row: any): CopilotProfile => ({
  id: String(row.id),
  organizationId: String(row.organizationId),
  userId: String(row.userId),
  profileVersion: Number(row.profileVersion || 1),
  identitySnapshot: row.identitySnapshot && typeof row.identitySnapshot === 'object'
    ? row.identitySnapshot as IdentitySnapshot
    : { displayName: null, workEmail: null, employeeUsername: null, role: '' },
  preferences: normalizePreferences(row.preferences),
  recentContext: normalizeContext(row.recentContext),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastSeenAt: row.lastSeenAt,
});

export async function ensureSIACopilotProfile(
  prisma: PrismaClient,
  auth: AuthContext,
  options: { page?: string | null; application?: string | null; pageTitle?: string | null } = {},
): Promise<CopilotProfile> {
  await ensureProfileStorage(prisma);
  const identitySnapshot = await loadIdentitySnapshot(prisma, auth);
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "SIAEmployeeProfile" WHERE "organizationId"=$1 AND "userId"=$2 LIMIT 1`,
    auth.organizationId,
    auth.userId,
  );
  const previous = existing[0] ? hydrateProfile(existing[0]) : null;
  const preferences = previous?.preferences || DEFAULT_PREFERENCES;
  const recentContext = previous?.recentContext || DEFAULT_CONTEXT;
  const application = options.application?.trim().slice(0, 160) || recentContext.lastApplication;
  const rememberRecentApps = preferences.rememberRecentApps;
  const recentApplications = rememberRecentApps && application
    ? [application, ...recentContext.recentApplications.filter((value) => value !== application)].slice(0, 8)
    : rememberRecentApps ? recentContext.recentApplications : [];
  const nextContext: CopilotRecentContext = {
    lastPage: options.page?.trim().slice(0, 240) || recentContext.lastPage,
    lastApplication: application || null,
    lastPageTitle: options.pageTitle?.trim().slice(0, 180) || recentContext.lastPageTitle,
    recentApplications,
  };
  const id = previous?.id || randomUUID();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "SIAEmployeeProfile" (
      "id","organizationId","userId","profileVersion","identitySnapshot","preferences","recentContext","createdAt","updatedAt","lastSeenAt"
    ) VALUES ($1,$2,$3,1,$4::jsonb,$5::jsonb,$6::jsonb,NOW(),NOW(),NOW())
    ON CONFLICT ("organizationId","userId") DO UPDATE SET
      "profileVersion"=1,
      "identitySnapshot"=EXCLUDED."identitySnapshot",
      "preferences"=EXCLUDED."preferences",
      "recentContext"=EXCLUDED."recentContext",
      "updatedAt"=NOW(),
      "lastSeenAt"=NOW()
    RETURNING *`,
    id,
    auth.organizationId,
    auth.userId,
    JSON.stringify(identitySnapshot),
    JSON.stringify(preferences),
    JSON.stringify(nextContext),
  );
  return hydrateProfile(rows[0]);
}

export function serializeSIACopilotProfile(profile: CopilotProfile): string[] {
  const identity = profile.identitySnapshot;
  const preferences = profile.preferences;
  const context = profile.recentContext;
  return [
    `serverConfirmedSIACopilotProfileVersion: ${profile.profileVersion}`,
    `serverConfirmedSIACopilotDisplayName: ${identity.displayName || 'NOT_FOUND'}`,
    `serverConfirmedSIACopilotPreferredName: ${preferences.preferredName || 'NOT_SET'}`,
    `serverConfirmedSIACopilotResponseStyle: ${preferences.responseStyle}`,
    `serverConfirmedSIACopilotProactiveHints: ${preferences.proactiveHints ? 'ENABLED' : 'DISABLED'}`,
    `serverConfirmedSIACopilotRecentApplications: ${context.recentApplications.join(' | ') || 'NONE'}`,
    `serverConfirmedSIACopilotLastApplication: ${context.lastApplication || 'NONE'}`,
    `serverConfirmedSIACopilotLastPage: ${context.lastPage || 'NONE'}`,
  ];
}

export function registerSIACopilotProfileRoutes({ app, prisma, authOf, requireRoles }: Dependencies) {
  const gate = requireRoles(...allRoles);

  app.get('/api/sia/profile', gate, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const profile = await ensureSIACopilotProfile(prisma, auth);
      res.json({ data: { profile } });
    } catch (error) { next(error); }
  });

  app.patch('/api/sia/profile', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = updateSchema.parse(req.body);
      const profile = await ensureSIACopilotProfile(prisma, auth);
      const preferences: CopilotPreferences = {
        ...profile.preferences,
        ...input,
        preferredName: input.preferredName === undefined ? profile.preferences.preferredName : input.preferredName,
      };
      await prisma.$executeRawUnsafe(
        `UPDATE "SIAEmployeeProfile" SET "preferences"=$1::jsonb,"updatedAt"=NOW(),"lastSeenAt"=NOW() WHERE "organizationId"=$2 AND "userId"=$3`,
        JSON.stringify(preferences), auth.organizationId, auth.userId,
      );
      const updated = await ensureSIACopilotProfile(prisma, auth);
      res.json({ data: { profile: updated } });
    } catch (error) { next(error); }
  });

  app.post('/api/sia/profile/context', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = contextSchema.parse(req.body);
      const profile = await ensureSIACopilotProfile(prisma, auth, input);
      res.json({ data: { profile } });
    } catch (error) { next(error); }
  });
}
