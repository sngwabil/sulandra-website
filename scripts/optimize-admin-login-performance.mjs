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

// Password hashing/verification parameters are intentionally left untouched in
// this pre-build optimizer. The canonical authentication installers rely on the
// current verification function shape and must finish before TypeScript build.
// The latency fix here removes repeated schema DDL without reducing password cost.

// 2) Start fetching the Admin authorization/bootstrap runtimes at the top of
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

console.log('Admin login performance optimized: auth schema DDL is process-cached and Admin authorization/bootstrap assets are discovered early when the static Admin document is present. Password security parameters are unchanged.');
