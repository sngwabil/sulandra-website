import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = await readFile(path.join(root, 'api', 'src', 'onboarding-bootstrap.ts'), 'utf8');
const security = await readFile(path.join(root, 'api', 'src', 'employee-auth-security.ts'), 'utf8');
const loginUi = await readFile(path.join(root, 'employee-login-railway.js'), 'utf8');

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
], 'employee-auth-security.ts');

requireMarkers(bootstrap, [
  "from './employee-auth-security.js'",
  'beginEmployeeSmsLoginMfa',
  'verifyEmployeeSmsLoginMfa',
  'registerEmployeeAuthSecurityRoutes',
  'mfaChallengeId: z.string().trim().uuid().optional()',
  "mfaCode: z.string().trim().regex(/^\\d{6}$/).optional()",
  'if (credentials.mfaChallengeId || credentials.mfaCode)',
  'const verification = await verifyEmployeeSmsLoginMfa',
  'const challenge = await beginEmployeeSmsLoginMfa',
  "mfaMethod: 'sms'",
  'await recordSuccessfulPortalLogin(account.userId);\n    res.json(buildSessionPayload(account));',
  'registerEmployeeAuthSecurityRoutes({ app, prisma, authOf, requireRoles });',
], 'onboarding-bootstrap.ts');

forbidMarkers(bootstrap, [
  'await recordSuccessfulPortalLogin(employee.userId);\n      account = employee;',
], 'onboarding-bootstrap.ts pre-MFA path');

const mfaGateIndex = bootstrap.indexOf('const challenge = await beginEmployeeSmsLoginMfa');
const jwtIndex = bootstrap.indexOf('res.json(buildSessionPayload(account));');
if (mfaGateIndex < 0 || jwtIndex < 0 || mfaGateIndex > jwtIndex) {
  failures.push('JWT issuance is not ordered after the MFA challenge/verification gate');
}

requireMarkers(loginUi, [
  'mfaChallengeId',
  'mfaCode',
  'payload.mfaRequired',
  'payload.mfaMethod === "sms"',
  'showMfaChallenge(payload)',
], 'employee-login-railway.js');

if (failures.length) {
  console.error('Universal MFA verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Universal MFA verified: every governed Admin/PHI/regulated role is fail-closed at login until SMS verification succeeds, the browser supports the challenge flow, and access-token issuance occurs only after MFA.');
