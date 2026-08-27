import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { z, ZodError } from 'zod';
import { registerCareersRoutes } from './careers-routes.js';
import { registerEmployeeSupportRoutes } from './employee-support-routes.js';
import { registerSIACopilotProfileRoutes } from './sia-copilot-profile.js';
import { registerSIARoutes } from './sia-routes.js';
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

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (origin, callback) => {
  if (!origin || clientOrigins.has(origin)) return callback(null, true);
  callback(new Error('Origin is not allowed'));
}, credentials: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));

const authOf = (res: express.Response) => res.locals.auth as AuthContext;

const authenticate: express.RequestHandler = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
    if (!bearer || !jwtSecret) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const claims = jwt.verify(bearer, jwtSecret) as AuthTokenClaims;
    if (!claims.sub || typeof claims.organizationId !== 'string' || !isUserRole(claims.role)) {
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }
    const auth: AuthContext = {
      userId: String(claims.sub),
      organizationId: claims.organizationId,
      role: claims.role,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
    };
    res.locals.auth = auth;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication required' });
  }
};

app.get('/live', (_req, res) => res.json({ ok: true }));
app.get('/health', async (_req, res, next) => { try { await prisma.$queryRawUnsafe('SELECT 1'); res.json({ ok: true }); } catch (error) { next(error); } });

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  return authenticate(req, res, next);
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || !password) return void res.status(400).json({ error: 'Email/username and password are required' });
    const rows = await prisma.$queryRawUnsafe<PortalCredentialRow[]>(
      `SELECT u."id",u."organizationId",u."role",u."email",c."username",c."passwordHash",c."displayName",c."mustChangePassword",c."failedLoginAttempts",c."lockedUntil",to_jsonb(u) AS "userRecord" FROM "User" u JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE LOWER(u."email")=LOWER($1) OR LOWER(c."username")=LOWER($1) LIMIT 1`,
      identifier,
    );
    const row = rows[0];
    if (!row || !isUserRole(row.role)) return void res.status(401).json({ error: 'Invalid credentials' });
    if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) return void res.status(423).json({ error: 'Account temporarily locked' });
    if (!verifyPortalPassword(password, row.passwordHash)) {
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePortalCredential" SET "failedLoginAttempts"=COALESCE("failedLoginAttempts",0)+1,"lockedUntil"=CASE WHEN COALESCE("failedLoginAttempts",0)+1>=5 THEN NOW()+INTERVAL '15 minutes' ELSE "lockedUntil" END,"updatedAt"=NOW() WHERE "userId"=$1`,row.id);
      return void res.status(401).json({ error: 'Invalid credentials' });
    }
    await prisma.$executeRawUnsafe(`UPDATE "EmployeePortalCredential" SET "failedLoginAttempts"=0,"lockedUntil"=NULL,"updatedAt"=NOW() WHERE "userId"=$1`,row.id);
    const token=jwt.sign({organizationId:row.organizationId,role:row.role},jwtSecret!,{subject:row.id,expiresIn:'8h'});
    const account:LoginAccount={userId:row.id,organizationId:row.organizationId,role:row.role,email:row.email||'',username:row.username||'',displayName:row.displayName||row.email||'',mustChangePassword:Boolean(row.mustChangePassword)};
    res.json({data:{token,user:account,landingRoute:'/desktop'}});
  } catch(error){next(error)}
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
const audit = async (auth: Partial<AuthContext>,action: string,resourceType: string,resourceId?: string,metadata?: object) => {
  try {
    const organizationId = auth.organizationId ?? process.env.CAREERS_ORGANIZATION_ID?.trim() ?? null;
    const userId = auth.userId ?? process.env.PRIMARY_ADMIN_USER_ID?.trim() ?? null;
    let actorEmail = auth.email?.trim().toLowerCase() || null;
    if (!actorEmail && userId) {
      try { const users=await prisma.$queryRawUnsafe<Array<{email:string|null}>>(`SELECT "email" FROM "User" WHERE "id"=$1 LIMIT 1`,userId); actorEmail=users[0]?.email?.trim().toLowerCase()||null; } catch {}
    }
    actorEmail ||= administratorEmail;
    const ipAddress = auth.ipAddress?.trim() || '0.0.0.0';
    const userAgent = auth.userAgent?.trim() || 'Sulandra Health API';
    if (!auditColumns) auditColumns=await prisma.$queryRawUnsafe<AuditColumn[]>(`SELECT "column_name" AS "columnName","is_nullable" AS "isNullable","data_type" AS "dataType","udt_name" AS "udtName","column_default" AS "columnDefault" FROM "information_schema"."columns" WHERE "table_schema"=current_schema() AND "table_name"='AuditEvent' ORDER BY "ordinal_position"`);
    const available=new Map(auditColumns.map(column=>[column.columnName,column]));
    const metadataJson=JSON.stringify(metadata??{});
    const knownValues=new Map<string,{value:unknown;cast?:string}>([['id',{value:randomUUID()}],['organizationId',{value:organizationId}],['legalEntityId',{value:auth.legalEntityId??null}],['userId',{value:userId}],['actorId',{value:userId}],['actorUserId',{value:userId}],['performedById',{value:userId}],['actorEmail',{value:actorEmail}],['actorRole',{value:auth.role??UserRole.ADMINISTRATOR}],['ipAddress',{value:ipAddress}],['userAgent',{value:userAgent}],['action',{value:action}],['resourceType',{value:resourceType}],['resourceId',{value:resourceId??null}],['metadata',{value:metadataJson,cast:'::jsonb'}],['details',{value:metadataJson,cast:'::jsonb'}],['changes',{value:metadataJson,cast:'::jsonb'}],['description',{value:`${action} ${resourceType}${resourceId?` ${resourceId}`:''}`}]]);
    const candidates:Array<{name:string;value:unknown;cast?:string}>=[];
    for(const [name,candidate] of knownValues) if(available.has(name)) candidates.push({name,...candidate});
    for(const column of auditColumns){if(column.isNullable==='YES'||column.columnDefault||candidates.some(candidate=>candidate.name===column.columnName)||column.columnName==='createdAt')continue;const jsonLike=column.dataType==='json'||column.dataType==='jsonb'||column.udtName==='jsonb';const booleanLike=column.dataType==='boolean'||column.udtName==='bool';const numericLike=['smallint','integer','bigint','numeric','real','double precision'].includes(column.dataType);const timestampLike=column.dataType.includes('timestamp')||column.udtName.includes('timestamp');candidates.push({name:column.columnName,value:jsonLike?metadataJson:booleanLike?false:numericLike?0:timestampLike?new Date():'',cast:jsonLike?'::jsonb':undefined});}
    const columnSql=candidates.map(candidate=>`"${candidate.name}"`);const valueSql=candidates.map((candidate,index)=>`$${index+1}${candidate.cast||''}`);if(available.has('createdAt')){columnSql.push('"createdAt"');valueSql.push('NOW()');}if(!candidates.length)throw new Error('AuditEvent has no compatible columns.');await prisma.$executeRawUnsafe(`INSERT INTO "AuditEvent" (${columnSql.join(',')}) VALUES (${valueSql.join(',')})`,...candidates.map(candidate=>candidate.value));
  } catch(error){console.warn('[audit] event could not be persisted',{action,resourceType,error});}
};

const portalCredentialSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  temporaryPassword: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(160).optional(),
}).refine((value)=>Boolean(value.userId||value.email),{message:'User ID or employee email is required'});
const provisionPortalCredential: express.RequestHandler = async (req,res,next)=>{try{const auth=authOf(res);const input=portalCredentialSchema.parse({...req.body,userId:req.params.userId||req.body?.userId});const users=await prisma.$queryRawUnsafe<AdministratorRow[]>(`SELECT "id","organizationId","role","email" FROM "User" WHERE "organizationId"=$1 AND (($2::text IS NOT NULL AND "id"=$2) OR ($3::text IS NOT NULL AND LOWER("email")=LOWER($3))) LIMIT 1`,auth.organizationId,input.userId??null,input.email??null);const user=users[0];if(!user||!isUserRole(user.role))return void res.status(404).json({error:'Employee account was not found'});const passwordHash=hashPortalPassword(input.temporaryPassword);await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePortalCredential" ("userId","username","passwordHash","displayName","mustChangePassword","createdAt","updatedAt") VALUES ($1,$2,$3,$4,TRUE,NOW(),NOW()) ON CONFLICT ("userId") DO UPDATE SET "username"=EXCLUDED."username","passwordHash"=EXCLUDED."passwordHash","displayName"=EXCLUDED."displayName","mustChangePassword"=TRUE,"failedLoginAttempts"=0,"lockedUntil"=NULL,"updatedAt"=NOW()`,user.id,input.username,passwordHash,input.displayName??null);await audit(auth,'PROVISION_EMPLOYEE_PORTAL_ACCESS','User',user.id,{username:input.username});res.status(201).json({data:{userId:user.id,username:input.username}})}catch(error){next(error)}};
app.post('/api/admin/users/:userId/portal-credentials',requireRoles(UserRole.ADMINISTRATOR,UserRole.COO),provisionPortalCredential);
app.post('/api/admin/employee-portal/credentials',requireRoles(UserRole.ADMINISTRATOR,UserRole.COO),provisionPortalCredential);

registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });
registerEmployeeSupportRoutes({ app, prisma, authOf, requireRoles });
registerSIACopilotProfileRoutes({ app, prisma, authOf, requireRoles });
registerSIARoutes({ app, prisma, authOf, requireRoles });
registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });
registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
  const httpError=error as HttpError;const status=httpError.status??httpError.statusCode??500;if(status>=500)console.error(error);res.status(status).json({error:httpError.message||'Internal server error'});
});
app.listen(port,'0.0.0.0',()=>{console.log(`SPIRE API listening on 0.0.0.0:${port}`)});
const shutdown=async(signal:string)=>{console.log(`Received ${signal}; disconnecting database client.`);await prisma.$disconnect();process.exit(0)};
process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));
