import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'admin.html');
const target = 'https://www.sulandrahealth.com/time-attendance.html#admin';

let html = await readFile(adminPath, 'utf8');
const original = html;

// The admin portal previously treated Time & Attendance as an empty local module.
// Make both navigation controls explicit links to the dedicated static frontend.
html = html
  .replace(
    /<a\s+data-module=["']time["']\s*>\s*Time\s*&amp;\s*Attendance\s*<\/a>/gi,
    `<a href="${target}" data-time-attendance-admin-link="true">Time &amp; Attendance</a>`,
  )
  .replace(
    /<a\s+data-module=["']time["']\s*>\s*Time\s*&\s*Attendance\s*<\/a>/gi,
    `<a href="${target}" data-time-attendance-admin-link="true">Time &amp; Attendance</a>`,
  )
  .replace(
    /<button([^>]*?)data-module=["']time["']([^>]*)>\s*Time\s*&amp;\s*Attendance([\s\S]*?)<\/button>/gi,
    `<button$1data-time-attendance-admin-link="true"$2 onclick="window.location.assign('${target}')">Time &amp; Attendance$3</button>`,
  )
  .replace(
    /<button([^>]*?)data-module=["']time["']([^>]*)>\s*Time\s*&\s*Attendance([\s\S]*?)<\/button>/gi,
    `<button$1data-time-attendance-admin-link="true"$2 onclick="window.location.assign('${target}')">Time &amp; Attendance$3</button>`,
  );

if (!html.includes(`href="${target}"`)) {
  throw new Error('Admin Time & Attendance top-navigation link was not found or repaired.');
}
if (!html.includes(`window.location.assign('${target}')`)) {
  throw new Error('Admin Time & Attendance sidebar button was not found or repaired.');
}

// Add a final delegated safeguard after all existing admin handlers.
const safeguardId = 'sulandra-admin-time-attendance-direct-link';
html = html.replace(new RegExp(`\\s*<script id="${safeguardId}">[\\s\\S]*?<\\/script>\\s*`, 'g'), '\n');
const safeguard = `\n<script id="${safeguardId}">\n(() => {\n  const target = '${target}';\n  document.addEventListener('click', (event) => {\n    const control = event.target.closest('[data-time-attendance-admin-link="true"]');\n    if (!control) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    window.location.assign(target);\n  }, true);\n})();\n</script>\n`;
html = html.replace('</body>', `${safeguard}</body>`);

if (html !== original) {
  await writeFile(adminPath, html, 'utf8');
}

console.log('Admin Time & Attendance navigation now opens the dedicated admin scheduler.');
