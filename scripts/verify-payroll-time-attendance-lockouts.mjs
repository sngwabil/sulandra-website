import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payroll = await readFile(path.join(root, 'api', 'src', 'time-attendance-payroll-lock.ts'), 'utf8');
const routes = await readFile(path.join(root, 'api', 'src', 'time-attendance-routes.ts'), 'utf8');
const pkg = JSON.parse(await readFile(path.join(root, 'api', 'package.json'), 'utf8'));

const must = (condition, message) => { if (!condition) throw new Error(`Payroll lock verification failed: ${message}`); };
const lifecycle = ['predev', 'prebuild', 'pretypecheck'];

must(payroll.includes('TimeAttendancePayrollPeriod'), 'payroll period schema is missing');
must(payroll.includes('TimeAttendancePayrollDecision'), 'immutable payroll decision ledger is missing');
must(payroll.includes('PAYROLL_DECISION_IMMUTABLE'), 'payroll decision immutability trigger is missing');
must(payroll.includes('TimeAttendanceClockEntry_payroll_lock_guard'), 'clock-entry database lock trigger is missing');
must(payroll.includes('TimeAttendanceRequest_payroll_lock_guard'), 'clock-correction database lock trigger is missing');
must(payroll.includes("p.\"status\" IN ('LOCKED','EXPORTED')"), 'locked/exported period database guard is missing');
must(payroll.includes('if (value instanceof Date) return value.toISOString();\n  if (Array.isArray(value))'), 'timestamp-safe deterministic fingerprint normalization is missing');
must(payroll.includes("createHash('sha256')"), 'SHA-256 payroll evidence fingerprint is missing');
must(payroll.includes("code: 'PAYROLL_PERIOD_NOT_READY'"), 'fail-closed readiness blocker is missing');
must(payroll.includes("code: 'PAYROLL_FINGERPRINT_MISMATCH'"), 'stale payroll evidence blocker is missing');
must(payroll.includes("action: 'REOPEN'"), 'audited controlled reopen is missing');
must(payroll.includes("action: 'EXPORT'"), 'payroll export decision audit is missing');
must(payroll.includes('directPayrollProviderSubmission: false'), 'export boundary must not imply direct payroll-provider submission');
must(payroll.includes('const payrollAuthority ='), 'payroll authority policy is missing');
for (const role of ['ADMINISTRATOR', 'HR_MANAGER', 'CEO', 'DOO']) {
  must(payroll.includes(`'${role}'`), `${role} is missing from the payroll authority policy`);
}
must(payroll.includes('admin@sulandrahealth.com'), 'enterprise owner payroll authority fallback is missing');

must(routes.includes("from './time-attendance-payroll-lock.js';"), 'time-attendance routes do not import payroll lock engine');
must(routes.includes('await ensureTimeAttendancePayrollLockSchema(prisma);'), 'time-attendance schema bootstrap does not install payroll lock schema');
must(routes.includes('registerTimeAttendancePayrollLockRoutes({ app, prisma, authOf, admin, ready });'), 'payroll lock routes are not registered');

for (const name of lifecycle) {
  const script = String(pkg.scripts?.[name] || '');
  must(script.includes('install-payroll-time-attendance-lockouts.mjs'), `${name} does not run payroll lock installer`);
  must(script.includes('verify-payroll-time-attendance-lockouts.mjs'), `${name} does not run payroll lock verifier`);
}

console.log('Payroll time-attendance lockouts verified: fail-closed readiness, immutable clock/correction guards, deterministic lock snapshot, controlled reopen, and export fingerprint enforcement are installed.');
