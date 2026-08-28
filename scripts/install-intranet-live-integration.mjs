import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=['intranet.html'];
const assets=[
  '<script src="/assets/intranet-live-integration.js?v=20260807-platform-integration-2"></script>',
  '<script src="/assets/intranet-content-app.js?v=20260807-content-control-1"></script>'
];
for(const name of targets){
  const target=path.join(root,name);
  let html=await readFile(target,'utf8');
  html=html
    .replace(/\s*<script src="\/assets\/intranet-live-integration\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n')
    .replace(/\s*<script src="\/assets\/intranet-content-app\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('</body>'))throw new Error(`Unable to install intranet integration in ${name}`);
  html=html.replace('</body>',`${assets.join('\n')}\n</body>`);
  await writeFile(target,html,'utf8');
}

// Section 9 Admin navigation must be part of canonical source before
// build-static-site copies it into dist-web. This preserves the owner Admin
// canonical-source invariant while making IT Solutions directly reachable.
await import('./install-it-solutions-navigation.mjs');

console.log('Intranet keeps its existing design while live data and managed editorial content are connected; IT Solutions navigation is installed before static publication.');
