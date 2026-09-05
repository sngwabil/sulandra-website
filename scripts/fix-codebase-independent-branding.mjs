import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'Codebase.html');
let html = await readFile(target, 'utf8');

const legacyBrand = '<div class="brand-sub">base/sulandra-1.0 &nbsp;&nbsp; 4ceee554</div>';
const independentBrand = '<div class="brand-sub">Independent workspace</div>';

if (html.includes(legacyBrand)) {
  html = html.replace(legacyBrand, independentBrand);
} else if (!html.includes(independentBrand)) {
  throw new Error('Codebase workspace identity marker changed; refusing to publish ambiguous branding.');
}

html = html.replace(
  'Unable to load the real repository. Check Codebase API authentication or service health.',
  'Unable to load the Codebase workspace. Check Codebase API authentication or service health.',
);

if (html.includes('base/sulandra-1.0')) {
  throw new Error('Standalone Codebase must not display the Sulandra Health engineering branch.');
}
if (html.includes('Unable to load the real repository.')) {
  throw new Error('Standalone Codebase must not describe its workspace as the Sulandra Health repository.');
}
if (!html.includes(independentBrand)) {
  throw new Error('Standalone Codebase independent workspace identity is missing.');
}

await writeFile(target, html, 'utf8');
console.log(`Published standalone Codebase identity in ${target}`);
