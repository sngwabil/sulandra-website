import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cssPath=path.join(root,'assets','it-agent-real-terminal.css');
const jsPath=path.join(root,'assets','it-agent-real-terminal.js');
await Promise.all([access(cssPath),access(jsPath)]);

const cssTag='<link rel="stylesheet" href="/assets/it-agent-real-terminal.css?v=20260830-real-terminal-1">';
const jsTag='<script src="/assets/it-agent-real-terminal.js?v=20260830-real-terminal-1"></script>';
const targets=[path.join(root,'it-solutions.html'),path.join(root,'dist-web','it-solutions.html')];

for(const target of targets){
  try{await access(target)}catch{continue}
  let html=await readFile(target,'utf8');
  html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-real-terminal\.css(?:\?v=[^"']+)?">\s*/g,'\n');
  html=html.replace(/\s*<script src="\/assets\/it-agent-real-terminal\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('</head>')||!html.includes('</body>'))throw new Error(`Real terminal publication anchors changed in ${target}`);
  html=html.replace('</head>',`${cssTag}\n</head>`);
  html=html.replace('</body>',`${jsTag}\n</body>`);
  await writeFile(target,html,'utf8');
}

const js=await readFile(jsPath,'utf8');
const css=await readFile(cssPath,'utf8');
for(const marker of ['IT_AGENT_REAL_TERMINAL_V1','itwsRealTerminal','itwsRtNewTab','/api/it-solutions/terminal/','Tell Sulandra','Real Terminal']){
  if(!js.includes(marker))throw new Error(`Real terminal JavaScript missing ${marker}`);
}
for(const marker of ['IT_AGENT_REAL_TERMINAL_V1','.itws-real-terminal','.itws-rt-screen','itws-status-board-open']){
  if(!css.includes(marker))throw new Error(`Real terminal CSS missing ${marker}`);
}
const syntax=spawnSync(process.execPath,['--check',jsPath],{encoding:'utf8'});
if(syntax.status!==0)throw new Error(`Real terminal JavaScript syntax failed: ${String(syntax.stderr||syntax.stdout||'unknown syntax error').trim()}`);
console.log('IT Solutions real terminal published: isolated multi-session shell and Tell Sulandra mode are available without altering Status Board or Action Center.');
