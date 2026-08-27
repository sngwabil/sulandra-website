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

if(!source.includes("portal: z.enum(['EMPLOYEE','ADMIN']).optional(),")){
  source=source.replace(
    "  password: z.string().min(1).max(1_024),",
    "  password: z.string().min(1).max(1_024),\n  portal: z.enum(['EMPLOYEE','ADMIN']).optional(),"
  );
}

const portalBoundaryMarker='    const requestedPortal = credentials.portal || null;';
if(!source.includes(portalBoundaryMarker)){
  const anchors=[
`    const identifier = (credentials.email || credentials.username || credentials.identifier || '')
      .trim()
      .toLowerCase();`,
`    const identifier = (credentials.identifier || credentials.username || credentials.email || '').trim().toLowerCase();`,
`    const identifier = (credentials.identifier || credentials.username || credentials.email || '').trim();`,
`    const identifier = (input.identifier || input.username || input.email || '').trim().toLowerCase();`,
`    const identifier = (input.identifier || input.username || input.email || '').trim();`
  ];
  const identifierAnchor=anchors.find(anchor=>source.includes(anchor));
  if(!identifierAnchor)throw new Error('Employee auth installer could not find the login identifier boundary');
  const credentialName=identifierAnchor.includes('credentials.')?'credentials':'input';
  const normalizedIdentifier=identifierAnchor.includes('.toLowerCase()')
    ? identifierAnchor
    : identifierAnchor.replace(';','.toLowerCase();');
  const portalBoundary=`${normalizedIdentifier}
    const requestedPortal = ${credentialName}.portal || null;
    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@')) {
      res.status(400).json({ error: 'Employee Portal requires your assigned employee username, not an email address' });
      return;
    }
    if (requestedPortal === 'ADMIN' && (!identifier.includes('@') || !identifier.endsWith('@sulandrahealth.com'))) {
      res.status(400).json({ error: 'Administrator sign-in requires a @sulandrahealth.com work email' });
      return;
    }`;
  source=source.replace(identifierAnchor,portalBoundary);
}
source=source.replace(
  "    const isAdministratorIdentifier = identifier === administratorEmail || identifier === 'admin';",
  "    const isAdministratorIdentifier = identifier === administratorEmail && requestedPortal !== 'EMPLOYEE';"
);

if(!source.includes("mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),")){
  source=source.replace("  portal: z.enum(['EMPLOYEE','ADMIN']).optional(),","  portal: z.enum(['EMPLOYEE','ADMIN']).optional(),\n  mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),");
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
  if(source.includes(legacyTotpBlock)){
    const smsBlock=`    if (requestedPortal === 'ADMIN' && !administrationRoles.has(account.role)) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: 'Admin portal entitlement required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(403).json({ error: 'This account does not have Sulandra administrator or management access' });
      return;
    }
    const smsMfaInput = {
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
    if (smsMfa.required) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: 'SMS verification challenge issued', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(202).json({ mfaRequired: true, mfaMethod: 'sms', ...smsMfa });
      return;
    }
    const payload = await buildSessionPayload(account);
    await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'ALLOW', reason: 'Successful login', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined, sessionId: payload.sessionId });
    res.json(payload);`;
    source=source.replace(legacyTotpBlock,smsBlock);
  }
}

await writeFile(bootstrapPath,source,'utf8');
console.log('Employee authentication security installer is idempotent across normalized login variants.');
