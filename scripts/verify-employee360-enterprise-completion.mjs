import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>readFile(path.join(root,relative),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const [storage,secureRoutes,authSecurity,installer,authInstaller,migration,mfaMigration,frontend,frontendJs,packageJson,bootstrap]=await Promise.all([
  read('api/src/secure-object-storage.ts'),read('api/src/employee360-secure-files-routes.ts'),read('api/src/employee-auth-security.ts'),read('scripts/install-employee-management-platform.mjs'),read('scripts/install-employee-auth-security.mjs'),read('prisma/migrations/20260806224500_employee360_secure_storage_onboarding/migration.sql'),read('prisma/migrations/20260806225500_employee_auth_sessions_mfa/migration.sql'),read('employee360.html'),read('assets/employee360-app.js'),read('package.json'),read('api/src/onboarding-bootstrap.ts')
]);
for(const marker of ['x-amz-server-side-encryption','CLIENT-AES-256-GCM','scanBufferForMalware','CLAMAV_HOST','putSecureObject','deleteSecureObject'])assert(storage.includes(marker),`Secure storage is missing ${marker}`);
for(const marker of ['/api/admin/employee360/secure-files','/migrate-base64','/onboarding/convert','/secure-files/lifecycle','/internal/employee360/compliance-reminders','EmployeeOnboardingLink','EmployeeComplianceReminderRun'])assert(secureRoutes.includes(marker),`Secure routes are missing ${marker}`);
for(const marker of ['EmployeeAuthSession','EmployeeMfaProfile','verifyEmployeeLoginMfa','validateEmployeeSession','/api/auth/security/mfa/setup','/api/admin/auth/security/revoke'])assert(authSecurity.includes(marker),`Authentication security is missing ${marker}`);
for(const marker of ['registerEmployee360SecureFilesRoutes','registerEmployeeAuthSecurityRoutes'])assert(installer.includes(marker),`Backend installer is missing ${marker}`);
for(const marker of ['validateEmployeeSession(prisma','jwtid: sessionId','await tokenAuth(req)'])assert(authInstaller.includes(marker)||bootstrap.includes(marker),`Authentication integration is missing ${marker}`);
const hasCanonicalMfaIntegration=(
  (authInstaller.includes('verifyEmployeeSmsLoginMfa')||bootstrap.includes('verifyEmployeeSmsLoginMfa'))
  && (authInstaller.includes('beginEmployeeSmsLoginMfa')||bootstrap.includes('beginEmployeeSmsLoginMfa'))
  && bootstrap.includes('const smsMfaInput = {')
  && /const smsMfa = (credentials|input)\.mfaChallengeId \|\| \1\.mfaCode/.test(bootstrap)
  && bootstrap.includes("reason: 'SMS verification challenge issued'")
  && bootstrap.includes('await recordSuccessfulPortalLogin(account.userId);')
  && bootstrap.includes('const payload = await buildSessionPayload(account);')
);
assert(hasCanonicalMfaIntegration,'Authentication integration is missing the canonical fail-closed universal SMS MFA gate');
const mfaGate=bootstrap.search(/const smsMfa = (credentials|input)\.mfaChallengeId \|\| \1\.mfaCode/);
const successfulLogin=bootstrap.indexOf('await recordSuccessfulPortalLogin(account.userId);');
const sessionIssue=bootstrap.indexOf('const payload = await buildSessionPayload(account);');
assert(mfaGate>=0&&successfulLogin>mfaGate&&sessionIssue>successfulLogin,'Authentication integration does not keep successful-login accounting and session issuance behind MFA');
for(const table of ['EmployeeSecureDocument','EmployeeDocumentAccessLog','EmployeeOnboardingLink','EmployeeOnboardingSnapshot','EmployeeComplianceReminderRun'])assert(migration.includes(`"${table}"`),`Secure migration is missing ${table}`);
for(const table of ['EmployeeAuthSession','EmployeeMfaProfile','EmployeePortalAccessControl','EmployeeLoginEvent'])assert(mfaMigration.includes(`"${table}"`),`Authentication migration is missing ${table}`);
assert(frontend.includes('/assets/employee360-app.js'),'First-class Employee 360 page is missing its application asset');
for(const marker of ['/api/admin/employee360/secure-files','/api/admin/employee360/onboarding/convert','/api/admin/employee360/enterprise-gap-dashboard'])assert(frontendJs.includes(marker),`First-class frontend is missing ${marker}`);
assert(packageJson.includes('verify-employee360-enterprise-completion.mjs'),'Enterprise completion verifier is not wired into package scripts');
assert(packageJson.includes('install-employee-auth-security.mjs'),'Authentication security installer is not wired into builds');
console.log('Employee 360 enterprise completion foundation is structurally verified against the canonical universal MFA and revocable-session flow.');
