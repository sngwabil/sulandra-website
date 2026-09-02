import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'scripts','install-it-agent-owner-autorelease.mjs');
let source=await readFile(target,'utf8');

const broken=/const resultDetailNew="([^"]*)\\n\$\{resultDetailOld\}";/;
if(broken.test(source)){
  source=source.replace(broken,'const resultDetailNew="$1\\n"+resultDetailOld;');
  await writeFile(target,source,'utf8');
}

if(source.includes('\\n${resultDetailOld}";'))throw new Error('Owner auto-release live-runtime interpolation repair did not apply');
if(!source.includes('const resultDetailNew=')||!source.includes('+resultDetailOld;'))throw new Error('Owner auto-release live-runtime composition contract is missing');
console.log('Owner auto-release installer repaired: live resultDetail source is composed as JavaScript instead of publishing a literal ${resultDetailOld} token.');
