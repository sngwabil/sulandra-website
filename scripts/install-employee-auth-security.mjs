import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bootstrapPath=path.join(root,'api/src/onboarding-bootstrap.ts');
let source=await readFile(bootstrapPath,'utf8');
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const oldSecurityImport="import { createEmployeeSession, recordLoginEvent, validateEmployeeSession, verifyEmployeeLoginMfa } from './employee-auth-security.js';";
const securityImport="import { beginEmployeeSmsLoginMfa, createEmployeeSession, recordLoginEvent, validateEmployeeSession, verifyEmployeeLoginMfa, verifyEmployeeSmsLoginMfa } from './employee-auth-security.js';";
if(source.includes(oldSecurityImport))source=source.replace(oldSecurityImport,securityImport);
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

// These edits must be safe when typecheck and build run sequentially in the same checkout.
if(!source.includes("mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),")){
  source=source.replace("  password: z.string().min(1).max(1_024),","  password: z.string().min(1).max(1_024),\n  mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),");
}
if(!source.includes("mfaChallengeId: z.string().trim().uuid().optional(),")){
  source=source.replace("  mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),","  mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),\n  mfaChallengeId: z.string().trim().uuid().optional(),");
}
source=source.replace('const buildSessionPayload = (account: LoginAccount) => {','const buildSessionPayload = async (account: LoginAccount) => {');
if(!source.includes('  const sessionId = randomUUID();')){
  source=source.replace("  const token = jwt.sign(\n    {\n      organizationId: account.organizationId,\n      role: account.role,\n    },", "  const sessionId = randomUUID();\n  const token = jwt.sign(\n    {\n      organizationId: account.organizationId,\n      role: account.role,\n    },");
}
if(!source.includes('      jwtid: sessionId,')){
  source=source.replace("      subject: account.userId,\n      expiresIn: '8h',", "      subject: account.userId,\n      jwtid: sessionId,\n      expiresIn: '8h',");
}
if(!source.includes('await createEmployeeSession(prisma')){
  source=source.replace("  return {\n    ...session,\n    session,\n    data: session,\n  };\n};\n\napp.disable", "  await createEmployeeSession(prisma, { organizationId: account.organizationId, userId: account.userId, expiresAt: new Date(expiresAt), sessionId });\n  return {\n    ...session,\n    sessionId,\n    session: { ...session, sessionId },\n    data: { ...session, sessionId },\n  };\n};\n\napp.disable");
}

