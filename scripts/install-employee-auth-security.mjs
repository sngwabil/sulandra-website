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

const portalBoundaryPattern=/const requestedPortal = (credentials|input)\.portal \|\| null;/;
let portalBoundaryMatch=source.match(portalBoundaryPattern);
let loginInputName=portalBoundaryMatch?.[1]||null;
if(!portalBoundaryMatch){
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
  loginInputName=identifierAnchor.includes('credentials.')?'credentials':'input';
  const normalizedIdentifier=identifierAnchor.includes('.toLowerCase()')
    ? identifierAnchor
    : identifierAnchor.replace(';','.toLowerCase();');
  const portalBoundary=`${normalizedIdentifier}
    const requestedPortal = ${loginInputName}.portal || null;
    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@')) {
      res.status(400).json({ error: 'Employee Portal requires your assigned employee username, not an email address' });
      return;
    }
    if (requestedPortal === 'ADMIN' && (!identifier.includes('@') || !identifier.endsWith('@sulandrahealth.com'))) {
      res.status(400).json({ error: 'Administrator sign-in requires a @sulandrahealth.com work email' });
      return;
    }`;
  source=source.replace(identifierAnchor,portalBoundary);
  portalBoundaryMatch=source.match(portalBoundaryPattern);
}
if(!loginInputName)loginInputName=portalBoundaryMatch?.[1]||(/const input = loginSchema\.parse/.test(source)?'input':'credentials');
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
if(!source.includes('  const entityContext = await getUserEntityContext(prisma, account);')){
  const expiresAnchor="  const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString();";
  if(!source.includes(expiresAnchor))throw new Error('Employee auth installer could not find the session expiry anchor for entity context');
  source=source.replace(expiresAnchor,`${expiresAnchor}\n  const entityContext = await getUserEntityContext(prisma, account);`);
}
if(!source.includes('await createEmployeeSession(prisma')){
  const canonicalReturn="  return {\n    token,\n    accessToken: token,";
  if(source.includes(canonicalReturn)){
    source=source.replace(canonicalReturn,`  await createEmployeeSession(prisma, { organizationId: account.organizationId, userId: account.userId, expiresAt: new Date(expiresAt), sessionId });
  return {
    sessionId,
    entityContext,
    token,
    accessToken: token,`);
  }else{
    const legacyReturn="  return {\n    ...session,\n    session,\n    data: session,\n  };\n};\n\napp.disable";
    if(!source.includes(legacyReturn))throw new Error('Employee auth installer could not find the canonical session payload return');
    source=source.replace(legacyReturn,"  await createEmployeeSession(prisma, { organizationId: account.organizationId, userId: account.userId, expiresAt: new Date(expiresAt), sessionId });\n  return {\n    ...session,\n    sessionId,\n    entityContext,\n    session: { ...session, sessionId, entityContext },\n    data: { ...session, sessionId, entityContext },\n  };\n};\n\napp.disable");
  }
}else if(!source.includes('    entityContext,')){
  const sessionReturn='  return {\n    sessionId,';
  if(source.includes(sessionReturn))source=source.replace(sessionReturn,'  return {\n    sessionId,\n    entityContext,');
}

const smsLoginMarker='const smsMfaInput = {';
if(!source.includes(smsLoginMarker)){
  const directLoginAnchor='    res.json(buildSessionPayload(account));';
  const awaitedLoginAnchor='    res.json(await buildSessionPayload(account));';
  const payloadLoginAnchor='    const payload = await buildSessionPayload(account);';
  const completionAnchor=source.includes(payloadLoginAnchor)?payloadLoginAnchor:(source.includes(awaitedLoginAnchor)?awaitedLoginAnchor:(source.includes(directLoginAnchor)?directLoginAnchor:null));
  if(!completionAnchor)throw new Error('Employee auth installer could not find the login completion anchor');
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
    const smsMfa = ${loginInputName}.mfaChallengeId || ${loginInputName}.mfaCode
      ? await verifyEmployeeSmsLoginMfa(prisma, { ...smsMfaInput, challengeId: ${loginInputName}.mfaChallengeId, code: ${loginInputName}.mfaCode })
      : await beginEmployeeSmsLoginMfa(prisma, smsMfaInput);
    if (smsMfa.required) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: 'SMS verification challenge issued', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(202).json({ mfaRequired: true, mfaMethod: 'sms', ...smsMfa });
      return;
    }
    const payload = await buildSessionPayload(account);
    await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'ALLOW', reason: 'Successful login', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined, sessionId: payload.sessionId });
    res.json(payload);`;
  if(completionAnchor===payloadLoginAnchor){
    const end='    res.json(payload);';
    const start=source.indexOf(payloadLoginAnchor);
    const stop=source.indexOf(end,start);
    if(stop<0)throw new Error('Employee auth installer could not find the payload response anchor');
    source=source.slice(0,start)+smsBlock+source.slice(stop+end.length);
  }else{
    source=source.replace(completionAnchor,smsBlock);
  }
}

if(!source.includes('const entityContext = await getUserEntityContext(prisma, account);')||!source.includes('entityContext,')){
  throw new Error('Employee auth installer did not expose multi-company entity memberships in the session payload');
}
await writeFile(bootstrapPath,source,'utf8');
console.log('Employee authentication security installer is idempotent, session-revocable, universal-MFA aware, and exposes authorized multi-company entity memberships at sign-in.');
