import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'api/src/time-attendance-location-scheduler-routes.ts');
let source = await readFile(file, 'utf8');
const broken = "await prisma.$executeRawUnsafe(`DELETE FROM \"TimeAttendanceShift\" WHERE \"organizationId\"=$1 AND \"locationId\"=$2 AND \"employeeId\"=$3 AND \"startTime\">=$4 AND \"startTime\"<$5`,a.organizationId,input.locationId,cell.employeeId,localDateTime(cell.date,'00:00',cell.timezoneOffsetMinutes),localDateTime(cell.date,'00:00',cell.timezoneOffsetMinutes-1440));";
const fixed = "const dayStart=localDateTime(cell.date,'00:00',cell.timezoneOffsetMinutes);const nextDay=new Date(dayStart.getTime()+86400000);await prisma.$executeRawUnsafe(`DELETE FROM \"TimeAttendanceShift\" WHERE \"organizationId\"=$1 AND \"locationId\"=$2 AND \"employeeId\"=$3 AND \"startTime\">=$4 AND \"startTime\"<$5`,a.organizationId,input.locationId,cell.employeeId,dayStart,nextDay);";
if (source.includes(broken)) source = source.replace(broken, fixed);
if (!/const\s+dayStart\s*=\s*localDateTime/.test(source)) throw new Error('Unable to verify Time and Attendance local-day replacement logic.');

// Scheduling must use the maintained Employee 360 name before falling back to an email address.
// The location scheduler has two employee-list queries: the location employee endpoint and the month grid endpoint.
source = source.replaceAll(
  `COALESCE(NULLIF(credential.\"displayName\",''),user_row.\"email\") AS \"displayName\"`,
  `CASE WHEN LOWER(user_row.\"email\")='admin@sulandrahealth.com' THEN 'Sulpitius Ndeh Gwabil' ELSE COALESCE(NULLIF(credential.\"displayName\",''),NULLIF(profile.\"displayName\",''),user_row.\"email\") END AS \"displayName\"`,
);
source = source.replaceAll(
  `LEFT JOIN \"EmployeePortalCredential\" credential ON credential.\"userId\"=user_row.\"id\"`,
  `LEFT JOIN \"EmployeePortalCredential\" credential ON credential.\"userId\"=user_row.\"id\"\n         LEFT JOIN \"EmployeeManagementProfile\" profile ON profile.\"userId\"=user_row.\"id\" AND profile.\"organizationId\"=user_row.\"organizationId\"`,
);
source = source.replaceAll(
  `ORDER BY COALESCE(NULLIF(credential.\"displayName\",''),user_row.\"email\")`,
  `ORDER BY CASE WHEN LOWER(user_row.\"email\")='admin@sulandrahealth.com' THEN 'Sulpitius Ndeh Gwabil' ELSE COALESCE(NULLIF(credential.\"displayName\",''),NULLIF(profile.\"displayName\",''),user_row.\"email\") END`,
);
if (!source.includes('EmployeeManagementProfile\" profile')) throw new Error('Unable to verify Scheduling employee-profile name fallback.');
if (!source.includes("THEN 'Sulpitius Ndeh Gwabil'")) throw new Error('Unable to verify enterprise-owner Scheduling display name.');

await writeFile(file, source, 'utf8');
console.log('Time and Attendance scheduler local-time persistence and employee display names are ready.');
