import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep portal-specific session administration intact without forcing ordinary
// employee API traffic through the session table. Privileged Admin/CEO/DOO JWTs
// are validated against their revocable server session directly in tokenAuth.
const securityPath = path.join(root, 'api/src/employee-auth-security.ts');
let security = await readFile(securityPath, 'utf8');
const oldValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal||'EMPLOYEE'))[0];if(control&&control.enabled===false)return false;await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
const portalAwareValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;if(input.portal){const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal))[0];if(control&&control.enabled===false)return false}await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
const privilegedAwareValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string;privileged?:boolean}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;if(input.privileged&&Date.now()-new Date(session.lastSeenAt).getTime()>30*60*1000){await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"revokedAt\"=NOW(),\"revokedById\"=$1,\"revocationReason\"='Privileged session idle timeout' WHERE \"id\"=$2 AND \"revokedAt\" IS NULL`,input.userId,input.sessionId);return false}if(input.portal){const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal))[0];if(control&&control.enabled===false)return false}await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
if (security.includes(oldValidator)) security = security.replace(oldValidator, portalAwareValidator);
if (security.includes(privilegedAwareValidator)) security = security.replace(privilegedAwareValidator, portalAwareValidator);
if (!security.includes('if(input.portal){const control=')) throw new Error('Portal-specific session validator repair was not applied.');
await writeFile(securityPath, security, 'utf8');

const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
let bootstrap = await readFile(bootstrapPath, 'utf8');

// Hybrid SSO boundary: ordinary roles validate only the signed JWT; privileged
// Admin/CEO/DOO roles additionally require an active server session and receive a
// 30-minute idle backstop. This keeps explicit sign-out revocation effective while
// avoiding repeated schema-initialization work on every privileged request.
const tokenAuthPattern = /const tokenAuth = async \(req: express\.Request\): Promise<AuthContext \| null> => \{[\s\S]*?\n\};\n\nconst loginSchema/;
const hybridTokenAuth = `const privilegedSessionRoles = new Set(['ADMINISTRATOR', 'CEO', 'DOO']);
const tokenAuth = async (req: express.Request): Promise<AuthContext | null> => {
  // validateEmployeeSession(prisma) remains the explicit portal validator; the
  // privileged JWT check below validates the same revocable session directly.
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
      const sessionRows = await prisma.$queryRawUnsafe<Array<{ lastSeenAt: Date | string }>>(
        \`SELECT "lastSeenAt" FROM "EmployeeAuthSession"
         WHERE "id"=$1 AND "organizationId"=$2 AND "userId"=$3
           AND "revokedAt" IS NULL AND "expiresAt">NOW()
         LIMIT 1\`,
        sessionId,
        claims.organizationId,
        claims.sub,
      ).catch(() => []);
      const privilegedSession = sessionRows[0];
      if (!privilegedSession) return null;
      if (Date.now() - new Date(privilegedSession.lastSeenAt).getTime() > 30 * 60 * 1000) {
        await prisma.$executeRawUnsafe(
          \`UPDATE "EmployeeAuthSession"
           SET "revokedAt"=NOW(),"revokedById"=$1,"revocationReason"='Privileged session idle timeout'
           WHERE "id"=$2 AND "revokedAt" IS NULL\`,
          claims.sub,
          sessionId,
        ).catch(() => undefined);
        return null;
      }
      await prisma.$executeRawUnsafe(
        \`UPDATE "EmployeeAuthSession" SET "lastSeenAt"=NOW() WHERE "id"=$1\`,
        sessionId,
      ).catch(() => undefined);
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
bootstrap = bootstrap.replace('  const auth = internal ?? tokenAuth(req);', '  const auth = internal ?? await tokenAuth(req);');
bootstrap = bootstrap.replace('  const auth = internalAuth(req) ?? await await tokenAuth(req);', '  const auth = internalAuth(req) ?? await tokenAuth(req);');
bootstrap = bootstrap.replace('  const auth = internal ?? await await tokenAuth(req);', '  const auth = internal ?? await tokenAuth(req);');

if (!bootstrap.includes("const privilegedSessionRoles = new Set(['ADMINISTRATOR', 'CEO', 'DOO'])")) throw new Error('Privileged session role boundary was not installed.');
if (!bootstrap.includes("'Privileged session idle timeout'")) throw new Error('Privileged idle-session revocation was not installed.');
if (!bootstrap.includes('SELECT "lastSeenAt" FROM "EmployeeAuthSession"')) throw new Error('Privileged JWTs do not validate the server session.');
if (!bootstrap.includes('validateEmployeeSession(prisma) remains the explicit portal validator')) throw new Error('Hybrid token validation lost its idempotency marker.');
if (!bootstrap.includes('const tokenAuth = async (req: express.Request): Promise<AuthContext | null> =>')) throw new Error('Hybrid Sulandra session authentication was not installed.');
const awaitsHybridAuth = bootstrap.includes('const auth = internalAuth(req) ?? await tokenAuth(req);')
  || bootstrap.includes('const auth = internal ?? await tokenAuth(req);');
if (!awaitsHybridAuth) throw new Error('Authentication middleware is not awaiting the hybrid token validator.');
await writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('Unified Sulandra SSO hardened: normal roles stay JWT-fast; Administrator/CEO/DOO sessions are tab-only, server-revocable, idle-limited, and compatible with scoped mobile OAuth.');