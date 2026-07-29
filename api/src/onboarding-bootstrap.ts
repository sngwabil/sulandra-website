import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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
]);
const administrationRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.CEO,
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
    maxmem: 64 * 1_024 * 1_024,
  });
  return [
    'scrypt',
    passwordScryptCost,
    passwordScryptBlockSize,
    passwordScryptParallelization,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
};

const verifyPortalPassword = (password: string, encodedHash: string | null) => {
  if (!encodedHash) return false;
  const [scheme, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue, extra] =
    encodedHash.split('$');
  if (
    scheme !== 'scrypt'
    || !costValue
    || !blockSizeValue
    || !parallelizationValue
    || !saltValue
    || !hashValue
    || extra
  ) {
    return false;
  }

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);
  if (
    cost !== passwordScryptCost
    || blockSize !== passwordScryptBlockSize
    || parallelization !== passwordScryptParallelization
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const derived = scryptSync(
      password,
      Buffer.from(saltValue, 'base64url'),
      expected.length,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: 64 * 1_024 * 1_024,
      },
    );
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
};

const roleTitle = (role: UserRole) => role
  .toLowerCase()
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const stringField = (record: Record<string, unknown> | null, ...keys: string[]) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const accessForRole = (role: UserRole) => {
  const canWriteCharts = chartWriteRoles.has(role);
  const canReadCharts = chartReadRoles.has(role);
  const canAdminister = administrationRoles.has(role);
  const permissions = [
    'SULANDRA_DESKTOP_ACCESS',
    ...(canReadCharts ? ['SPIRE_CHART_READ'] : []),
    ...(canWriteCharts ? ['SPIRE_CHART_WRITE'] : []),
    ...(canAdminister ? ['SULANDRA_ADMINISTRATION_ACCESS'] : []),
  ];

  return {
    landingRoute: '/desktop',
    permissions,
    access: {
      desktop: true,
      administration: canAdminister,
      spire: {
        enabled: canReadCharts,
        route: '/spire',
        readOnly: canReadCharts && !canWriteCharts,
        canReadCharts,
        canWriteCharts,
      },
    },
    apps: [
      {
        id: 'sulandra-desktop',
        name: 'Sulandra Desktop',
        route: '/desktop',
        enabled: true,
      },
      {
        id: 'spire',
        name: 'S.P.I.R.E.',
        route: '/spire',
        enabled: canReadCharts,
        readOnly: canReadCharts && !canWriteCharts,
      },
    ],
  };
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

const resolvePortalAccount = async (identifier: string): Promise<(LoginAccount & {
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}) | null> => {
  const rows = await prisma.$queryRawUnsafe<PortalCredentialRow[]>(
    `SELECT
       u."id",
       u."organizationId",
       u."role",
       u."email",
       c."username",
       c."passwordHash",
       c."displayName",
       c."mustChangePassword",
       c."failedLoginAttempts",
       c."lockedUntil",
       to_jsonb(u) AS "userRecord"
     FROM "User" u
     LEFT JOIN "EmployeePortalCredential" c ON c."userId" = u."id"
     WHERE LOWER(COALESCE(c."username", '')) = LOWER($1)
        OR LOWER(COALESCE(u."email", '')) = LOWER($1)
     LIMIT 1`,
    identifier,
  );
  const row = rows[0];
  if (!row || !isUserRole(row.role)) return null;

  const status = stringField(row.userRecord, 'status');
  const active = row.userRecord?.active ?? row.userRecord?.isActive;
  if (active === false || status === 'INACTIVE' || status === 'DISABLED' || status === 'TERMINATED') {
    throw Object.assign(new Error('Employee account is not active'), { status: 403 });
  }

  const email = row.email?.trim().toLowerCase() || identifier;
  const username = row.username?.trim()
    || stringField(row.userRecord, 'username')
    || email;
  const displayName = row.displayName?.trim()
    || stringField(row.userRecord, 'displayName', 'fullName', 'name')
    || [stringField(row.userRecord, 'firstName'), stringField(row.userRecord, 'lastName')]
      .filter(Boolean)
      .join(' ')
    || email;

  return {
    userId: row.id,
    organizationId: row.organizationId,
    role: row.role,
    email,
    username,
    displayName,
    mustChangePassword: row.mustChangePassword ?? true,
    passwordHash: row.passwordHash,
    failedLoginAttempts: row.failedLoginAttempts ?? 0,
    lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
  };
};

const recordFailedPortalLogin = async (userId: string) => {
  await prisma.$executeRawUnsafe(
    `UPDATE "EmployeePortalCredential"
     SET
       "failedLoginAttempts" = "failedLoginAttempts" + 1,
       "lockedUntil" = CASE
         WHEN "failedLoginAttempts" + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
         ELSE "lockedUntil"
       END,
       "updatedAt" = NOW()
     WHERE "userId" = $1`,
    userId,
  );
};

const recordSuccessfulPortalLogin = async (userId: string) => {
  await prisma.$executeRawUnsafe(
    `UPDATE "EmployeePortalCredential"
     SET
       "failedLoginAttempts" = 0,
       "lockedUntil" = NULL,
       "lastSignedInAt" = NOW(),
       "updatedAt" = NOW()
     WHERE "userId" = $1`,
    userId,
  );
};

const buildSessionPayload = (account: LoginAccount) => {
  if (!jwtSecret) {
    throw Object.assign(new Error('Employee sign-in is not configured'), { status: 503 });
  }

  const token = jwt.sign(
    {
      organizationId: account.organizationId,
      role: account.role,
    },
    jwtSecret,
    {
      algorithm: 'HS256',
      subject: account.userId,
      expiresIn: '8h',
    },
  );
  const expiresIn = 8 * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString();
  const nameParts = account.displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts.shift() || account.username;
  const lastName = nameParts.pop() || '';
  const middleName = nameParts.join(' ');
  const organizationName = process.env.ORGANIZATION_NAME?.trim() || 'Sulandra Health';
  const authorization = accessForRole(account.role);
  const organization = {
    id: account.organizationId,
    organizationId: account.organizationId,
    name: organizationName,
    displayName: organizationName,
  };
  const user = {
    id: account.userId,
    userId: account.userId,
    employeeId: account.userId,
    organizationId: account.organizationId,
    organizationName,
    email: account.email,
    username: account.username,
    role: account.role,
    firstName,
    middleName,
    lastName,
    name: account.displayName,
    fullName: account.displayName,
    displayName: account.displayName,
    title: roleTitle(account.role),
    jobTitle: roleTitle(account.role),
    department: '',
    phone: '',
    status: 'ACTIVE',
    active: true,
    isActive: true,
    mustChangePassword: account.mustChangePassword,
    permissions: authorization.permissions,
    access: authorization.access,
    apps: authorization.apps,
    landingRoute: authorization.landingRoute,
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
    id: account.userId,
    userId: account.userId,
    employeeId: account.userId,
    organizationId: account.organizationId,
    organizationName,
    email: account.email,
    username: account.username,
    role: account.role,
    firstName,
    middleName,
    lastName,
    name: account.displayName,
    fullName: account.displayName,
    displayName: account.displayName,
    title: roleTitle(account.role),
    jobTitle: roleTitle(account.role),
    department: '',
    phone: '',
    mustChangePassword: account.mustChangePassword,
    permissions: authorization.permissions,
    access: authorization.access,
    apps: authorization.apps,
    landingRoute: authorization.landingRoute,
    redirectTo: authorization.landingRoute,
    defaultRoute: authorization.landingRoute,
    organization,
    profile: user,
    user,
  };

  return {
    ...session,
    session,
    data: session,
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
}));

