import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
let source = await readFile(bootstrapPath, 'utf8');

const marker = 'SULANDRA_EMPLOYEE_LEGACY_CREDENTIAL_RECOVERY_V1';

if (!source.includes(marker)) {
  const helperAnchor = '\nconst recordFailedPortalLogin = async (userId: string) => {';
  if (!source.includes(helperAnchor)) {
    throw new Error('Legacy employee credential recovery could not find the portal login helper anchor.');
  }

  const helper = `
// ${marker}
// Employees hired after EmployeePortalCredential was introduced already use that table.
// This compatibility path is only for older Sulandra identities that predate it. It never
// guesses credentials: a legacy User password hash must verify, or the configured primary
// administrator may bootstrap their employee credential once with the configured admin
// password when the credential is still marked for first-use setup.
const canonicalLegacyEmployeeUsername = (record: Record<string, unknown> | null) => {
  const normalize = (value: unknown) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  const displayName = stringField(record, 'displayName', 'name') || '';
  const displayParts = displayName.split(/\\s+/).filter(Boolean);
  const first = normalize(stringField(record, 'firstName') || displayParts[0] || '');
  const last = normalize(stringField(record, 'lastName') || displayParts.at(-1) || '');
  const middleSource = stringField(record, 'middleName')
    || (displayParts.length > 2 ? displayParts.slice(1, -1).join(' ') : '');
  const middle = String(middleSource || '').trim().split(/\\s+/).map(normalize).filter(Boolean);
  const initials = [first, ...middle].filter(Boolean).map((part) => part.slice(0, 1)).join('');
  return initials && last ? \`\${initials}\${last}\` : '';
};

const resolveLegacyPortalAccount = async (identifier: string): Promise<LoginAccount | null> => {
  const rows = await prisma.$queryRawUnsafe<PortalCredentialRow[]>(
    \`SELECT
       u."id",
       u."organizationId",
       u."role",
       u."email",
       NULL::text AS "username",
       NULL::text AS "passwordHash",
       NULL::text AS "displayName",
       TRUE AS "mustChangePassword",
       0::integer AS "failedLoginAttempts",
       NULL::timestamp AS "lockedUntil",
       to_jsonb(u) AS "userRecord"
     FROM "User" u
     WHERE LOWER(COALESCE(to_jsonb(u)->>'username', '')) = LOWER($1)
        OR LOWER(COALESCE(u."email", '')) = LOWER($2)
     LIMIT 5\`,
    identifier,
    administratorEmail,
  );

  for (const row of rows) {
    if (!isUserRole(row.role)) continue;
    const record = row.userRecord;
    const storedUsername = String(stringField(record, 'username') || '').trim().toLowerCase();
    const canonicalUsername = canonicalLegacyEmployeeUsername(record);
    const email = row.email?.trim().toLowerCase() || '';
    const configuredAdministrator = email === administratorEmail && administrationRoles.has(row.role);

    // "admin" remains an Admin-door identifier. The Employee door may recover the
    // configured administrator only through their employee-style username.
    const identifierMatches = identifier === storedUsername || identifier === canonicalUsername;
    if (!identifierMatches || (configuredAdministrator && identifier === 'admin')) continue;

    const displayName = stringField(record, 'displayName', 'name')
      || [
        stringField(record, 'firstName'),
        stringField(record, 'middleName'),
        stringField(record, 'lastName'),
      ].filter(Boolean).join(' ')
      || row.email
      || canonicalUsername
      || identifier;

    return {
      userId: row.id,
      organizationId: row.organizationId,
      role: row.role,
      email,
      username: canonicalUsername || storedUsername || identifier,
      displayName,
      mustChangePassword: true,
      passwordHash: stringField(record, 'passwordHash'),
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as LoginAccount & {
      passwordHash: string | null;
      failedLoginAttempts: number;
      lockedUntil: Date | null;
    };
  }

  return null;
};

const bootstrapEmployeePortalCredential = async (
  account: LoginAccount,
  username: string,
  password: string,
) => {
  const passwordHash = hashPortalPassword(password);
  await prisma.$executeRawUnsafe(
    \`INSERT INTO "EmployeePortalCredential" (
       "userId", "username", "passwordHash", "displayName", "mustChangePassword",
       "failedLoginAttempts", "lockedUntil", "lastSignedInAt", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, FALSE, 0, NULL, NOW(), NOW(), NOW())
     ON CONFLICT ("userId") DO UPDATE SET
       "username" = EXCLUDED."username",
       "passwordHash" = EXCLUDED."passwordHash",
       "displayName" = EXCLUDED."displayName",
       "mustChangePassword" = FALSE,
       "failedLoginAttempts" = 0,
       "lockedUntil" = NULL,
       "lastSignedInAt" = NOW(),
       "updatedAt" = NOW()\`,
    account.userId,
    username,
    passwordHash,
    account.displayName,
  );
};
`;

  source = source.replace(helperAnchor, `${helper}${helperAnchor}`);
}

