import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { z, ZodError } from 'zod';
import { registerCareersRoutes } from './careers-routes.js';
import { registerAuthRecoveryRoutes } from './auth-recovery-routes.js';
import { registerConsultationRoutes } from './consultation-routes.js';
import { registerClinicalRoutes } from './clinical-routes.js';
import { registerSpireCareWorkstationRoutes } from './spire-care-workstation-routes.js';
import { registerOfferProgressRoute } from './offer-progress-route.js';
import { registerOfferSendRoute } from './offer-send-route.js';
import { registerOfferAcceptancePdfRoute } from './offer-acceptance-pdf-route.js';
import { registerProfessionalOfferFormsRoute } from './professional-offer-forms-route.js';
import { registerOfferOnboardingRoutes } from './offer-onboarding-routes.js';
import { registerW4Routes } from './w4-routes.js';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
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

type PortalLoginAccount = LoginAccount & {
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
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
  UserRole.DOO,
]);
const administrationRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
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
  if (role === UserRole.DOO) return 'Chief Operating Officer';
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
      { id: 'sulandra-desktop', name: 'Sulandra Desktop', route: '/desktop', enabled: true },
      { id: 'spire', name: 'S.P.I.R.E.', route: '/spire', enabled: canReadCharts, readOnly: canReadCharts && !canWriteCharts },
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
  const organizationId = req.header('x-organization-id') ?? process.env.CAREERS_ORGANIZATION_ID?.trim();
  const userId = req.header('x-user-id') ?? process.env.PRIMARY_ADMIN_USER_ID?.trim();
  const roleValue = req.header('x-user-role') ?? UserRole.ADMINISTRATOR;
  if (!organizationId || !userId || !isUserRole(roleValue)) return null;
  return { organizationId, userId, role: roleValue, email: req.header('x-user-email')?.trim().toLowerCase() || administratorEmail };
};

const tokenAuth = (req: express.Request): AuthContext | null => {
  const token = bearerToken(req.header('authorization'));
  if (!token || !jwtSecret) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return null;
    const claims = decoded as AuthTokenClaims;
    if (typeof claims.sub !== 'string' || typeof claims.organizationId !== 'string' || !isUserRole(claims.role) || typeof claims.exp !== 'number') return null;
    return { userId: claims.sub, organizationId: claims.organizationId, role: claims.role, email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : administratorEmail };
  } catch { return null; }
};

const loginSchema = z.object({ email: z.string().trim().optional(), username: z.string().trim().optional(), identifier: z.string().trim().optional(), password: z.string().min(1).max(1_024) }).refine((value) => Boolean(value.email || value.username || value.identifier), { message: 'Username or email is required' });

const resolveAdministrator = async (): Promise<AuthContext & { email: string }> => {
  let administrator: AdministratorRow | undefined;
  try {
    const rows = await prisma.$queryRawUnsafe<AdministratorRow[]>(`SELECT "id", "organizationId", "role", "email" FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1`, administratorEmail);
    administrator = rows[0];
  } catch (error) { console.warn('[auth] administrator lookup by email failed', error); }
  if (!administrator) {
    const fallback = await prisma.$queryRawUnsafe<AdministratorRow[]>(`SELECT "id", "organizationId", "role", "email" FROM "User" WHERE "role"::text = 'ADMINISTRATOR' ORDER BY "createdAt" ASC LIMIT 1`);
    administrator = fallback[0];
  }
  if (!administrator || !isUserRole(administrator.role)) throw Object.assign(new Error('Administrator account is not configured'), { status: 503 });
  return { userId: administrator.id, organizationId: administrator.organizationId, role: administrator.role, email: administrator.email?.trim().toLowerCase() || administratorEmail };
};

