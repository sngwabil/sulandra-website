import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=['intranet.html'];
const asset='<script src="/assets/intranet-live-integration.js?v=20260806-platform-integration-1"></script>';
for(const name of targets){
  const target=path.join(root,name);
  let html=await readFile(target,'utf8');
  html=html.replace(/\s*<script src="\/assets\/intranet-live-integration\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('</body>'))throw new Error(`Unable to install intranet integration in ${name}`);
  html=html.replace('</body>',`${asset}\n</body>`);
  await writeFile(target,html,'utf8');
}
console.log('Intranet navigation and live employee data integration installed.');
