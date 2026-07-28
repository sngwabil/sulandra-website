import { randomUUID, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { z, ZodError } from 'zod';
import { registerCareersRoutes } from './careers-routes.js';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
};

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

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET?.trim();
const administratorEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  || 'admin@sulandrahealth.com';
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

const bearerToken = (authorization: string | undefined) => {
  if (!authorization) return null;
  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : null;
};

const internalAuth = (req: express.Request): AuthContext | null => {
  const configuredKey = process.env.SULANDRA_INTERNAL_API_KEY?.trim();
  if (!secureEquals(req.header('x-sulandra-api-key'), configuredKey)) return null;

  const organizationId = req.header('x-organization-id')
    ?? process.env.CAREERS_ORGANIZATION_ID?.trim();
  const userId = req.header('x-user-id')
    ?? process.env.PRIMARY_ADMIN_USER_ID?.trim();
  const roleValue = req.header('x-user-role') ?? UserRole.ADMINISTRATOR;

  if (!organizationId || !userId || !isUserRole(roleValue)) return null;
  return { organizationId, userId, role: roleValue };
};

const tokenAuth = (req: express.Request): AuthContext | null => {
  const token = bearerToken(req.header('authorization'));
  if (!token || !jwtSecret) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return null;

    const claims = decoded as AuthTokenClaims;
    if (
      typeof claims.sub !== 'string'
      || typeof claims.organizationId !== 'string'
      || !isUserRole(claims.role)
      || typeof claims.exp !== 'number'
    ) {
      return null;
    }

    return {
      userId: claims.sub,
      organizationId: claims.organizationId,
      role: claims.role,
    };
  } catch {
    return null;
  }
};

const loginSchema = z.object({
  email: z.string().trim().optional(),
  username: z.string().trim().optional(),
  identifier: z.string().trim().optional(),
  password: z.string().min(1).max(1_024),
}).refine(
  (value) => Boolean(value.email || value.username || value.identifier),
  { message: 'Username or email is required' },
);

const resolveAdministrator = async (): Promise<AuthContext & { email: string }> => {
  let administrator: AdministratorRow | undefined;

  try {
    const rows = await prisma.$queryRawUnsafe<AdministratorRow[]>(
      `SELECT "id", "organizationId", "role", "email"
       FROM "User"
       WHERE LOWER("email") = LOWER($1)
       LIMIT 1`,
      administratorEmail,
    );
    administrator = rows[0];
  } catch (error) {
    console.warn('[auth] administrator lookup failed; checking configured identifiers', error);
  }

  if (administrator) {
    const role = isUserRole(administrator.role)
      ? administrator.role
      : UserRole.ADMINISTRATOR;
    if (role !== UserRole.ADMINISTRATOR) {
      throw Object.assign(new Error('Administrator account is not authorized'), { status: 403 });
    }
    return {
      userId: administrator.id,
      organizationId: administrator.organizationId,
      role,
      email: administrator.email || administratorEmail,
    };
  }

  const userId = process.env.PRIMARY_ADMIN_USER_ID?.trim();
  const organizationId = process.env.CAREERS_ORGANIZATION_ID?.trim();
  if (!userId || !organizationId) {
    throw Object.assign(new Error('Administrator account is not configured'), { status: 503 });
  }

  return {
    userId,
    organizationId,
    role: UserRole.ADMINISTRATOR,
    email: administratorEmail,
  };
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  credentials: false,
  origin(origin, callback) {
    if (!origin || clientOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error('Origin is not allowed') as HttpError;
    error.status = 403;
    callback(error);
  },
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
}));

app.use('/public/careers/applications', rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many applications were submitted. Please try again later.' },
}));

