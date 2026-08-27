import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { z, ZodError } from 'zod';
import { registerCareersRoutes } from './careers-routes.js';
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

const roleTitle = (role: UserRole) => {
  if (role === UserRole.COO) return 'Chief Operating Officer';
  if (role === UserRole.CEO) return 'Chief Executive Officer';
  return role
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

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
  return {
    organizationId,
    userId,
    role: roleValue,
    email: req.header('x-user-email')?.trim().toLowerCase() || administratorEmail,
  };
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
      email: typeof claims.email === 'string'
        ? claims.email.trim().toLowerCase()
        : undefined,
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
    console.warn('[auth] administrator lookup by email failed', error);
  }

  if (!administrator) {
    const fallback = await prisma.$queryRawUnsafe<AdministratorRow[]>(
      `SELECT "id", "organizationId", "role", "email"
       FROM "User"
       WHERE "role"::text = 'ADMINISTRATOR'
       ORDER BY "createdAt" ASC
       LIMIT 1`,
    );
    administrator = fallback[0];
  }

  if (!administrator || !isUserRole(administrator.role)) {
    throw Object.assign(new Error('Administrator account is not configured'), { status: 503 });
  }

  return {
    userId: administrator.id,
    organizationId: administrator.organizationId,
    role: administrator.role,
    email: administrator.email?.trim().toLowerCase() || administratorEmail,
  };
};

