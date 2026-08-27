import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { z, ZodError } from 'zod';
import { registerCareersRoutes } from './careers-routes.js';
import { registerSIARoutes } from './sia-routes.js';
import { registerSIACopilotProfileRoutes } from './sia-copilot-profile.js';
import { registerITSolutionsRoutes } from './it-solutions-routes.js';
import {
  createEntityAccessMiddleware,
  entityAccessOf,
  type ScopedAuthContext,
} from './entity-access.js';
import { getUserEntityContext, registerMultiCompanyRoutes } from './multi-company-routes.js';

type AuthContext = ScopedAuthContext;

type AuthTokenClaims = JwtPayload & {
  organizationId?: unknown;
  role?: unknown;
};

type HttpError = Error & {
  status?: number;
  statusCode?: number;
};

type AdministratorRow = {
  id: string;
  organizationId: string;
  role: unknown;
  email: string | null;
};

type PortalCredentialRow = AdministratorRow & {
  username: string | null;
  passwordHash: string | null;
  displayName: string | null;
  mustChangePassword: boolean | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | string | null;
  userRecord: Record<string, unknown> | null;
};

type LoginAccount = AuthContext & {
  email: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
};

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET?.trim();
const administratorEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  || 'admin@sulandrahealth.com';
const passwordScryptCost = 16_384;
const passwordScryptBlockSize = 8;
const passwordScryptParallelization = 1;
const passwordKeyLength = 64;
const chartWriteRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.DSP,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
]);
const chartReadRoles = new Set<UserRole>([
  ...chartWriteRoles,
  UserRole.AUDITOR,
  UserRole.COO,
]);
const administrationRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.CEO,
  UserRole.COO,
]);
const clientOrigins = new Set([
  'https://sulandrahealth.com',
  'https://www.sulandrahealth.com',
  ...(process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
]);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a valid TCP port');
}

if (isProduction && !jwtSecret) {
  throw new Error('JWT_SECRET is required in production');
}

if (isProduction && clientOrigins.size === 0) {
  throw new Error('CLIENT_ORIGIN is required in production');
}

const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && Object.values(UserRole).includes(value as UserRole);

const secureEquals = (provided: string | undefined, configured: string | undefined) => {
  if (!provided || !configured) return false;
  const providedBuffer = Buffer.from(provided);
  const configuredBuffer = Buffer.from(configured);
  return providedBuffer.length === configuredBuffer.length
    && timingSafeEqual(providedBuffer, configuredBuffer);
};

const hashPortalPassword = (password: string) => {
  const salt = randomBytes(24);
  const derived = scryptSync(password, salt, passwordKeyLength, {
    N: passwordScryptCost,
    r: passwordScryptBlockSize,
    p: passwordScryptParallelization,
  });
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
};

const verifyPortalPassword = (password: string, storedHash: string) => {
  const [algorithm, saltBase64, hashBase64] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltBase64 || !hashBase64) return false;
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltBase64, 'base64'), expected.length, {
    N: passwordScryptCost,
    r: passwordScryptBlockSize,
    p: passwordScryptParallelization,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin(origin, callback) {
  if (!origin || clientOrigins.has(origin)) return callback(null, true);
  callback(new Error('Origin is not allowed'));
}, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));

