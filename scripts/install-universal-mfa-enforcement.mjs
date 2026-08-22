import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const securityPath = path.join(root, 'api', 'src', 'employee-auth-security.ts');

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

const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const securityImport = `${careersImport}\nimport {\n  beginEmployeeSmsLoginMfa,\n  registerEmployeeAuthSecurityRoutes,\n  verifyEmployeeSmsLoginMfa,\n} from './employee-auth-security.js';`;
bootstrap = replaceOnce(bootstrap, careersImport, securityImport, 'employee auth security import');

const loginPasswordField = "  password: z.string().min(1).max(1_024),\n}).refine(";
const loginMfaFields = "  password: z.string().min(1).max(1_024),\n  mfaChallengeId: z.string().trim().uuid().optional(),\n  mfaCode: z.string().trim().regex(/^\\d{6}$/).optional(),\n}).refine(";
bootstrap = replaceOnce(bootstrap, loginPasswordField, loginMfaFields, 'login MFA credential fields');

const earlySuccess = "      await recordSuccessfulPortalLogin(employee.userId);\n      account = employee;";
bootstrap = replaceOnce(bootstrap, earlySuccess, "      account = employee;", 'pre-MFA successful login marker');

const sessionReturn = "    res.json(buildSessionPayload(account));";
const mfaSessionReturn = `    const mfaInput = {\n      organizationId: account.organizationId,\n      userId: account.userId,\n      role: account.role,\n      email: account.email,\n      ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',\n      userAgent: req.get('user-agent')?.trim() || 'Sulandra Health Employee Login',\n    };\n\n    if (credentials.mfaChallengeId || credentials.mfaCode) {\n      const verification = await verifyEmployeeSmsLoginMfa(prisma, {\n        ...mfaInput,\n        challengeId: credentials.mfaChallengeId,\n        code: credentials.mfaCode,\n      });\n      if (!verification.verified) {\n        res.status(verification.status || 401).json({\n          error: verification.reason || 'Multi-factor authentication failed',\n          mfaRequired: Boolean(verification.required),\n          mfaMethod: 'sms',\n        });\n        return;\n      }\n    } else {\n      const challenge = await beginEmployeeSmsLoginMfa(prisma, mfaInput);\n      if (challenge.required) {\n        if (!challenge.challengeIssued) {\n          res.status(challenge.status || 503).json({\n            error: challenge.reason || 'Multi-factor authentication is required but unavailable',\n            mfaRequired: true,\n            mfaMethod: 'sms',\n          });\n          return;\n        }\n        res.status(202).json({\n          mfaRequired: true,\n          mfaMethod: 'sms',\n          mfaChallengeId: challenge.challengeId,\n          maskedPhone: challenge.maskedPhone,\n          expiresIn: challenge.expiresIn,\n        });\n        return;\n      }\n    }\n\n    await recordSuccessfulPortalLogin(account.userId);\n    res.json(buildSessionPayload(account));`;
bootstrap = replaceOnce(bootstrap, sessionReturn, mfaSessionReturn, 'JWT issuance MFA gate');

const auditAnchor = "type AuditColumn = {";
const securityRoutesRegistration = "registerEmployeeAuthSecurityRoutes({ app, prisma, authOf, requireRoles });\n\ntype AuditColumn = {";
bootstrap = replaceOnce(bootstrap, auditAnchor, securityRoutesRegistration, 'employee auth security route registration');

await writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('Universal MFA enforcement installed: governed Admin/PHI/regulated roles cannot receive an access token before successful SMS verification, and MFA security administration routes are registered.');
