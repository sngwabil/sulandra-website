import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bootstrapPath=path.join(root,'api/src/onboarding-bootstrap.ts');
let source=await readFile(bootstrapPath,'utf8');
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const securityImport="import { createEmployeeSession, recordLoginEvent, validateEmployeeSession, verifyEmployeeLoginMfa } from './employee-auth-security.js';";
if(!source.includes(securityImport))source=source.replace(careersImport,`${careersImport}\n${securityImport}`);
source=source.replace(
  /const tokenAuth = \(req: express\.Request\): AuthContext \| null => \{[\s\S]*?\n\};\n\nconst loginSchema/,
`const tokenAuth = async (req: express.Request): Promise<AuthContext | null> => {
  const token = bearerToken(req.header('authorization'));
  if (!token || !jwtSecret) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return null;
    const claims = decoded as AuthTokenClaims;
    if (typeof claims.sub !== 'string' || typeof claims.organizationId !== 'string' || !isUserRole(claims.role) || typeof claims.exp !== 'number' || typeof claims.jti !== 'string') return null;
    const validSession = await validateEmployeeSession(prisma, { organizationId: claims.organizationId, userId: claims.sub, sessionId: claims.jti, portal: 'EMPLOYEE' });
    if (!validSession) return null;
    return { userId: claims.sub, organizationId: claims.organizationId, role: claims.role, sessionId: claims.jti, email: typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : administratorEmail } as AuthContext;
  } catch { return null; }
};

const loginSchema`);
source=source.replace("  password: z.string().min(1).max(1_024),","  password: z.string().min(1).max(1_024),\n  mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),");
source=source.replace('const buildSessionPayload = (account: LoginAccount) => {','const buildSessionPayload = async (account: LoginAccount) => {');
source=source.replace("  const token = jwt.sign(\n    {\n      organizationId: account.organizationId,\n      role: account.role,\n    },", "  const sessionId = randomUUID();\n  const token = jwt.sign(\n    {\n      organizationId: account.organizationId,\n      role: account.role,\n    },");
source=source.replace("      subject: account.userId,\n      expiresIn: '8h',", "      subject: account.userId,\n      jwtid: sessionId,\n      expiresIn: '8h',");
source=source.replace("  return {\n    ...session,\n    session,\n    data: session,\n  };\n};\n\napp.disable", "  await createEmployeeSession(prisma, { organizationId: account.organizationId, userId: account.userId, expiresAt: new Date(expiresAt) });\n  return {\n    ...session,\n    sessionId,\n    session: { ...session, sessionId },\n    data: { ...session, sessionId },\n  };\n};\n\napp.disable");
source=source.replace("    res.json(buildSessionPayload(account));",`    const mfa = await verifyEmployeeLoginMfa(prisma, account.organizationId, account.userId, credentials.mfaCode);
    if (!mfa.verified) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: mfa.reason || 'MFA required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(401).json({ error: mfa.reason || 'Multifactor authentication is required', mfaRequired: true });
      return;
    }
    const payload = await buildSessionPayload(account);
    await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'ALLOW', reason: 'Successful login', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined, sessionId: payload.sessionId });
    res.json(payload);`);
source=source.replace("app.use((req, res, next) => {\n  if (req.path.startsWith('/public/') || req.path === '/health' || req.path === '/live') {","app.use(async (req, res, next) => {\n  if (req.path.startsWith('/public/') || req.path.startsWith('/internal/') || req.path === '/health' || req.path === '/live') {");
source=source.replace('  const auth = internalAuth(req) ?? tokenAuth(req);','  const auth = internalAuth(req) ?? await tokenAuth(req);');
if(!source.includes('validateEmployeeSession(prisma'))throw new Error('Failed to install revocable session validation');
if(!source.includes('verifyEmployeeLoginMfa(prisma'))throw new Error('Failed to install MFA login verification');
await writeFile(bootstrapPath,source,'utf8');
await import('./install-employee360-scope-enforcement.mjs');
await import('./install-employee-auth-admin-routes.mjs');
console.log('Employee authentication now uses revocable server-side sessions, portal controls, MFA verification, login history, global Employee 360 scope enforcement, and full auth administration routes.');