const resolvePortalAccount = async (identifier: string): Promise<PortalLoginAccount | null> => {
  const rows = await prisma.$queryRawUnsafe<PortalCredentialRow[]>(`SELECT u."id",u."organizationId",u."role",u."email",c."username",c."passwordHash",c."displayName",c."mustChangePassword",c."failedLoginAttempts",c."lockedUntil",to_jsonb(u) AS "userRecord" FROM "EmployeePortalCredential" c JOIN "User" u ON u."id"=c."userId" WHERE LOWER(c."username")=LOWER($1) OR LOWER(COALESCE(u."email",''))=LOWER($1) LIMIT 1`, identifier);
  const row=rows[0]; if(!row||!isUserRole(row.role))return null;
  const lockedUntil=row.lockedUntil?new Date(row.lockedUntil):null;
  const displayName=row.displayName||[stringField(row.userRecord,'firstName'),stringField(row.userRecord,'middleName'),stringField(row.userRecord,'lastName')].filter(Boolean).join(' ')||row.email||row.username||'Sulandra Health Employee';
  return {userId:row.id,organizationId:row.organizationId,role:row.role,email:row.email?.trim().toLowerCase()||'',username:row.username||row.email||row.id,displayName,mustChangePassword:Boolean(row.mustChangePassword),passwordHash:row.passwordHash,failedLoginAttempts:row.failedLoginAttempts||0,lockedUntil};
};

const recordFailedPortalLogin=async(userId:string)=>{await prisma.$executeRawUnsafe(`UPDATE "EmployeePortalCredential" SET "failedLoginAttempts"="failedLoginAttempts"+1,"lockedUntil"=CASE WHEN "failedLoginAttempts"+1>=5 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END,"updatedAt"=NOW() WHERE "userId"=$1`,userId)};
const recordSuccessfulPortalLogin=async(userId:string)=>{await prisma.$executeRawUnsafe(`UPDATE "EmployeePortalCredential" SET "failedLoginAttempts"=0,"lockedUntil"=NULL,"lastSignedInAt"=NOW(),"updatedAt"=NOW() WHERE "userId"=$1`,userId)};

const buildSessionPayload=(account:LoginAccount)=>{if(!jwtSecret)throw Object.assign(new Error('Employee sign-in is not configured'),{status:503});const token=jwt.sign({organizationId:account.organizationId,role:account.role},jwtSecret,{algorithm:'HS256',subject:account.userId,expiresIn:'8h'});const expiresIn=8*60*60;const expiresAt=new Date(Date.now()+expiresIn*1_000).toISOString();const nameParts=account.displayName.split(/\s+/).filter(Boolean);const firstName=nameParts.shift()||account.username;const lastName=nameParts.pop()||'';const middleName=nameParts.join(' ');const organizationName=process.env.ORGANIZATION_NAME?.trim()||'Sulandra Health';const authorization=accessForRole(account.role);const organization={id:account.organizationId,organizationId:account.organizationId,name:organizationName};const user={id:account.userId,userId:account.userId,email:account.email,username:account.username,displayName:account.displayName,firstName,middleName,lastName,role:account.role,roleTitle:roleTitle(account.role),mustChangePassword:account.mustChangePassword,organizationId:account.organizationId,organization};return{token,accessToken:token,tokenType:'Bearer',expiresIn,expiresAt,user,employee:user,organization,...authorization}};

const authOf=(res:express.Response):AuthContext=>{const auth=res.locals.auth as AuthContext|undefined;if(!auth)throw Object.assign(new Error('Authentication is required'),{status:401});return auth};
const requireRoles=(...roles:UserRole[])=>async(req:express.Request,res:express.Response,next:express.NextFunction)=>{try{const auth=internalAuth(req)||tokenAuth(req);if(!auth)throw Object.assign(new Error('Authentication is required'),{status:401});if(!roles.includes(auth.role))throw Object.assign(new Error('Permission denied'),{status:403});res.locals.auth={...auth,ipAddress:req.ip,userAgent:req.get('user-agent')};next()}catch(error){next(error)}};
const audit=async(auth:AuthContext,action:string,resourceType:string,resourceId?:string,metadata?:unknown)=>{try{await prisma.$executeRawUnsafe(`INSERT INTO "AuditEvent"("id","organizationId","userId","action","resourceType","resourceId","metadata","createdAt") VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())`,randomUUID(),auth.organizationId,auth.userId,action,resourceType,resourceId??null,metadata==null?null:JSON.stringify(metadata))}catch(error){console.warn('[audit] unable to persist event',error)}};

app.set('trust proxy',1);
app.use(helmet({crossOriginResourcePolicy:false}));
app.use(cors({origin:(origin,callback)=>{if(!origin||clientOrigins.has(origin)){callback(null,true);return}callback(new Error('Origin is not allowed'))},credentials:true}));
app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({extended:true,limit:'50mb'}));
app.use((req,res,next)=>{const auth=internalAuth(req)||tokenAuth(req);if(auth)res.locals.auth={...auth,ipAddress:req.ip,userAgent:req.get('user-agent')};next()});

