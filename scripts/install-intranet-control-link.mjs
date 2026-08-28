import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

// Admin navigation and drawers remain canonical in assets/admin-company-context.js.
// This compatibility publisher owns the historical Scheduling separation and,
// after the static site exists, chains the isolated Section 9 IT Solutions
// launcher publisher without replacing either Admin desktop architecture.
const schedulerAssetPath = path.join(dist, 'assets', 'time-attendance-location-scheduler.js');
let scheduler = await readFile(schedulerAssetPath, 'utf8');
scheduler = scheduler
  .replace(
    "if (!/\\/time-attendance(?:\\.html|\\/)?$/i.test(location.pathname)) return;",
    "if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;",
  )
  .replace(
    "const admin = document.getElementById('admin');",
    "const admin = document.getElementById('schedulerHost') || document.getElementById('admin');",
  )
  .replace(
    'Time and Attendance · Staffing and Scheduling',
    'Sulandra Health · Workforce Scheduling',
  );
if (!scheduler.includes("if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;")) {
  throw new Error('Scheduling runtime is not scoped to scheduling.html.');
}
if (!scheduler.includes("document.getElementById('schedulerHost')")) {
  throw new Error('Workforce scheduler cannot mount on scheduling.html.');
}
await writeFile(schedulerAssetPath, scheduler, 'utf8');

const attendancePath = path.join(dist, 'time-attendance.html');
let attendance = await readFile(attendancePath, 'utf8');
attendance = attendance.replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
await writeFile(attendancePath, attendance, 'utf8');

await import('./install-it-solutions-navigation.mjs');

console.log('Scheduling separation and isolated IT Solutions Admin launchers published without replacing canonical Admin drawers, dashboard, or shell.');
