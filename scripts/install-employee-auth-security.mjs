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

// Portal mode is explicit for the two human login surfaces. Older clients that
// omit it remain backward compatible during rollout, but the Employee page sends
// EMPLOYEE and the Admin page sends ADMIN.
if(!source.includes("portal: z.enum(['EMPLOYEE','ADMIN']).optional(),")){
  source=source.replace(
    "  password: z.string().min(1).max(1_024),",
    "  password: z.string().min(1).max(1_024),\n  portal: z.enum(['EMPLOYEE','ADMIN']).optional(),"
  );
}

const portalBoundaryMarker='    const requestedPortal = credentials.portal || null;';
if(!source.includes(portalBoundaryMarker)){
  const identifierAnchor=`    const identifier = (credentials.email || credentials.username || credentials.identifier || '')
      .trim()
      .toLowerCase();`;
  const portalBoundary=`${identifierAnchor}
    const requestedPortal = credentials.portal || null;
    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@')) {
      res.status(400).json({ error: 'Employee Portal requires your assigned employee username, not an email address' });
      return;
    }
    if (requestedPortal === 'ADMIN' && (!identifier.includes('@') || !identifier.endsWith('@sulandrahealth.com'))) {
      res.status(400).json({ error: 'Administrator sign-in requires a @sulandrahealth.com work email' });
      return;
    }`;
  if(!source.includes(identifierAnchor))throw new Error('Employee auth installer could not find the login identifier boundary');
  source=source.replace(identifierAnchor,portalBoundary);
}
source=source.replace(
  "    const isAdministratorIdentifier = identifier === administratorEmail || identifier === 'admin';",
  "    const isAdministratorIdentifier = identifier === administratorEmail && requestedPortal !== 'EMPLOYEE';"
);

// These edits must be safe when typecheck and build run sequentially in the same checkout.
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
} else if(!source.includes("reason: 'Admin portal entitlement required'")) {
  source=source.replace(
    '    const smsMfaInput = {',
    `    if (requestedPortal === 'ADMIN' && !administrationRoles.has(account.role)) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: 'Admin portal entitlement required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(403).json({ error: 'This account does not have Sulandra administrator or management access' });
      return;
    }
    const smsMfaInput = {`
  );
}

source=source.replace("app.use((req, res, next) => {\n  if (req.path.startsWith('/public/') || req.path === '/health' || req.path === '/live') {","app.use(async (req, res, next) => {\n  if (req.path.startsWith('/public/') || req.path.startsWith('/internal/') || req.path === '/health' || req.path === '/live') {");
source=source.replace('  const auth = internalAuth(req) ?? tokenAuth(req);','  const auth = internalAuth(req) ?? await tokenAuth(req);');

const mfaMatches=source.match(/mfaCode: z\.string\(\)\.trim\(\)\.regex\(\/\^\\d\{6\}\$\/\)\.optional\(\),/g)||[];
const challengeMatches=source.match(/mfaChallengeId: z\.string\(\)\.trim\(\)\.uuid\(\)\.optional\(\),/g)||[];
const portalMatches=source.match(/portal: z\.enum\(\['EMPLOYEE','ADMIN'\]\)\.optional\(\),/g)||[];
const sessionMatches=source.match(/const sessionId = randomUUID\(\);/g)||[];
if(mfaMatches.length!==1)throw new Error(`Employee auth installer expected one MFA schema field, found ${mfaMatches.length}`);
if(challengeMatches.length!==1)throw new Error(`Employee auth installer expected one SMS challenge field, found ${challengeMatches.length}`);
if(portalMatches.length!==1)throw new Error(`Employee auth installer expected one portal-mode schema field, found ${portalMatches.length}`);
if(sessionMatches.length!==1)throw new Error(`Employee auth installer expected one login session ID declaration, found ${sessionMatches.length}`);
if(!source.includes('validateEmployeeSession(prisma'))throw new Error('Failed to install revocable session validation');
if(!source.includes('verifyEmployeeLoginMfa(prisma'))throw new Error('Failed to install MFA login verification');
if(!source.includes('beginEmployeeSmsLoginMfa(prisma'))throw new Error('Failed to install SMS MFA challenge delivery');
if(!source.includes('verifyEmployeeSmsLoginMfa(prisma'))throw new Error('Failed to install SMS MFA challenge verification');
if(!source.includes('expiresAt: new Date(expiresAt), sessionId'))throw new Error('Failed to persist JWT jti as the server-side session id');
if(!source.includes("requestedPortal === 'EMPLOYEE' && identifier.includes('@')"))throw new Error('Employee username-only portal boundary was not installed');
if(!source.includes("requestedPortal === 'ADMIN' && !administrationRoles.has(account.role)"))throw new Error('Admin entitlement login boundary was not installed');
await writeFile(bootstrapPath,source,'utf8');

