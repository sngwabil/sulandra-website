import {access,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const target=path.resolve(process.argv[2]||'Codebase.html');
const runtime=path.resolve('assets/codebase-preview-environments.js');
await access(target);await access(runtime);
const source=await readFile(runtime,'utf8');
for(const marker of ['CODEBASE_PREVIEW_ENVIRONMENTS_V2','Railway Production','codebase-preview-env-badge','/api/preview-ticket','/railway/preview']){
  if(!source.includes(marker))throw new Error(`Codebase preview runtime missing ${marker}`);
}
let html=await readFile(target,'utf8');
const tag='<script src="/assets/codebase-preview-environments.js?v=20260907-preview-environments-2"></script>';
html=html.replace(/\s*<script src="\/assets\/codebase-preview-environments\.js(?:\?v=[^\"]*)?"><\/script>\s*/g,'\n');
const bodyIndex=html.toLowerCase().lastIndexOf('</body>');
if(bodyIndex<0)throw new Error('Codebase document body closing tag is missing');
html=html.slice(0,bodyIndex)+tag+'\n'+html.slice(bodyIndex);
if(!html.includes(tag))throw new Error('Codebase preview environment runtime was not published');
if(html.indexOf(tag)!==html.lastIndexOf(tag))throw new Error('Codebase preview environment runtime must be published exactly once');
await writeFile(target,html,'utf8');
console.log(`Published explicit Local | Railway Production Preview modes in ${target}`);
