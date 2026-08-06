import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'api/src/time-attendance-location-scheduler-routes.ts');
let source = await readFile(file, 'utf8');
const broken = "await prisma.$executeRawUnsafe(`DELETE FROM \"TimeAttendanceShift\" WHERE \"organizationId\"=$1 AND \"locationId\"=$2 AND \"employeeId\"=$3 AND \"startTime\">=$4 AND \"startTime\"<$5`,a.organizationId,input.locationId,cell.employeeId,localDateTime(cell.date,'00:00',cell.timezoneOffsetMinutes),localDateTime(cell.date,'00:00',cell.timezoneOffsetMinutes-1440));";
const fixed = "const dayStart=localDateTime(cell.date,'00:00',cell.timezoneOffsetMinutes);const nextDay=new Date(dayStart.getTime()+86400000);await prisma.$executeRawUnsafe(`DELETE FROM \"TimeAttendanceShift\" WHERE \"organizationId\"=$1 AND \"locationId\"=$2 AND \"employeeId\"=$3 AND \"startTime\">=$4 AND \"startTime\"<$5`,a.organizationId,input.locationId,cell.employeeId,dayStart,nextDay);";
if (source.includes(broken)) source = source.replace(broken, fixed);
if (!source.includes('const dayStart=localDateTime')) throw new Error('Unable to verify Time and Attendance local-day replacement logic.');
await writeFile(file, source, 'utf8');
console.log('Time and Attendance scheduler local-time persistence is ready.');
