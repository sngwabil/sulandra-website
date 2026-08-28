import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const securityPath = path.join(root, 'api', 'src', 'employee-auth-security.ts');

await import('./install-employee-auth-security.mjs');

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Universal MFA installer could not find ${label}`);
  return source.replace(from, to);
}

let security = await readFile(securityPath, 'utf8');
const ownerRequired = "function ownerSmsRequired(email?:string){return String(email||'').trim().toLowerCase()===adminEmail()&&String(process.env.ADMIN_SMS_MFA_REQUIRED||'').trim().toLowerCase()==='true'}";
const universalPolicy = `${ownerRequired}\nconst universalMfaRoles=new Set<string>([\n  UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.DSP,UserRole.DELEGATING_NURSE,UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.HR_MANAGER,UserRole.SCHEDULER,UserRole.BILLING_SPECIALIST,UserRole.ADMINISTRATIVE_ASSISTANT,UserRole.CEO,UserRole.DOO,UserRole.DRIVER,\n].map(String));\nexport function roleRequiresUniversalMfa(role:UserRole|string){return universalMfaRoles.has(String(role))}`;
security = replaceOnce(security, ownerRequired, universalPolicy, 'universal MFA role policy anchor');

const oldRequirement = "async function smsRequirement(prisma:PrismaClient,input:SmsLoginInput){await ensureEmployeeAuthSecuritySchema(prisma);const profile=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"smsPhone\",\"smsRequired\" FROM \"EmployeeMfaProfile\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 LIMIT 1`,input.organizationId,input.userId))[0];const required=Boolean(profile?.smsRequired)||ownerSmsRequired(input.email);const phone=normalizeSmsPhone(profile?.smsPhone||(ownerSmsRequired(input.email)?process.env.ADMIN_MFA_PHONE:''));return{required,phone}}";
const newRequirement = "async function smsRequirement(prisma:PrismaClient,input:SmsLoginInput){await ensureEmployeeAuthSecuritySchema(prisma);const profile=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"smsPhone\",\"smsRequired\" FROM \"EmployeeMfaProfile\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 LIMIT 1`,input.organizationId,input.userId))[0];const userRow=(await prisma.$queryRawUnsafe<any[]>(`SELECT to_jsonb(u) AS \"record\" FROM \"User\" u WHERE u.\"organizationId\"=$1 AND u.\"id\"=$2 LIMIT 1`,input.organizationId,input.userId))[0];const record=userRow?.record&&typeof userRow.record==='object'?userRow.record:{};const required=roleRequiresUniversalMfa(input.role)||Boolean(profile?.smsRequired)||ownerSmsRequired(input.email);const fallbackPhone=record.mobilePhone||record.phone||record.phoneNumber||record.mobile||record.cellPhone||'';const phone=normalizeSmsPhone(profile?.smsPhone||fallbackPhone||(ownerSmsRequired(input.email)||String(input.role)===String(UserRole.ADMINISTRATOR)?process.env.ADMIN_MFA_PHONE:''));if(required&&phone&&!profile?.smsPhone){await prisma.$executeRawUnsafe(`INSERT INTO \"EmployeeMfaProfile\" (\"organizationId\",\"userId\",\"smsPhone\",\"smsRequired\",\"smsConfiguredAt\",\"updatedAt\") VALUES ($1,$2,$3,TRUE,NOW(),NOW()) ON CONFLICT (\"organizationId\",\"userId\") DO UPDATE SET \"smsPhone\"=COALESCE(\"EmployeeMfaProfile\".\"smsPhone\",EXCLUDED.\"smsPhone\"),\"smsRequired\"=TRUE,\"smsConfiguredAt\"=COALESCE(\"EmployeeMfaProfile\".\"smsConfiguredAt\",NOW()),\"updatedAt\"=NOW()`,input.organizationId,input.userId,phone)}return{required,phone}}";
security = replaceOnce(security, oldRequirement, newRequirement, 'SMS requirement policy');
security = security.replaceAll('Administrator SMS verification phone is not configured', 'Multi-factor authentication phone is not configured for this account');
security = security.replaceAll('Administrator SMS verification provider is not configured', 'Multi-factor authentication SMS provider is not configured');
const privilegedRestriction = "if(!['ADMINISTRATOR','CEO','DOO'].includes(String(target.role)))return void res.status(409).json({error:'SMS login verification is reserved for privileged administrator accounts'});";
const universalRestriction = "if(!roleRequiresUniversalMfa(String(target.role)))return void res.status(409).json({error:'This role is not configured for mandatory Sulandra MFA'});";
security = replaceOnce(security, privilegedRestriction, universalRestriction, 'administrator SMS configuration role restriction');
await writeFile(securityPath, security, 'utf8');

