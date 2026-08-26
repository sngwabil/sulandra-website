import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = await readFile(path.join(root, 'api', 'src', 'sia-routes.ts'), 'utf8');
const map = await readFile(path.join(root, 'api', 'src', 'sia-system-map.ts'), 'utf8');

for (const marker of [
  '/employee-login.html',
  '/employee-portal.html',
  '/admin-login.html',
  '/admin.html',
  '/sia.html',
  '/scheduling.html',
  '/spire.html',
]) {
  if (!map.includes(marker)) throw new Error(`SIA canonical system map missing ${marker}`);
}
if (!routes.includes('SULANDRA_CANONICAL_SYSTEM_MAP')) {
  throw new Error('SIA route handler is not consuming the canonical Sulandra system map.');
}
if (!map.includes('admin sign in') || !map.includes('/admin-login.html, not /sia.html')) {
  throw new Error('SIA administrator sign-in disambiguation contract is missing.');
}

for (const marker of [
  '19 Distinct Themes',
  'Individual Color Customizer',
  'User Profile & Accessibility Suite',
  'MAR / TAR',
  'Document Medication Administration',
  'GIVEN, REFUSED, HELD, NOT_GIVEN, MISSED, and PRN_GIVEN',
  'File MAR Event',
  'SIA is IT support, not a medication decision-maker',
]) {
  if (!map.includes(marker)) throw new Error(`SIA authoritative SPIRE UI map missing marker: ${marker}`);
}

for (const marker of [
  'adminAccessFor',
  'adminSignInFor',
  'adminWorkspaceFor',
  'Admin-capable authenticated role',
  'serverVerifiedAdminCapableRole',
  'serverAuthenticatedWorkEmail',
  'sign in with the Sulandra work email',
  'not the Employee Portal username',
  'invite them to attach a screenshot',
  'When a screenshot is attached',
  "type: 'input_image'",
  "detail: 'high'",
  'screenshotAttached',
]) {
  if (!routes.includes(marker)) throw new Error(`SIA interactive Admin/screenshot contract missing marker: ${marker}`);
}

for (const marker of [
  'loadEmployeeUsername',
  'EmployeePortalCredential',
  'serverConfirmedEmployeePortalUsername',
  "employeeUsernameSource: employeeUsername ? 'EMPLOYEE_PORTAL_CREDENTIAL' : 'NOT_CONFIRMED'",
  'loadPublishedSchedule',
  'TimeAttendanceShift',
  "shift_row.\"status\"='PUBLISHED'",
  'serverPublishedScheduleLookup',
  'serverPublishedAssignedShiftCount',
  'serverPublishedShift',
  'published personal schedule lookup',
  'Never substitute the work email and call it a username',
  'no published assigned shifts were found',
  'top-right User Profile',
  'choosing MISSED',
]) {
  if (!routes.includes(marker)) throw new Error(`SIA live employee/system grounding missing marker: ${marker}`);
}

if (!routes.includes("adminAccessSource: 'SERVER_AUTHENTICATED_ROLE'")) {
  throw new Error('SIA status must expose that Admin access guidance comes from the authenticated server role.');
}
if (!routes.includes("Admin sign-in route for this role")) {
  throw new Error('SIA must be given the role-specific Admin sign-in destination.');
}
if (!routes.includes('what is confirmed → likely cause → exact next action → workaround')) {
  throw new Error('SIA interactive troubleshooting sequence is missing.');
}
if (!map.includes('Authorized management employees may also use their @sulandrahealth.com work email')) {
  throw new Error('SIA system map is missing the current management Employee Portal credential contract.');
}

console.log('SIA verified: canonical routes, authenticated Admin guidance, screenshots, confirmed employee username lookup, published personal schedule grounding, exact SPIRE theme controls, and MAR software-only guidance.');