// SULANDRA_CANONICAL_EMPLOYEE_USERNAME_V1
// Employee usernames are assigned at hire from name initials + surname:
// Sulpitius Ndeh Gwabil -> sngwabil. Collisions receive deterministic numeric
// suffixes (sngwabil2, sngwabil3, ...), never random replacement usernames.
const hiringPath=path.join(root,'api/src/hiring-provisioning-routes.ts');
let hiring=await readFile(hiringPath,'utf8');
const usernameFunctionPattern=/async function availableUsername\([\s\S]*?\n}\n\nasync function createUser/;
const canonicalUsernameFunction=`// SULANDRA_CANONICAL_EMPLOYEE_USERNAME_V1
const canonicalUsernamePart = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase();

export function canonicalEmployeeUsername(firstName: string, middleName: string | null | undefined, lastName: string) {
  const first = canonicalUsernamePart(firstName);
  const middle = String(middleName || '').trim().split(/\\s+/).map(canonicalUsernamePart).filter(Boolean);
  const surname = canonicalUsernamePart(lastName);
  const initials = [first, ...middle].filter(Boolean).map((part) => part.slice(0, 1)).join('');
  return \`\${initials}\${surname}\` || \`employee\${randomBytes(3).toString('hex')}\`;
}

async function availableUsername(
  tx: Prisma.TransactionClient,
  firstName: string,
  middleName: string | null | undefined,
  lastName: string,
) {
  const base = canonicalEmployeeUsername(firstName, middleName, lastName);
  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const candidate = sequence === 1 ? base : \`\${base}\${sequence}\`;
    const rows = await tx.$queryRawUnsafe<Array<{ exists: boolean }>>(
      \`SELECT EXISTS(SELECT 1 FROM "EmployeePortalCredential" WHERE LOWER("username")=LOWER($1)) AS "exists"\`,
      candidate,
    );
    if (!rows[0]?.exists) return candidate;
  }
  throw Object.assign(new Error('Unable to allocate a unique employee username'), { status: 409 });
}

async function createUser`;
if(!hiring.includes('SULANDRA_CANONICAL_EMPLOYEE_USERNAME_V1')){
  if(!usernameFunctionPattern.test(hiring))throw new Error('Hiring username allocator boundary could not be located');
  hiring=hiring.replace(usernameFunctionPattern,canonicalUsernameFunction);
}
const legacyUsernameCall=/const username = credentialRows\[0\]\?\.username \|\| await availableUsername\(\s*tx,\s*input\.username,\s*email,\s*String\(application\.firstName \|\| ''\),\s*String\(application\.lastName \|\| ''\),\s*String\(application\.legalEntityCode\),\s*\);/m;
if(legacyUsernameCall.test(hiring)){
  hiring=hiring.replace(legacyUsernameCall,`const username = credentialRows[0]?.username || await availableUsername(
            tx,
            String(application.firstName || ''),
            application.middleName ? String(application.middleName) : null,
            String(application.lastName || ''),
          );`);
}
if(!hiring.includes("export function canonicalEmployeeUsername"))throw new Error('Canonical employee username generator was not installed');
if(!hiring.includes("application.middleName ? String(application.middleName) : null"))throw new Error('Hiring does not include middle-name initials in employee usernames');
await writeFile(hiringPath,hiring,'utf8');

await import('./install-employee360-scope-enforcement.mjs');
await import('./install-employee-auth-admin-routes.mjs');
console.log('Employee authentication installer is idempotent: username-only Employee Portal, Sulandra-email Admin Portal, backend admin entitlement checks, independent tab sessions, canonical hire usernames, revocable sessions, portal controls, authenticator MFA, privileged SMS MFA, login history, scope enforcement and auth administration routes.');