const smsLoginMarker='const smsMfaInput = {';
if(!source.includes(smsLoginMarker)){
  const legacyTotpBlock=`    const mfa = await verifyEmployeeLoginMfa(prisma, account.organizationId, account.userId, credentials.mfaCode);
    if (!mfa.verified) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: mfa.reason || 'MFA required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(401).json({ error: mfa.reason || 'Multifactor authentication is required', mfaRequired: true });
      return;
    }
    const payload = await buildSessionPayload(account);
    await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'ALLOW', reason: 'Successful login', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined, sessionId: payload.sessionId });
    res.json(payload);`;
  const smsBlock=`    const smsMfaInput = {
      organizationId: account.organizationId,
      userId: account.userId,
      role: account.role,
      email: account.email,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
    };
    const smsMfa = credentials.mfaChallengeId || credentials.mfaCode
      ? await verifyEmployeeSmsLoginMfa(prisma, { ...smsMfaInput, challengeId: credentials.mfaChallengeId, code: credentials.mfaCode })
      : await beginEmployeeSmsLoginMfa(prisma, smsMfaInput);
    const issuedChallengeId = 'challengeId' in smsMfa ? String(smsMfa.challengeId || '') : '';
    const issuedMaskedPhone = 'maskedPhone' in smsMfa ? String(smsMfa.maskedPhone || '') : '';
    const issuedExpiresIn = 'expiresIn' in smsMfa ? Number(smsMfa.expiresIn || 300) : 300;
    if (smsMfa.required && issuedChallengeId) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: 'SMS verification challenge issued', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(202).json({
        mfaRequired: true,
        mfaMethod: 'sms',
        mfaChallengeId: issuedChallengeId,
        maskedPhone: issuedMaskedPhone,
        expiresIn: issuedExpiresIn,
        message: 'A 6-digit security code was sent to your phone.',
      });
      return;
    }
    if (smsMfa.required && !smsMfa.verified) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: smsMfa.reason || 'SMS MFA required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status('status' in smsMfa && smsMfa.status ? smsMfa.status : 401).json({ error: smsMfa.reason || 'SMS verification is required', mfaRequired: true, mfaMethod: 'sms' });
      return;
    }
    if (!smsMfa.required) {
      const mfa = await verifyEmployeeLoginMfa(prisma, account.organizationId, account.userId, credentials.mfaCode);
      if (!mfa.verified) {
        await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: mfa.reason || 'MFA required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
        res.status(401).json({ error: mfa.reason || 'Multifactor authentication is required', mfaRequired: true, mfaMethod: 'totp' });
        return;
      }
    }
    const payload = await buildSessionPayload(account);
    await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'ALLOW', reason: smsMfa.required ? 'Successful login with SMS MFA' : 'Successful login', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined, sessionId: payload.sessionId });
    res.json(payload);`;
  if(source.includes(legacyTotpBlock))source=source.replace(legacyTotpBlock,smsBlock);
  else if(source.includes("    res.json(buildSessionPayload(account));"))source=source.replace("    res.json(buildSessionPayload(account));",smsBlock);
  else throw new Error('Employee auth installer could not find the login completion anchor');
}

source=source.replace("app.use((req, res, next) => {\n  if (req.path.startsWith('/public/') || req.path === '/health' || req.path === '/live') {","app.use(async (req, res, next) => {\n  if (req.path.startsWith('/public/') || req.path.startsWith('/internal/') || req.path === '/health' || req.path === '/live') {");
source=source.replace('  const auth = internalAuth(req) ?? tokenAuth(req);','  const auth = internalAuth(req) ?? await tokenAuth(req);');

const mfaMatches=source.match(/mfaCode: z\.string\(\)\.trim\(\)\.regex\(\/\^\\d\{6\}\$\/\)\.optional\(\),/g)||[];
const challengeMatches=source.match(/mfaChallengeId: z\.string\(\)\.trim\(\)\.uuid\(\)\.optional\(\),/g)||[];
const sessionMatches=source.match(/const sessionId = randomUUID\(\);/g)||[];
if(mfaMatches.length!==1)throw new Error(`Employee auth installer expected one MFA schema field, found ${mfaMatches.length}`);
if(challengeMatches.length!==1)throw new Error(`Employee auth installer expected one SMS challenge field, found ${challengeMatches.length}`);
if(sessionMatches.length!==1)throw new Error(`Employee auth installer expected one login session ID declaration, found ${sessionMatches.length}`);
if(!source.includes('validateEmployeeSession(prisma'))throw new Error('Failed to install revocable session validation');
if(!source.includes('verifyEmployeeLoginMfa(prisma'))throw new Error('Failed to install MFA login verification');
if(!source.includes('beginEmployeeSmsLoginMfa(prisma'))throw new Error('Failed to install SMS MFA challenge delivery');
if(!source.includes('verifyEmployeeSmsLoginMfa(prisma'))throw new Error('Failed to install SMS MFA challenge verification');
if(!source.includes('expiresAt: new Date(expiresAt), sessionId'))throw new Error('Failed to persist JWT jti as the server-side session id');
await writeFile(bootstrapPath,source,'utf8');
await import('./install-employee360-scope-enforcement.mjs');
await import('./install-employee-auth-admin-routes.mjs');
console.log('Employee authentication installer is idempotent and uses matching JWT/server session IDs, revocable sessions, portal controls, authenticator MFA, privileged SMS MFA, login history, scope enforcement and auth administration routes.');
