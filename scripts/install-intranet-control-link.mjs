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
// The slide-out Operations rail mirrors #sideModuleNav, so this preserves the
// exact intranet-control function while removing the floating dashboard button.
const control = '<a id="intranet-content-control-link" href="/intranet-control.html" class="side-btn"><span>Manage Intranet Content</span><small>Publishing</small></a>';
if (!html.includes('id="sideModuleNav"')) {
  throw new Error('Unable to locate Admin left navigation for Intranet Content Control.');
}
html = html.replace(/(<[^>]+id="sideModuleNav"[^>]*>)/i, `$1\n${control}`);
if (!html.includes('href="/intranet-control.html"')) {
  throw new Error('Unable to expose Intranet Content Control in the left Operations menu.');
}

// Scheduling is a separate application. Do not leave it as a local Admin module,
// because admin-railway.js falls back when module-scheduling does not exist and
// Time & Attendance integration code can also observe the same click.
html = html
  .replace(
    /<a\s+data-module=["']scheduling["']\s*>\s*Scheduling\s*<\/a>/gi,
    '<a href="/scheduling.html" data-sulandra-scheduling-link="true">Scheduling</a>',
  )
  .replace(
    /<button([^>]*?)data-module=["']scheduling["']([^>]*)>\s*Scheduling([\s\S]*?)<\/button>/gi,
    '<button$1data-sulandra-scheduling-link="true"$2 onclick="window.location.assign(\'/scheduling.html\')">Scheduling$3</button>',
  );

// Final, highest-priority navigation guard. A window capture listener sees the
// click before document-level Time & Attendance and Admin module handlers.
const schedulingGuardId = 'sulandra-dedicated-scheduling-route';
html = html.replace(new RegExp(`\\s*<script id="${schedulingGuardId}">[\\s\\S]*?<\\/script>\\s*`, 'g'), '\n');
const schedulingGuard = `\n<script id="${schedulingGuardId}">\n(() => {\n  const target = '/scheduling.html';\n  window.addEventListener('click', (event) => {\n    const control = event.target?.closest?.('[data-sulandra-scheduling-link="true"], [data-module="scheduling"]');\n    if (!control) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    window.location.assign(target);\n  }, true);\n})();\n</script>\n`;
if (!html.includes('</body>')) throw new Error('Unable to install dedicated Scheduling route guard.');
html = html.replace('</body>', `${schedulingGuard}</body>`);

if (!html.includes('data-sulandra-scheduling-link="true"')) {
  throw new Error('Admin Scheduling controls were not converted to the dedicated Scheduling route.');
}
await writeFile(adminPath, html, 'utf8');

// Scheduling is a dedicated administrator workforce scheduler, not a Time & Attendance view.
// The existing scheduler asset contains the location selector, monthly employee/day grid,
// shift editing, Save & Publish, employee search and 1/3/6/12 month copy controls.
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

// Time & Attendance must not load or own the workforce scheduler module.
const attendancePath = path.join(dist, 'time-attendance.html');
let attendance = await readFile(attendancePath, 'utf8');
attendance = attendance.replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
await writeFile(attendancePath, attendance, 'utf8');

console.log('Manage Intranet Content moved to the left Operations menu; Scheduling is hard-routed to /scheduling.html and separated from Time & Attendance.');
