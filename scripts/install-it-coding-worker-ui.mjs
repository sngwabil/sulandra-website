import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=[path.join(root,'it-solutions.html'),path.join(root,'dist-web','it-solutions.html')];
const tag='<script src="/assets/it-coding-worker-ui.js?v=20260828-worker-1"></script>';
for(const target of targets){
  try{await access(target)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  let source=await readFile(target,'utf8');
  source=source.replace(/\s*<script src="\/assets\/it-coding-worker-ui\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!source.includes('</body>'))throw new Error(`IT coding-worker UI publisher could not find </body> in ${target}`);
  source=source.replace('</body>',`${tag}\n</body>`);
  await writeFile(target,source,'utf8');
}
console.log('Trusted coding-worker approval controls published into IT Solutions.');