app.get('/live', (_req, res) => {
  res.json({ ok: true, service: 'spire-api' });
});

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({
      ok: true,
      service: 'spire-api',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[health] database check failed', error);
    res.status(503).json({
      ok: false,
      service: 'spire-api',
      database: 'unavailable',
    });
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const credentials = loginSchema.parse(req.body);
    const identifier = (credentials.email || credentials.username || credentials.identifier || '')
      .trim()
      .toLowerCase();
    const allowedIdentifier = identifier === administratorEmail || identifier === 'admin';
    const configuredPassword = process.env.ADMIN_INITIAL_PASSWORD;

    if (!configuredPassword || !jwtSecret) {
      res.status(503).json({ error: 'Administrator sign-in is not configured' });
      return;
    }

    if (!allowedIdentifier || !secureEquals(credentials.password, configuredPassword)) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const administrator = await resolveAdministrator();
    const token = jwt.sign(
      {
        organizationId: administrator.organizationId,
        role: administrator.role,
      },
      jwtSecret,
      {
        algorithm: 'HS256',
        subject: administrator.userId,
        expiresIn: '8h',
      },
    );
    const expiresIn = 8 * 60 * 60;
    const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString();
    const firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Sulpitius';
    const lastName = process.env.ADMIN_LAST_NAME?.trim() || 'Gwabil';
    const fullName = `${firstName} ${lastName}`;
    const organizationName = process.env.ORGANIZATION_NAME?.trim() || 'Sulandra Health';
    const organization = {
      id: administrator.organizationId,
      organizationId: administrator.organizationId,
      name: organizationName,
      displayName: organizationName,
    };
    const user = {
      id: administrator.userId,
      userId: administrator.userId,
      organizationId: administrator.organizationId,
      organizationName,
      email: administrator.email,
      username: 'admin',
      role: administrator.role,
      firstName,
      lastName,
      name: fullName,
      fullName,
      displayName: fullName,
      title: 'Administrator',
      status: 'ACTIVE',
      active: true,
      isActive: true,
      mustChangePassword: false,
      organization,
    };
    const session = {
      token,
      accessToken: token,
      refreshToken: token,
      bearerToken: token,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt,
      id: administrator.userId,
      userId: administrator.userId,
      organizationId: administrator.organizationId,
      organizationName,
      email: administrator.email,
      username: 'admin',
      role: administrator.role,
      firstName,
      lastName,
      name: fullName,
      fullName,
      displayName: fullName,
      mustChangePassword: false,
      organization,
      profile: user,
      user,
    };

    res.json({
      ...session,
      session,
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/public/') || req.path === '/health' || req.path === '/live') {
    next();
    return;
  }

  const auth = internalAuth(req) ?? tokenAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  res.locals.auth = auth;
  next();
});

const authOf = (response: express.Response) => response.locals.auth as AuthContext;

app.get('/api/session', (_req, res) => {
  res.json({ data: authOf(res) });
});

const requireRoles = (...roles: UserRole[]): express.RequestHandler => (_req, res, next) => {
  const auth = authOf(res);
  if (!auth || !roles.includes(auth.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  next();
};

const audit = async (
  auth: Partial<AuthContext>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AuditEvent" ("id","organizationId","userId","action","resourceType","resourceId","metadata","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())`,
      randomUUID(),
      auth.organizationId ?? null,
      auth.userId ?? null,
      action,
      resourceType,
      resourceId ?? null,
      JSON.stringify(metadata ?? {}),
    );
  } catch (error) {
    console.warn('[audit] event could not be persisted', { action, resourceType, error });
  }
};

registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[spire-api]', error);

  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const httpError = error as HttpError;
  const status = httpError.status ?? httpError.statusCode ?? 500;
  const message = status < 500 && error instanceof Error
    ? error.message
    : 'Unexpected server error';
  res.status(status).json({ error: message });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`SPIRE API listening on 0.0.0.0:${port}`);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[spire-api] received ${signal}; shutting down`);

  const forceExit = setTimeout(() => {
    console.error('[spire-api] shutdown timed out');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    await prisma.$disconnect();
    if (error) {
      console.error('[spire-api] shutdown failed', error);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
