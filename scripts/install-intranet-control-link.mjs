import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const adminPath = path.join(dist, 'admin.html');
let html = await readFile(adminPath, 'utf8');

// Remove the old floating bottom-right control completely.
html = html.replace(/\s*<a id="intranet-content-control-link"[\s\S]*?<\/a>\s*/g, '\n');

// Add the same destination to the existing left-side Core Portal Navigation.
// admin-three-panel-consolidation.js mirrors controls from #sideModuleNav into the
// left slide-out Operations rail, so the function remains exactly the same.
const control = '<a id="intranet-content-control-link" href="/intranet-control.html" class="side-btn"><span>Manage Intranet Content</span><small>Publishing</small></a>';
if (!html.includes('id="sideModuleNav"')) {
  throw new Error('Unable to locate Admin left navigation for Intranet Content Control.');
}
html = html.replace(/(<[^>]+id="sideModuleNav"[^>]*>)/i, `$1\n${control}`);
if (!html.includes('href="/intranet-control.html"')) {
  throw new Error('Unable to expose Intranet Content Control in the left Operations menu.');
}
await writeFile(adminPath, html, 'utf8');

// Scheduling is a dedicated administrator workforce scheduler, not a Time & Attendance view.
// The existing scheduler asset already contains the location selector, monthly employee/day
// grid, shift editing, Save & Publish, employee search and 1/3/6/12 month copy controls.
// Route that asset only to scheduling.html and mount it in the dedicated scheduler host.
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
if (!scheduler.includes("document.getElementById('schedulerHost')")) {
  throw new Error('Unable to mount the workforce scheduler on scheduling.html.');
}
await writeFile(schedulerAssetPath, scheduler, 'utf8');

// Ensure Time & Attendance does not load the workforce scheduler module anymore.
const attendancePath = path.join(dist, 'time-attendance.html');
let attendance = await readFile(attendancePath, 'utf8');
attendance = attendance.replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
await writeFile(attendancePath, attendance, 'utf8');

console.log('Manage Intranet Content moved to the left Operations menu; Scheduling is now separate from Time & Attendance.');
