import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const coursePath = path.join(repoRoot, 'courses', 'sh-cap-101.html');
let html = fs.readFileSync(coursePath, 'utf8');

const oldMarker = 'SH_CAP_101_ILLUSTRATIONS_V1';
const newMarker = 'SH_CAP_101_INSTRUCTIONAL_VISUALS_V2';

// Remove the former stock-photo CSS block.
html = html.replace(
  /\/\* SH_CAP_101_ILLUSTRATIONS_V1 \*\/[\s\S]*?(?=<\/style>)/,
  `/* ${newMarker} */\n.course-illustration{display:none!important}\n.visual-card.is-illustrated{display:flex}\n`
);

// Remove the former inline Unsplash enhancement script.
html = html.replace(
  new RegExp(`<script data-enhancement="${oldMarker}">[\\s\\S]*?<\\/script>`, 'g'),
  ''
);

// Remove prior instructional script tags so the integration remains idempotent.
html = html.replace(
  /<script[^>]+src=["']\/courses\/sh-cap-101-instructional-visuals\.js[^"']*["'][^>]*><\/script>/g,
  ''
);

const integration = `\n<script data-enhancement="${newMarker}" src="/courses/sh-cap-101-instructional-visuals.js?v=20260802-2" defer></script>\n`;
html = html.replace('</body>', `${integration}</body>`);

fs.writeFileSync(coursePath, html);
console.log('Removed stock-photo enhancement and linked SH-CAP-101 instructional visuals on the live course.');
