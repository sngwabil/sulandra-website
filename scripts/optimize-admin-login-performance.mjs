import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 1) Employee authentication security schema: create/alter/index DDL is an
// idempotent startup concern, not work that should run repeatedly during every
// sign-in/session validation request. Cache the initialization promise for the
// life of the API process while still resetting it if initialization fails.
const authSecurityPath = path.join(root, 'api', 'src', 'employee-auth-security.ts');
let authSecurity = await readFile(authSecurityPath, 'utf8');
const schemaMarker = 'SULANDRA_EMPLOYEE_AUTH_SCHEMA_PROMISE_V1';
if (!authSecurity.includes(schemaMarker)) {
  const start = 'export async function ensureEmployeeAuthSecuritySchema(prisma:PrismaClient){';
  const end = '\n}\n\nexport async function createEmployeeSession';
  const startIndex = authSecurity.indexOf(start);
  const endIndex = authSecurity.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error('Unable to locate Employee Auth schema initialization function');
  const body = authSecurity.slice(startIndex + start.length, endIndex);
  const replacement = `// ${schemaMarker}\nlet employeeAuthSchemaReady: Promise<void> | null = null;\nexport async function ensureEmployeeAuthSecuritySchema(prisma:PrismaClient){\n  if(employeeAuthSchemaReady)return employeeAuthSchemaReady;\n  employeeAuthSchemaReady=(async()=>{${body}\n  })().catch((error)=>{employeeAuthSchemaReady=null;throw error});\n  return employeeAuthSchemaReady;\n}\n\nexport async function createEmployeeSession`;
  authSecurity = authSecurity.slice(0, startIndex) + replacement + authSecurity.slice(endIndex + end.length);
  await writeFile(authSecurityPath, authSecurity, 'utf8');
}
if (!authSecurity.includes(schemaMarker) || !authSecurity.includes('if(employeeAuthSchemaReady)return employeeAuthSchemaReady')) {
  throw new Error('Employee Auth schema promise cache was not installed');
}

// 2) Password verification keeps the existing scrypt parameters, but moves the
// expensive KDF off the Node event loop. This does NOT lower the password cost;
// it simply prevents one sign-in from freezing unrelated API requests.
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
let bootstrap = await readFile(bootstrapPath, 'utf8');
const scryptMarker = 'SULANDRA_ASYNC_PASSWORD_VERIFY_V1';
if (!bootstrap.includes(scryptMarker)) {
  const importOld = "import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';";
  const importNew = "import { randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';";
  if (!bootstrap.includes(importOld)) throw new Error('Unable to locate crypto import for async password verification');
  bootstrap = bootstrap.replace(importOld, importNew);

  const functionStart = 'const verifyPortalPassword = (password: string, encodedHash: string | null) => {';
  const functionEnd = '\n};\n\nconst roleTitle';
  const startIndex = bootstrap.indexOf(functionStart);
  const endIndex = bootstrap.indexOf(functionEnd, startIndex + functionStart.length);
  if (startIndex < 0 || endIndex < 0) throw new Error('Unable to locate password verification function');
  let functionBody = bootstrap.slice(startIndex + functionStart.length, endIndex);
  const syncAnchor = '    const derived = scryptSync(\n      password,';
  if (!functionBody.includes(syncAnchor)) throw new Error('Unable to locate synchronous password derivation');
  functionBody = functionBody.replace(syncAnchor, `    const derived = await new Promise<Buffer>((resolve, reject) => {\n      scrypt(\n        password,`);
  const optionsEnd = `        maxmem: 64 * 1_024 * 1_024,\n      },\n    );\n    return derived.length === expected.length && timingSafeEqual(derived, expected);`;
  const asyncEnd = `        maxmem: 64 * 1_024 * 1_024,\n      },\n        (error, value) => error ? reject(error) : resolve(value),\n      );\n    });\n    return derived.length === expected.length && timingSafeEqual(derived, expected);`;
  if (!functionBody.includes(optionsEnd)) throw new Error('Unable to locate password scrypt completion');
  functionBody = functionBody.replace(optionsEnd, asyncEnd);
  const replacement = `// ${scryptMarker}\nconst verifyPortalPassword = async (password: string, encodedHash: string | null) => {${functionBody}\n};\n\nconst roleTitle`;
  bootstrap = bootstrap.slice(0, startIndex) + replacement + bootstrap.slice(endIndex + functionEnd.length);

  const callAnchor = '!verifyPortalPassword(credentials.password, employee.passwordHash)';
  if (!bootstrap.includes(callAnchor)) throw new Error('Unable to locate login password verification call');
  bootstrap = bootstrap.replace(callAnchor, '!await verifyPortalPassword(credentials.password, employee.passwordHash)');
  await writeFile(bootstrapPath, bootstrap, 'utf8');
}
if (!bootstrap.includes(scryptMarker) || !bootstrap.includes('!await verifyPortalPassword(credentials.password, employee.passwordHash)')) {
  throw new Error('Async password verification was not installed');
}

// 3) Start fetching the Admin authorization/bootstrap runtimes at the top of
// admin.html rather than discovering every script only after the entire legacy
// document has arrived. The API Docker image intentionally does not copy the
// static HTML, so this step is optional there and required in the frontend image.
const adminPath = path.join(root, 'admin.html');
const fastBootMarker = '<!-- SULANDRA_ADMIN_FAST_BOOTSTRAP_V1 -->';
try {
  let admin = await readFile(adminPath, 'utf8');
  if (!admin.includes(fastBootMarker)) {
    const companyContextTag = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
    admin = admin.replace(companyContextTag, '');
    const headAnchor = '</head>';
    if (!admin.includes(headAnchor)) throw new Error('Unable to locate Admin head');
    const fastBoot = `${fastBootMarker}\n  <link rel="preload" as="script" href="/assets/admin-owner-console.js?v=20260825-owner-console-2">\n  <link rel="preload" as="script" href="/assets/admin-owner-context.js?v=20260825-owner-console-2">\n  <link rel="preload" as="script" href="/admin-railway.js?v=20260804-admin-clean-4">\n  ${companyContextTag}\n`;
    admin = admin.replace(headAnchor, `${fastBoot}${headAnchor}`);
    await writeFile(adminPath, admin, 'utf8');
  }
  const contextCount = (admin.match(/<script src="\/assets\/admin-company-context\.js\?v=20260809-admin-company-context-2"><\/script>/g) || []).length;
  if (!admin.includes(fastBootMarker) || contextCount !== 1 || admin.indexOf(fastBootMarker) > admin.indexOf('</head>')) {
    throw new Error(`Admin fast bootstrap is invalid (company-context script count: ${contextCount})`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.log('Admin HTML is not present in this build image; skipping static fast-bootstrap rewrite.');
}

console.log('Admin login performance optimized: auth schema DDL is process-cached, scrypt verification is asynchronous at unchanged cost, and Admin authorization/bootstrap assets are discovered early when the static Admin document is present.');
