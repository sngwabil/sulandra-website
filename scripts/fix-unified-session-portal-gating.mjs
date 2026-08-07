import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep the server-side session tables and portal controls for explicit security
// administration, revocation views, MFA, and portal-specific checks. Do not make
// every ordinary API request hit EmployeeAuthSession again: the signed JWT
// established at login is the global Sulandra session credential.
const securityPath = path.join(root, 'api/src/employee-auth-security.ts');
let security = await readFile(securityPath, 'utf8');
const oldValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal||'EMPLOYEE'))[0];if(control&&control.enabled===false)return false;await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
const portalAwareValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;if(input.portal){const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal))[0];if(control&&control.enabled===false)return false}await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
if (security.includes(oldValidator)) security = security.replace(oldValidator, portalAwareValidator);
if (!security.includes('if(input.portal){const control=')) throw new Error('Portal-specific session validator repair was not applied.');
await writeFile(securityPath, security, 'utf8');

const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
let bootstrap = await readFile(bootstrapPath, 'utf8');

// install-employee-auth-security.mjs turns tokenAuth into an async database-backed
// check. Replace that entire generated block with JWT verification only. This is
// the actual SSO boundary: authenticate once at login, then authorize each API
// route by the role/claims carried by the signed, expiring token.
const tokenAuthPattern = /const tokenAuth = async \(req: express\.Request\): Promise<AuthContext \| null> => \{[\s\S]*?\n\};\n\nconst loginSchema/;
const jwtOnlyTokenAuth = `const tokenAuth = (req: express.Request): AuthContext | null => {
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
    return {
      userId: claims.sub,
      organizationId: claims.organizationId,
      role: claims.role,
      sessionId: typeof claims.jti === 'string' ? claims.jti : undefined,
      email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : administratorEmail,
    } as AuthContext;
  } catch {
    return null;
  }
};

const loginSchema`;
if (tokenAuthPattern.test(bootstrap)) {
  bootstrap = bootstrap.replace(tokenAuthPattern, jwtOnlyTokenAuth);
} else {
  // Idempotent path for a source already repaired by this script.
  bootstrap = bootstrap.replace(
    "validateEmployeeSession(prisma, { organizationId: claims.organizationId, userId: claims.sub, sessionId: claims.jti, portal: 'EMPLOYEE' })",
    'true',
  );
}
bootstrap = bootstrap.replace('  const auth = internalAuth(req) ?? await tokenAuth(req);', '  const auth = internalAuth(req) ?? tokenAuth(req);');

if (bootstrap.includes('await validateEmployeeSession(prisma')) throw new Error('Global token authentication still performs a database session lookup.');
if (bootstrap.includes("portal: 'EMPLOYEE'")) throw new Error('Global token authentication is still tied to the EMPLOYEE portal.');
if (!bootstrap.includes('const tokenAuth = (req: express.Request): AuthContext | null =>')) throw new Error('JWT-only global Sulandra session authentication was not installed.');
await writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('Unified Sulandra SSO repaired: login establishes the signed session once; normal module/API navigation uses JWT role authorization without repeated database re-authentication.');