const authOf = (res: express.Response): AuthContext => res.locals.auth as AuthContext;
const requireRoles = (...roles: UserRole[]): express.RequestHandler => (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length).trim()
    : undefined;
  if (!token || !jwtSecret) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const claims = jwt.verify(token, jwtSecret) as AuthTokenClaims;
    if (typeof claims.sub !== 'string' || typeof claims.organizationId !== 'string' || !isUserRole(claims.role)) {
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }
    const role = claims.role;
    if (!roles.includes(role)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    res.locals.auth = {
      userId: claims.sub,
      organizationId: claims.organizationId,
      role,
      legalEntityId: typeof (claims as any).legalEntityId === 'string' ? (claims as any).legalEntityId : null,
      email: typeof (claims as any).email === 'string' ? (claims as any).email : undefined,
    } satisfies AuthContext;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

const audit = async (auth: AuthContext, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown> = {}) => {
  try {
    const metadataJson = JSON.stringify(metadata);
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='AuditEvent'`,
    );
    const available = new Map(columns.map((column) => [column.column_name, column.data_type]));
    const sourceValues: Record<string, unknown> = {
      id: randomUUID(),
      organizationId: auth.organizationId,
      legalEntityId: auth.legalEntityId ?? null,
      userId: auth.userId,
      actorUserId: auth.userId,
      action,
      eventType: action,
      resourceType,
      entityType: resourceType,
      resourceId,
      entityId: resourceId,
      metadata: metadataJson,
      details: metadataJson,
      payload: metadataJson,
    };
    const candidates: Array<{ name: string; value: unknown; cast?: string }> = [];
    for (const [name, dataType] of available.entries()) {
      if (!(name in sourceValues)) continue;
      const jsonLike = dataType === 'json' || dataType === 'jsonb';
      const booleanLike = dataType === 'boolean';
      const numericLike = ['integer', 'bigint', 'numeric', 'double precision', 'real'].includes(dataType);
      const timestampLike = dataType.includes('timestamp');
      candidates.push({
        name,
        value: jsonLike ? metadataJson : booleanLike ? false : numericLike ? 0 : timestampLike ? new Date() : sourceValues[name],
        cast: jsonLike ? '::jsonb' : undefined,
      });
    }
    const columnSql = candidates.map((candidate) => `"${candidate.name}"`);
    const valueSql = candidates.map((candidate, index) => `$${index + 1}${candidate.cast || ''}`);
    if (available.has('createdAt')) {
      columnSql.push('"createdAt"');
      valueSql.push('NOW()');
    }
    if (!candidates.length) throw new Error('AuditEvent has no compatible columns.');
    await prisma.$executeRawUnsafe(`INSERT INTO "AuditEvent" (${columnSql.join(',')}) VALUES (${valueSql.join(',')})`, ...candidates.map((candidate) => candidate.value));
  } catch (error) {
    console.warn('[audit] event could not be persisted', { action, resourceType, error });
  }
};

const portalCredentialSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  temporaryPassword: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(160).optional(),
}).refine((value) => Boolean(value.userId || value.email), { message: 'User ID or employee email is required' });

const provisionPortalCredential: express.RequestHandler = async (req, res, next) => {
  try {
    const auth = authOf(res);
    const input = portalCredentialSchema.parse({ ...req.body, userId: req.params.userId || req.body?.userId });
    const users = await prisma.$queryRawUnsafe<AdministratorRow[]>(
      `SELECT "id", "organizationId", "role", "email" FROM "User" WHERE "organizationId" = $1 AND (( $2::text IS NOT NULL AND "id" = $2) OR ($3::text IS NOT NULL AND LOWER("email") = LOWER($3))) LIMIT 1`,
      auth.organizationId,
      input.userId ?? null,
      input.email ?? null,
    );
    const user = users[0];
    if (!user || !isUserRole(user.role)) {
      res.status(404).json({ error: 'Employee account was not found' });
      return;
    }
    const passwordHash = hashPortalPassword(input.temporaryPassword);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeePortalCredential" ("userId","username","passwordHash","displayName","mustChangePassword","createdAt","updatedAt") VALUES ($1,$2,$3,$4,TRUE,NOW(),NOW()) ON CONFLICT ("userId") DO UPDATE SET "username" = EXCLUDED."username", "passwordHash" = EXCLUDED."passwordHash", "displayName" = EXCLUDED."displayName", "mustChangePassword" = TRUE, "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = NOW()`,
      user.id,
      input.username,
      passwordHash,
      input.displayName ?? null,
    );
    await audit(auth, 'PROVISION_EMPLOYEE_PORTAL_ACCESS', 'User', user.id, { username: input.username });
    res.status(201).json({ data: { userId: user.id, username: input.username } });
  } catch (error) { next(error); }
};

app.post('/api/admin/users/:userId/portal-credentials', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), provisionPortalCredential);
app.post('/api/admin/employee-portal/credentials', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), provisionPortalCredential);

registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });
registerSIACopilotProfileRoutes({ app, prisma, authOf, requireRoles });
registerSIARoutes({ app, prisma, authOf, requireRoles });
registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });
registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: error.issues });
    return;
  }
  const httpError = error as HttpError;
  const status = httpError.status ?? httpError.statusCode ?? 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: httpError.message || 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => { console.log(`SPIRE API listening on 0.0.0.0:${port}`); });
const shutdown = async (signal: string) => { console.log(`Received ${signal}; disconnecting database client.`); await prisma.$disconnect(); process.exit(0); };
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