let bootstrap = await readFile(bootstrapPath, 'utf8');
const employeeAuthImport = bootstrap.match(/import\s*\{([^;]*?)\}\s*from '\.\/employee-auth-security\.js';/s);
if (!employeeAuthImport) throw new Error('Universal MFA installer could not find canonical employee auth import');
const importedNames = employeeAuthImport[1].split(',').map((value) => value.trim()).filter(Boolean);
if (!importedNames.includes('registerEmployeeAuthSecurityRoutes')) {
  importedNames.push('registerEmployeeAuthSecurityRoutes');
  const uniqueNames = [...new Set(importedNames)];
  bootstrap = bootstrap.replace(employeeAuthImport[0], `import {\n  ${uniqueNames.join(',\n  ')},\n} from './employee-auth-security.js';`);
}

const earlySuccess = "      await recordSuccessfulPortalLogin(employee.userId);\n      account = employee;";
if (bootstrap.includes(earlySuccess)) bootstrap = bootstrap.replace(earlySuccess, '      account = employee;');

const alreadyAccountsSuccessAfterMfa = bootstrap.includes('await recordSuccessfulPortalLogin(account.userId);');
if (!alreadyAccountsSuccessAfterMfa) {
  const payloadPattern = /^(\s*)const\s+payload\s*=\s*await\s+buildSessionPayload\s*\(\s*account\s*\)\s*;/m;
  const payloadMatch = bootstrap.match(payloadPattern);
  if (payloadMatch) {
    const indent = payloadMatch[1] || '    ';
    bootstrap = bootstrap.replace(payloadPattern, `${indent}await recordSuccessfulPortalLogin(account.userId);\n${payloadMatch[0]}`);
  } else {
    const responsePattern = /^(\s*)res\.json\s*\(\s*await\s+buildSessionPayload\s*\(\s*account\s*\)\s*\)\s*;/m;
    const responseMatch = bootstrap.match(responsePattern);
    if (!responseMatch) throw new Error('Universal MFA installer could not find a secure post-MFA session completion anchor');
    const indent = responseMatch[1] || '    ';
    bootstrap = bootstrap.replace(responsePattern, `${indent}await recordSuccessfulPortalLogin(account.userId);\n${responseMatch[0]}`);
  }
}

const registration = 'registerEmployeeAuthSecurityRoutes({ app, prisma, authOf, requireRoles });';
if (!bootstrap.includes(registration)) {
  const auditAnchor = 'type AuditColumn = {';
  if (!bootstrap.includes(auditAnchor)) throw new Error('Universal MFA installer could not find employee auth route registration anchor');
  bootstrap = bootstrap.replace(auditAnchor, `${registration}\n\n${auditAnchor}`);
}

for (const marker of [
  'mfaCode: z.string().trim().regex(/^\\d{6}$/).optional()',
  'mfaChallengeId: z.string().trim().uuid().optional()',
  'const smsMfaInput = {',
  'await verifyEmployeeSmsLoginMfa',
  'await beginEmployeeSmsLoginMfa',
  'await recordSuccessfulPortalLogin(account.userId);',
  'await createEmployeeSession(prisma',
]) {
  if (!bootstrap.includes(marker)) throw new Error(`Universal MFA installer expected canonical security marker: ${marker}`);
}

await writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('Universal MFA enforcement installed idempotently: governed Admin/PHI/regulated roles must complete MFA before successful login accounting and server-side session issuance, and authentication security routes are registered.');