const oldLoginBlock = `      const employee = await resolvePortalAccount(identifier);
      const locked = employee?.lockedUntil && employee.lockedUntil.getTime() > Date.now();
      if (!employee || locked || !verifyPortalPassword(credentials.password, employee.passwordHash)) {
        if (employee && !locked && employee.passwordHash) {
          await recordFailedPortalLogin(employee.userId);
        }
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      await recordSuccessfulPortalLogin(employee.userId);
      account = employee;`;

const newLoginBlock = `      const employee = await resolvePortalAccount(identifier) ?? await resolveLegacyPortalAccount(identifier);
      const locked = employee?.lockedUntil && employee.lockedUntil.getTime() > Date.now();
      const standardPasswordAccepted = Boolean(
        employee && verifyPortalPassword(credentials.password, employee.passwordHash),
      );
      const configuredAdministratorBootstrapAccepted = Boolean(
        employee
        && employee.email === administratorEmail
        && administrationRoles.has(employee.role)
        && employee.mustChangePassword
        && configuredPassword
        && secureEquals(credentials.password, configuredPassword),
      );
      if (!employee || locked || (!standardPasswordAccepted && !configuredAdministratorBootstrapAccepted)) {
        if (employee && !locked && employee.passwordHash) {
          await recordFailedPortalLogin(employee.userId);
        }
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      if (configuredAdministratorBootstrapAccepted) {
        await bootstrapEmployeePortalCredential(employee, identifier, credentials.password);
        employee.mustChangePassword = false;
      }
      await recordSuccessfulPortalLogin(employee.userId);
      account = employee;`;

if (source.includes(oldLoginBlock)) {
  source = source.replace(oldLoginBlock, newLoginBlock);
} else if (!source.includes('configuredAdministratorBootstrapAccepted')) {
  throw new Error('Legacy employee credential recovery could not find the employee login validation block.');
}

// SULANDRA_MANAGEMENT_EMPLOYEE_LOGIN_V1
// Authorized management employees are still employees. They may open their own
// Employee Portal with the same Sulandra work email/password used at the Admin door.
// Non-management employees continue to use their assigned employee username.
const oldEmployeeEmailBoundary = `    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@')) {
      res.status(400).json({ error: 'Employee Portal requires your assigned employee username, not an email address' });
      return;
    }`;
const managementEmployeeEmailBoundary = `    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@') && !identifier.endsWith('@sulandrahealth.com')) {
      res.status(400).json({ error: 'Management Employee Portal sign-in requires a @sulandrahealth.com work email' });
      return;
    }`;
if (source.includes(oldEmployeeEmailBoundary)) {
  source = source.replace(oldEmployeeEmailBoundary, managementEmployeeEmailBoundary);
} else if (!source.includes(managementEmployeeEmailBoundary)) {
  throw new Error('Management Employee Portal login could not find the employee email boundary.');
}

source = source.replace(
  "    const isAdministratorIdentifier = identifier === administratorEmail && requestedPortal !== 'EMPLOYEE';",
  "    const isAdministratorIdentifier = identifier === administratorEmail\n      || (identifier === 'admin' && requestedPortal !== 'EMPLOYEE');",
);

const managementEntitlementMarker = "reason: 'Management Employee Portal work-email entitlement required'";
if (!source.includes(managementEntitlementMarker)) {
  const entitlementAnchor = "    if (requestedPortal === 'ADMIN' && !administrationRoles.has(account.role)) {";
  if (!source.includes(entitlementAnchor)) {
    throw new Error('Management Employee Portal login could not find the Admin entitlement anchor.');
  }
  source = source.replace(
    entitlementAnchor,
    `    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@') && !administrationRoles.has(account.role)) {
      await recordLoginEvent(prisma, { organizationId: account.organizationId, userId: account.userId, identifier, decision: 'DENY', reason: 'Management Employee Portal work-email entitlement required', ipAddress: req.ip, userAgent: req.get('user-agent') || undefined });
      res.status(403).json({ error: 'This Sulandra work email does not have management access. Use your assigned employee username instead.' });
      return;
    }
${entitlementAnchor}`,
  );
}

for (const required of [
  marker,
  'resolveLegacyPortalAccount(identifier)',
  'configuredAdministratorBootstrapAccepted',
  'bootstrapEmployeePortalCredential(employee, identifier, credentials.password)',
  'SULANDRA_MANAGEMENT_EMPLOYEE_LOGIN_V1',
  "requestedPortal === 'EMPLOYEE' && identifier.includes('@') && !identifier.endsWith('@sulandrahealth.com')",
  "Management Employee Portal work-email entitlement required",
  "identifier === administratorEmail",
]) {
  if (!source.includes(required)) throw new Error(`Legacy employee credential recovery missing marker: ${required}`);
}

await writeFile(bootstrapPath, source, 'utf8');
console.log('Legacy Employee Portal credentials self-heal, and authorized management employees may use their Sulandra work-email Admin credentials for their employee workspace.');
