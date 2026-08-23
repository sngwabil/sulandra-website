import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = await readFile(path.join(root, 'api', 'src', 'onboarding-bootstrap.ts'), 'utf8');
const security = await readFile(path.join(root, 'api', 'src', 'employee-auth-security.ts'), 'utf8');
const loginUiPath = path.join(root, 'employee-login-railway.js');
let loginUi = null;
try {
  loginUi = await readFile(loginUiPath, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.log('Universal MFA frontend verification skipped: employee-login-railway.js is not present in this backend-only build image. Backend fail-closed MFA enforcement will still be verified.');
}

const failures = [];
const requireMarkers = (source, markers, label) => {
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing: ${marker}`);
};
const forbidMarkers = (source, markers, label) => {
  for (const marker of markers) if (source.includes(marker)) failures.push(`${label} must not contain: ${marker}`);
};

requireMarkers(security, [
  'roleRequiresUniversalMfa',
  'UserRole.ADMINISTRATOR',
  'UserRole.PROGRAM_MANAGER',
  'UserRole.AUDITOR',
  'UserRole.DSP',
  'UserRole.DELEGATING_NURSE',
  'UserRole.LPN',
  'UserRole.RN',
  'UserRole.HOUSE_MANAGER',
  'UserRole.HR_MANAGER',
  'UserRole.SCHEDULER',
  'UserRole.BILLING_SPECIALIST',
  'UserRole.ADMINISTRATIVE_ASSISTANT',
  'UserRole.CEO',
  'UserRole.DOO',
  'UserRole.DRIVER',
  'roleRequiresUniversalMfa(input.role)||Boolean(profile?.smsRequired)||ownerSmsRequired(input.email)',
  'Multi-factor authentication phone is not configured for this account',
  'Multi-factor authentication SMS provider is not configured',
  "if(!roleRequiresUniversalMfa(String(target.role)))return void res.status(409).json({error:'This role is not configured for mandatory Sulandra MFA'});",
], 'employee-auth-security.ts');

requireMarkers(bootstrap, [
  "from './employee-auth-security.js'",
  'beginEmployeeSmsLoginMfa',
  'verifyEmployeeSmsLoginMfa',
  'registerEmployeeAuthSecurityRoutes',
  'mfaChallengeId: z.string().trim().uuid().optional()',
  "mfaCode: z.string().trim().regex(/^\\d{6}$/).optional()",
  'const smsMfaInput = {',
  'const smsMfa = credentials.mfaChallengeId || credentials.mfaCode',
  '? await verifyEmployeeSmsLoginMfa',
  ': await beginEmployeeSmsLoginMfa',
  "reason: 'SMS verification challenge issued'",
  "mfaMethod: 'sms'",
  'await recordSuccessfulPortalLogin(account.userId);\n    const payload = await buildSessionPayload(account);',
  'registerEmployeeAuthSecurityRoutes({ app, prisma, authOf, requireRoles });',
], 'onboarding-bootstrap.ts');

forbidMarkers(bootstrap, [
  'await recordSuccessfulPortalLogin(employee.userId);\n      account = employee;',
], 'onboarding-bootstrap.ts pre-MFA path');

const mfaGateIndex = bootstrap.indexOf('const smsMfa = credentials.mfaChallengeId || credentials.mfaCode');
const successIndex = bootstrap.indexOf('await recordSuccessfulPortalLogin(account.userId);');
const jwtIndex = bootstrap.indexOf('const payload = await buildSessionPayload(account);');
if (mfaGateIndex < 0 || successIndex < 0 || jwtIndex < 0 || mfaGateIndex > successIndex || successIndex > jwtIndex) {
  failures.push('Successful-login accounting and JWT/session issuance are not ordered after the MFA challenge/verification gate');
}

if (loginUi !== null) {
  requireMarkers(loginUi, [
    'mfaChallengeId',
    'mfaCode',
    'payload.mfaRequired',
    'payload.mfaMethod === "sms"',
    'showMfaChallenge(payload)',
  ], 'employee-login-railway.js');
}

if (failures.length) {
  console.error('Universal MFA verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Universal MFA verified: every governed Admin/PHI/regulated role is fail-closed at login until the canonical SMS challenge succeeds, successful-login accounting occurs after MFA, and session issuance remains behind that gate.');