const authLimiter=rateLimit({windowMs:15*60*1000,max:50,standardHeaders:true,legacyHeaders:false});
app.post('/api/employee/login',authLimiter,async(req,res,next)=>{try{const input=loginSchema.parse(req.body??{});const identifier=(input.identifier||input.username||input.email||'').trim();const account=await resolvePortalAccount(identifier);if(!account){res.status(401).json({error:'Invalid username/email or password'});return}if(account.lockedUntil&&account.lockedUntil.getTime()>Date.now()){res.status(423).json({error:'Account is temporarily locked. Please try again later.'});return}if(!verifyPortalPassword(input.password,account.passwordHash)){await recordFailedPortalLogin(account.userId);res.status(401).json({error:'Invalid username/email or password'});return}await recordSuccessfulPortalLogin(account.userId);res.json({data:buildSessionPayload(account)})}catch(error){next(error)}});

registerAuthRecoveryRoutes(app,prisma,{authOf,requireRoles,audit,hashPortalPassword});

app.get('/api/admin/desktop-profile',requireRoles(...administrationRoles),async(_req,res,next)=>{try{const auth=authOf(res);const rows=await prisma.$queryRawUnsafe<Array<{profile:unknown;wallpapers:unknown;updatedAt:Date}>>(`SELECT "profile","wallpapers","updatedAt" FROM "AdminDesktopProfile" WHERE "userId"=$1 AND "organizationId"=$2 LIMIT 1`,auth.userId,auth.organizationId);res.json({data:rows[0]??{profile:{},wallpapers:{},updatedAt:null}})}catch(error){next(error)}});
app.put('/api/admin/desktop-profile',requireRoles(...administrationRoles),async(req,res,next)=>{try{const auth=authOf(res);const profileJson=JSON.stringify(req.body?.profile??{});const wallpapersJson=JSON.stringify(req.body?.wallpapers??{});const totalBytes=Buffer.byteLength(profileJson)+Buffer.byteLength(wallpapersJson);if(totalBytes>18*1024*1024){res.status(413).json({error:'Desktop profile and wallpaper data must be smaller than 18 MB.'});return}await prisma.$executeRawUnsafe(`INSERT INTO "AdminDesktopProfile"("userId","organizationId","profile","wallpapers","createdAt","updatedAt") VALUES($1,$2,$3::jsonb,$4::jsonb,NOW(),NOW()) ON CONFLICT("userId") DO UPDATE SET "organizationId"=EXCLUDED."organizationId","profile"=EXCLUDED."profile","wallpapers"=EXCLUDED."wallpapers","updatedAt"=NOW()`,auth.userId,auth.organizationId,profileJson,wallpapersJson);await audit(auth,'UPDATE_ADMIN_DESKTOP_PROFILE','AdminDesktopProfile',auth.userId,{wallpaperServices:Object.keys(req.body?.wallpapers??{})});res.json({data:{saved:true,updatedAt:new Date().toISOString()}})}catch(error){next(error)}});

registerClinicalRoutes(app,prisma,{authOf});
registerSpireCareWorkstationRoutes(app,prisma,{authOf});
registerOfferProgressRoute(app,prisma,{authOf,requireRoles});
registerOfferSendRoute(app,prisma,{authOf,requireRoles,audit});
registerOfferAcceptancePdfRoute(app,prisma,{audit});
registerProfessionalOfferFormsRoute(app,prisma);
registerOfferOnboardingRoutes(app,prisma,{authOf,requireRoles,audit});
registerW4Routes(app,prisma,{authOf,requireRoles,audit});
registerConsultationRoutes(app,prisma);
registerCareersRoutes(app,prisma,{authOf,requireRoles,audit});

app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(error instanceof ZodError){res.status(400).json({error:'Validation failed',details:error.issues});return}const httpError=error as HttpError;const status=httpError.status??httpError.statusCode??500;if(status>=500)console.error(error);res.status(status).json({error:httpError.message||'Internal server error'})});
app.listen(port,'0.0.0.0',()=>console.log(`SPIRE API listening on 0.0.0.0:${port}`));
const shutdown=async(signal:string)=>{console.log(`Received ${signal}; disconnecting database client.`);await prisma.$disconnect();process.exit(0)};
process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));