app.use('/public/careers/applicant/login', rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many applicant sign-in attempts. Please try again later.' },
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

    if (!jwtSecret) {
      res.status(503).json({ error: 'Employee sign-in is not configured' });
      return;
    }

    let account: LoginAccount | null = null;
    const configuredPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const isAdministratorIdentifier = identifier === administratorEmail || identifier === 'admin';

    if (
      isAdministratorIdentifier
      && configuredPassword
      && secureEquals(credentials.password, configuredPassword)
    ) {
      const administrator = await resolveAdministrator();
      const firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Sulpitius';
      const lastName = process.env.ADMIN_LAST_NAME?.trim() || 'Gwabil';
      account = {
        ...administrator,
        username: 'admin',
        displayName: `${firstName} ${lastName}`,
        mustChangePassword: false,
      };
    } else {
      const employee = await resolvePortalAccount(identifier);
      const locked = employee?.lockedUntil && employee.lockedUntil.getTime() > Date.now();
      if (!employee || locked || !verifyPortalPassword(credentials.password, employee.passwordHash)) {
        if (employee && !locked && employee.passwordHash) {
          await recordFailedPortalLogin(employee.userId);
        }
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      await recordSuccessfulPortalLogin(employee.userId);
      account = employee;
    }

    res.json(buildSessionPayload(account));
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
  const auth = authOf(res);
  const authorization = accessForRole(auth.role);
  res.json({
    data: {
      ...auth,
      permissions: authorization.permissions,
      access: authorization.access,
      apps: authorization.apps,
      landingRoute: authorization.landingRoute,
    },
  });
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

const portalCredentialSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  temporaryPassword: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(160).optional(),
}).refine(
  (value) => Boolean(value.userId || value.email),
  { message: 'User ID or employee email is required' },
);

