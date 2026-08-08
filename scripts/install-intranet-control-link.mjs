import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'dist-web', 'admin.html');
let html = await readFile(target, 'utf8');

// Remove the old floating bottom-right control completely.
html = html.replace(/\s*<a id="intranet-content-control-link"[\s\S]*?<\/a>\s*/g, '\n');

// Add the same destination to the existing left-side Core Portal Navigation.
// admin-three-panel-consolidation.js mirrors controls from #sideModuleNav into the
// left slide-out Operations rail, so preserving the original side navigation item
// keeps the same intranet-control.html function without a floating dashboard tab.
const control = '<a id="intranet-content-control-link" href="/intranet-control.html" class="side-btn"><span>Manage Intranet Content</span><small>Publishing</small></a>';

if (!html.includes('id="sideModuleNav"')) {
  throw new Error('Unable to locate Admin left navigation for Intranet Content Control.');
}

html = html.replace(
  /(<[^>]+id="sideModuleNav"[^>]*>)/i,
  `$1\n${control}`,
);

if (!html.includes('href="/intranet-control.html"')) {
  throw new Error('Unable to expose Intranet Content Control in the left Operations menu.');
}

await writeFile(target, html, 'utf8');
console.log('Manage Intranet Content now lives in the left slide-out Operations menu.');
