import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const cssHref='/assets/sia-copilot.css?v=20260826-global-copilot-1';
const jsSrc='/assets/sia-copilot.js?v=20260826-global-copilot-1';
const marker='data-sia-global-copilot="20260826-global-copilot-1"';

const cssPath=path.join(dist,'assets','sia-copilot.css');
const jsPath=path.join(dist,'assets','sia-copilot.js');
for(const required of [cssPath,jsPath]){
  try{await stat(required);}catch{throw new Error(`Global SIA copilot publication asset missing: ${path.relative(dist,required)}`);}
}

async function htmlFiles(directory){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const full=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await htmlFiles(full));
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.html'))output.push(full);
  }
  return output;
}

const files=await htmlFiles(dist);
let injected=0,standalone=0;
for(const file of files){
  const relative=path.relative(dist,file).replace(/\\/g,'/');
  let html=await readFile(file,'utf8');
  if(relative.toLowerCase()==='sia.html'){
    if(!html.includes('/assets/sia.js'))throw new Error('Standalone SIA page no longer contains its full assistant runtime');
    standalone+=1;
    continue;
  }
  html=html
    .replace(/\s*<link[^>]+href=["']\/assets\/sia-copilot\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi,'\n')
    .replace(/\s*<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi,'\n');
  const css=`<link rel="stylesheet" href="${cssHref}" ${marker} />`;
  const script=`<script src="${jsSrc}" defer ${marker}></script>`;
  if(/<\/head>/i.test(html))html=html.replace(/<\/head>/i,`${css}\n</head>`);else html=`${css}\n${html}`;
  if(/<\/body>/i.test(html))html=html.replace(/<\/body>/i,`${script}\n</body>`);
  else if(/<\/html>/i.test(html))html=html.replace(/<\/html>/i,`${script}\n</html>`);
  else html+=`\n${script}\n`;
  await writeFile(file,html,'utf8');
  injected+=1;
}

const verify=await htmlFiles(dist);
for(const file of verify){
  const relative=path.relative(dist,file).replace(/\\/g,'/');
  const html=await readFile(file,'utf8');
  if(relative.toLowerCase()==='sia.html')continue;
  for(const required of [marker,cssHref,jsSrc])if(!html.includes(required))throw new Error(`Ask SIA global copilot is missing ${required} from ${relative}`);
}

if(!injected)throw new Error('No published HTML pages received the global Ask SIA copilot');
console.log(`Ask SIA global copilot published across ${injected} HTML page(s); ${standalone} standalone SIA workspace page(s) retain the full assistant instead of a duplicate drawer.`);