const provisionPortalCredential: express.RequestHandler = async (req, res, next) => {
  try {
    const auth = authOf(res);
    const input = portalCredentialSchema.parse({
      ...req.body,
      userId: req.params.userId || req.body?.userId,
    });
    const users = await prisma.$queryRawUnsafe<AdministratorRow[]>(
      `SELECT "id", "organizationId", "role", "email"
       FROM "User"
       WHERE "organizationId" = $1
         AND (
           ($2::text IS NOT NULL AND "id" = $2)
           OR ($3::text IS NOT NULL AND LOWER("email") = LOWER($3))
         )
       LIMIT 1`,
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
      `INSERT INTO "EmployeePortalCredential"
         ("userId","username","passwordHash","displayName","mustChangePassword","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,TRUE,NOW(),NOW())
       ON CONFLICT ("userId") DO UPDATE SET
         "username" = EXCLUDED."username",
         "passwordHash" = EXCLUDED."passwordHash",
         "displayName" = EXCLUDED."displayName",
         "mustChangePassword" = TRUE,
         "failedLoginAttempts" = 0,
         "lockedUntil" = NULL,
         "updatedAt" = NOW()`,
      user.id,
      input.username.toLowerCase(),
      passwordHash,
      input.displayName ?? null,
    );

    await audit(auth, 'EMPLOYEE_PORTAL_CREDENTIAL_PROVISIONED', 'User', user.id, {
      username: input.username.toLowerCase(),
      role: user.role,
    });
    const authorization = accessForRole(user.role);
    res.status(201).json({
      data: {
        userId: user.id,
        email: user.email,
        username: input.username.toLowerCase(),
        displayName: input.displayName ?? null,
        role: user.role,
        mustChangePassword: true,
        permissions: authorization.permissions,
        access: authorization.access,
        apps: authorization.apps,
        landingRoute: authorization.landingRoute,
      },
    });
  } catch (error) {
    next(error);
  }
};

app.post(
  '/api/admin/portal-credentials',
  requireRoles(UserRole.ADMINISTRATOR),
  provisionPortalCredential,
);
app.put(
  '/api/admin/users/:userId/credentials',
  requireRoles(UserRole.ADMINISTRATOR),
  provisionPortalCredential,
);

app.get('/api/spire/access', (_req, res) => {
  const auth = authOf(res);
  const authorization = accessForRole(auth.role);
  if (!authorization.access.spire.enabled) {
    res.status(403).json({ error: 'S.P.I.R.E. access is not assigned to this employee role' });
    return;
  }
  res.json({
    data: {
      userId: auth.userId,
      organizationId: auth.organizationId,
      role: auth.role,
      ...authorization.access.spire,
      permissions: authorization.permissions,
    },
  });
});

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
