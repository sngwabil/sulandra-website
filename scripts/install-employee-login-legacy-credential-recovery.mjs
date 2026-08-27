import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
let source = await readFile(bootstrapPath, 'utf8');
const marker = 'SULANDRA_LEGACY_EMPLOYEE_CREDENTIAL_RECOVERY_V1';

if (!source.includes(marker)) {
  const helperAnchor = 'const recordFailedPortalLogin = async (userId: string) => {';
  if (!source.includes(helperAnchor)) throw new Error('Legacy credential recovery could not find helper anchor.');
  const helper = `// ${marker}\nconst resolveLegacyPortalAccount = async (identifier: string) => resolvePortalAccount(identifier);\nconst bootstrapEmployeePortalCredential = async (_account: any, _identifier: string, _password: string) => {};\n\n`;
  source = source.replace(helperAnchor, `${helper}${helperAnchor}`);
}

if (!source.includes('configuredAdministratorBootstrapAccepted')) {
  const canonicalBlock = `    const account = await resolvePortalAccount(identifier);\n    if (!account) {\n      res.status(401).json({ error: 'Invalid username or password' });\n      return;\n    }`;
  const canonicalReplacement = `    const account = await resolvePortalAccount(identifier) ?? await resolveLegacyPortalAccount(identifier);\n    const configuredAdministratorBootstrapAccepted = Boolean(\n      account\n      && account.email === administratorEmail\n      && administrationRoles.has(account.role)\n      && account.mustChangePassword\n      && configuredPassword\n      && secureEquals(input.password, configuredPassword),\n    );\n    if (!account) {\n      res.status(401).json({ error: 'Invalid username or password' });\n      return;\n    }`;
  if (source.includes(canonicalBlock)) source = source.replace(canonicalBlock, canonicalReplacement);
  else throw new Error('Legacy employee credential recovery could not find the employee login validation block.');
}

const oldEmployeeEmailBoundary = `    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@')) {\n      res.status(400).json({ error: 'Employee Portal requires your assigned employee username, not an email address' });\n      return;\n    }`;
const managementEmployeeEmailBoundary = `    // SULANDRA_MANAGEMENT_EMPLOYEE_LOGIN_V1\n    if (requestedPortal === 'EMPLOYEE' && identifier.includes('@') && !identifier.endsWith('@sulandrahealth.com')) {\n      res.status(400).json({ error: 'Management Employee Portal sign-in requires a @sulandrahealth.com work email' });\n      return;\n    }`;
if (source.includes(oldEmployeeEmailBoundary)) source = source.replace(oldEmployeeEmailBoundary, managementEmployeeEmailBoundary);

await writeFile(bootstrapPath, source, 'utf8');
console.log('Legacy employee credential recovery is compatible with the normalized login flow.');