const resolvePortalAccount = async (identifier: string): Promise<LoginAccount | null> => {
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
     FROM "EmployeePortalCredential" c
     JOIN "User" u ON u."id" = c."userId"
     WHERE LOWER(c."username") = LOWER($1)
        OR LOWER(COALESCE(u."email", '')) = LOWER($1)
     LIMIT 1`,
    identifier,
  );
  const row = rows[0];
  if (!row || !isUserRole(row.role)) return null;

  const lockedUntil = row.lockedUntil ? new Date(row.lockedUntil) : null;
  const displayName = row.displayName
    || [
      stringField(row.userRecord, 'firstName'),
      stringField(row.userRecord, 'middleName'),
      stringField(row.userRecord, 'lastName'),
    ].filter(Boolean).join(' ')
    || row.email
    || row.username
    || 'Sulandra Health Employee';

  return {
    userId: row.id,
    organizationId: row.organizationId,
    role: row.role,
    email: row.email?.trim().toLowerCase() || '',
    username: row.username || row.email || row.id,
    displayName,
    mustChangePassword: Boolean(row.mustChangePassword),
    passwordHash: row.passwordHash,
    failedLoginAttempts: row.failedLoginAttempts || 0,
    lockedUntil,
  } as LoginAccount & {
    passwordHash: string | null;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  };
};

const recordFailedPortalLogin = async (userId: string) => {
  await prisma.$executeRawUnsafe(
    `UPDATE "EmployeePortalCredential"
     SET
       "failedLoginAttempts" = "failedLoginAttempts" + 1,
       "lockedUntil" = CASE
         WHEN "failedLoginAttempts" + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
         ELSE NULL
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
    employmentStatus: 'ACTIVE',
    avatarUrl: '',
    profilePhotoUrl: '',
    photoUrl: '',
    permissions: authorization.permissions,
    access: authorization.access,
    apps: authorization.apps,
  };
  return {
    token,
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn,
    expiresAt,
    mustChangePassword: account.mustChangePassword,
    landingRoute: authorization.landingRoute,
    permissions: authorization.permissions,
    access: authorization.access,
    apps: authorization.apps,
    role: account.role,
    username: account.username,
    user,
    employee: user,
    profile: user,
    organization,
    company: organization,
  };
};

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || clientOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(Object.assign(new Error('Origin is not allowed'), { status: 403 }));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 75,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/live', (_req, res) => {
  res.json({ status: 'ok', service: 'spire-api' });
});

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check failed', error);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const identifier = (input.identifier || input.username || input.email || '').trim();
    const account = await resolvePortalAccount(identifier);
    if (!account) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const accountWithSecurity = account as LoginAccount & {
      passwordHash: string | null;
      failedLoginAttempts: number;
      lockedUntil: Date | null;
    };
    if (accountWithSecurity.lockedUntil && accountWithSecurity.lockedUntil.getTime() > Date.now()) {
      res.status(423).json({ error: 'Account is temporarily locked. Try again in 15 minutes.' });
      return;
    }
    if (!verifyPortalPassword(input.password, accountWithSecurity.passwordHash)) {
      await recordFailedPortalLogin(account.userId);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    await recordSuccessfulPortalLogin(account.userId);
    res.json(buildSessionPayload(account));
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/admin-login', authLimiter, async (req, res, next) => {
  try {
    if (!jwtSecret) {
      res.status(503).json({ error: 'Administrator sign-in is not configured' });
      return;
    }
    const input = loginSchema.parse(req.body);
    const identifier = (input.identifier || input.username || input.email || '').trim().toLowerCase();
    const account = await resolvePortalAccount(identifier);
    if (!account || !administrationRoles.has(account.role)) {
      res.status(401).json({ error: 'Invalid administrator credentials' });
      return;
    }

    const accountWithSecurity = account as LoginAccount & {
      passwordHash: string | null;
      failedLoginAttempts: number;
      lockedUntil: Date | null;
    };
    if (accountWithSecurity.lockedUntil && accountWithSecurity.lockedUntil.getTime() > Date.now()) {
      res.status(423).json({ error: 'Account is temporarily locked. Try again in 15 minutes.' });
      return;
    }
    if (!verifyPortalPassword(input.password, accountWithSecurity.passwordHash)) {
      await recordFailedPortalLogin(account.userId);
      res.status(401).json({ error: 'Invalid administrator credentials' });
      return;
    }

    await recordSuccessfulPortalLogin(account.userId);
    res.json(buildSessionPayload(account));
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/legacy-admin-login', authLimiter, async (req, res, next) => {
  try {
    if (!jwtSecret) {
      res.status(503).json({ error: 'Administrator sign-in is not configured' });
      return;
    }
    const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
    if (!configuredPassword) {
      res.status(410).json({ error: 'Legacy administrator password sign-in is disabled' });
      return;
    }
    const input = loginSchema.parse(req.body);
    if (!secureEquals(input.password, configuredPassword)) {
      res.status(401).json({ error: 'Invalid administrator credentials' });
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
    const organizationName = process.env.ORGANIZATION_NAME?.trim() || 'Sulandra Health';
    const organization = {
      id: administrator.organizationId,
      organizationId: administrator.organizationId,
      name: organizationName,
      displayName: organizationName,
    };
    const authorization = accessForRole(administrator.role);
    const user = {
      id: administrator.userId,
      userId: administrator.userId,
      employeeId: administrator.userId,
      organizationId: administrator.organizationId,
      organizationName,
      email: administrator.email,
      username: administrator.email,
      role: administrator.role,
      firstName: 'Sulandra',
      middleName: '',
      lastName: 'Administrator',
      name: 'Sulandra Administrator',
      fullName: 'Sulandra Administrator',
      displayName: 'Sulandra Administrator',
      title: roleTitle(administrator.role),
      jobTitle: roleTitle(administrator.role),
      department: 'Administration',
      phone: '',
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      avatarUrl: '',
      profilePhotoUrl: '',
      photoUrl: '',
      permissions: authorization.permissions,
      access: authorization.access,
      apps: authorization.apps,
    };

    res.json({
      token,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      expiresAt,
      mustChangePassword: false,
      landingRoute: authorization.landingRoute,
      permissions: authorization.permissions,
      access: authorization.access,
      apps: authorization.apps,
      role: administrator.role,
      username: administrator.email,
      user,
      employee: user,
      profile: user,
      organization,
      company: organization,
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

  res.locals.auth = {
    ...auth,
    ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',
    userAgent: req.get('user-agent')?.trim() || 'Sulandra Health API',
  };
  next();
});

app.use(createEntityAccessMiddleware({ prisma }));

const authOf = (response: express.Response) => response.locals.auth as AuthContext;

app.get('/api/session', async (_req, res, next) => {
  try {
    const auth = authOf(res);
    const authorization = accessForRole(auth.role);
    const entityContext = await getUserEntityContext(prisma, auth);
    res.json({
      data: {
        ...auth,
        permissions: authorization.permissions,
        access: authorization.access,
        apps: authorization.apps,
        landingRoute: authorization.landingRoute,
        entityAccess: entityAccessOf(res),
        entityContext,
      },
    });
  } catch (error) {
    next(error);
  }
});

const requireRoles = (...roles: UserRole[]): express.RequestHandler => (_req, res, next) => {
  const auth = authOf(res);
  if (!auth || !roles.includes(auth.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return;
  }
  next();
};

type AuditColumn = {
  columnName: string;
  isNullable: 'YES' | 'NO';
  dataType: string;
  udtName: string;
  columnDefault: string | null;
};

let auditColumns: AuditColumn[] | null = null;

const audit = async (
  auth: Partial<AuthContext>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => {
  try {
    const organizationId = auth.organizationId
      ?? process.env.CAREERS_ORGANIZATION_ID?.trim()
      ?? null;
    const userId = auth.userId
      ?? process.env.PRIMARY_ADMIN_USER_ID?.trim()
      ?? null;
    let actorEmail = auth.email?.trim().toLowerCase() || null;
    if (!actorEmail && userId) {
      try {
        const users = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
          `SELECT "email" FROM "User" WHERE "id"=$1 LIMIT 1`,
          userId,
        );
        actorEmail = users[0]?.email?.trim().toLowerCase() || null;
      } catch (error) {
        console.warn('[audit] actor email lookup failed; using the configured HR identity', {
          userId,
          error,
        });
      }
    }
    actorEmail ||= administratorEmail;
    const ipAddress = auth.ipAddress?.trim() || '0.0.0.0';
    const userAgent = auth.userAgent?.trim() || 'Sulandra Health API';

    if (!auditColumns) {
      auditColumns = await prisma.$queryRawUnsafe<AuditColumn[]>(
        `SELECT
           "column_name" AS "columnName",
           "is_nullable" AS "isNullable",
           "data_type" AS "dataType",
           "udt_name" AS "udtName",
           "column_default" AS "columnDefault"
         FROM "information_schema"."columns"
         WHERE "table_schema"=current_schema() AND "table_name"='AuditEvent'
         ORDER BY "ordinal_position"`,
      );
    }

    const available = new Map(auditColumns.map((column) => [column.columnName, column]));
    const metadataJson = JSON.stringify(metadata ?? {});
    const knownValues = new Map<string, { value: unknown; cast?: string }>([
      ['id', { value: randomUUID() }],
      ['organizationId', { value: organizationId }],
      ['legalEntityId', { value: auth.legalEntityId ?? null }],
      ['userId', { value: userId }],
      ['actorId', { value: userId }],
      ['actorUserId', { value: userId }],
      ['performedById', { value: userId }],
      ['actorEmail', { value: actorEmail }],
      ['actorRole', { value: auth.role ?? UserRole.ADMINISTRATOR }],
      ['ipAddress', { value: ipAddress }],
      ['userAgent', { value: userAgent }],
      ['action', { value: action }],
      ['resourceType', { value: resourceType }],
      ['resourceId', { value: resourceId ?? null }],
      ['metadata', { value: metadataJson, cast: '::jsonb' }],
      ['details', { value: metadataJson, cast: '::jsonb' }],
      ['changes', { value: metadataJson, cast: '::jsonb' }],
      ['description', { value: `${action} ${resourceType}${resourceId ? ` ${resourceId}` : ''}` }],
    ]);

    const candidates: Array<{ name: string; value: unknown; cast?: string }> = [];
    for (const [name, candidate] of knownValues) {
      if (available.has(name)) candidates.push({ name, ...candidate });
    }

    for (const column of auditColumns) {
      if (
        column.isNullable === 'YES'
        || column.columnDefault
        || candidates.some((candidate) => candidate.name === column.columnName)
        || column.columnName === 'createdAt'
      ) continue;

      const jsonLike = column.dataType === 'json' || column.dataType === 'jsonb' || column.udtName === 'jsonb';
      const booleanLike = column.dataType === 'boolean' || column.udtName === 'bool';
      const numericLike = ['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'].includes(column.dataType);
      const timestampLike = column.dataType.includes('timestamp') || column.udtName.includes('timestamp');

      candidates.push({
        name: column.columnName,
        value: jsonLike ? metadataJson : booleanLike ? false : numericLike ? 0 : timestampLike ? new Date() : '',
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

    await prisma.$executeRawUnsafe(
      `INSERT INTO "AuditEvent" (${columnSql.join(',')}) VALUES (${valueSql.join(',')})`,
      ...candidates.map((candidate) => candidate.value),
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
      input.username,
      passwordHash,
      input.displayName ?? null,
    );
    await audit(auth, 'PROVISION_EMPLOYEE_PORTAL_ACCESS', 'User', user.id, {
      username: input.username,
    });
    res.status(201).json({ data: { userId: user.id, username: input.username } });
  } catch (error) {
    next(error);
  }
};

app.post(
  '/api/admin/users/:userId/portal-credentials',
  requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
  provisionPortalCredential,
);
app.post(
  '/api/admin/employee-portal/credentials',
  requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
  provisionPortalCredential,
);

registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });
registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: error.issues,
    });
    return;
  }

  const httpError = error as HttpError;
  const status = httpError.status ?? httpError.statusCode ?? 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: httpError.message || 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`SPIRE API listening on 0.0.0.0:${port}`);
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}; disconnecting database client.`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
