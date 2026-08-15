import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Ordinary employee navigation remains JWT-only after sign-in so every normal API
// call does not hit the session table. Privileged Administrator/CEO/DOO sessions
// are different: they remain server-revocable and receive a 30-minute idle backstop.
const securityPath = path.join(root, 'api/src/employee-auth-security.ts');
let security = await readFile(securityPath, 'utf8');
const oldValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal||'EMPLOYEE'))[0];if(control&&control.enabled===false)return false;await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
const priorPortalAwareValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;if(input.portal){const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal))[0];if(control&&control.enabled===false)return false}await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
const privilegedAwareValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string;privileged?:boolean}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;if(input.privileged&&Date.now()-new Date(session.lastSeenAt).getTime()>30*60*1000){await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"revokedAt\"=NOW(),\"revokedById\"=$1,\"revocationReason\"='Privileged session idle timeout' WHERE \"id\"=$2 AND \"revokedAt\" IS NULL`,input.userId,input.sessionId);return false}if(input.portal){const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal))[0];if(control&&control.enabled===false)return false}await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
if (security.includes(oldValidator)) security = security.replace(oldValidator, privilegedAwareValidator);
if (security.includes(priorPortalAwareValidator)) security = security.replace(priorPortalAwareValidator, privilegedAwareValidator);
if (!security.includes('privileged?:boolean') || !security.includes('Privileged session idle timeout')) {
  throw new Error('Privileged session validator repair was not applied.');
}
await writeFile(securityPath, security, 'utf8');

const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
let bootstrap = await readFile(bootstrapPath, 'utf8');

// install-employee-auth-security.mjs may first produce a database-backed tokenAuth.
// Replace it with a hybrid boundary: ordinary roles validate the signed JWT only;
// privileged Admin/CEO/DOO roles additionally validate the revocable server session.
const tokenAuthPattern = /const tokenAuth = async \(req: express\.Request\): Promise<AuthContext \| null> => \{[\s\S]*?\n\};\n\nconst loginSchema/;
const hybridTokenAuth = `const privilegedSessionRoles = new Set(['ADMINISTRATOR', 'CEO', 'DOO']);
const tokenAuth = async (req: express.Request): Promise<AuthContext | null> => {
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
    ) return null;
    const sessionId = typeof claims.jti === 'string' ? claims.jti : '';
    if (privilegedSessionRoles.has(String(claims.role))) {
      if (!sessionId) return null;
      const validPrivilegedSession = await validateEmployeeSession(prisma, {
        organizationId: claims.organizationId,
        userId: claims.sub,
        sessionId,
        privileged: true,
      });
      if (!validPrivilegedSession) return null;
    }
    return {
      userId: claims.sub,
      organizationId: claims.organizationId,
      role: claims.role,
      sessionId: sessionId || undefined,
      email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : administratorEmail,
    } as AuthContext;
  } catch {
    return null;
  }
};

const loginSchema`;
if (tokenAuthPattern.test(bootstrap) && !bootstrap.includes('const privilegedSessionRoles = new Set')) {
  bootstrap = bootstrap.replace(tokenAuthPattern, hybridTokenAuth);
}
bootstrap = bootstrap.replace('  const auth = internalAuth(req) ?? tokenAuth(req);', '  const auth = internalAuth(req) ?? await tokenAuth(req);');
bootstrap = bootstrap.replace('  const auth = internalAuth(req) ?? await await tokenAuth(req);', '  const auth = internalAuth(req) ?? await tokenAuth(req);');

if (!bootstrap.includes("const privilegedSessionRoles = new Set(['ADMINISTRATOR', 'CEO', 'DOO'])")) {
  throw new Error('Privileged session role boundary was not installed.');
}
if (!bootstrap.includes('privileged: true')) throw new Error('Privileged JWTs do not validate the server session.');
if (!bootstrap.includes('const tokenAuth = async (req: express.Request): Promise<AuthContext | null> =>')) {
  throw new Error('Hybrid Sulandra session authentication was not installed.');
}
if (!bootstrap.includes('const auth = internalAuth(req) ?? await tokenAuth(req);')) {
  throw new Error('Authentication middleware is not awaiting the hybrid token validator.');
}
await writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('Unified Sulandra SSO hardened: normal roles stay JWT-fast; Administrator/CEO/DOO sessions remain server-revocable with a 30-minute idle backstop.');
