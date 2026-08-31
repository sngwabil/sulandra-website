import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=[path.join(root,'it-solutions.html'),path.join(root,'dist-web','it-solutions.html')];
const marker='IT_AGENT_XTERM_EMULATOR_PUBLICATION_V2';
const head=`\n<!-- ${marker} -->\n<link rel="stylesheet" href="/assets/vendor/xterm.css?v=5.5.0">\n<link rel="stylesheet" href="/assets/it-agent-xterm-emulator.css?v=20260831-prod-9">\n`;
const body=`\n<!-- ${marker} -->\n<script src="/assets/vendor/sulandra-terminal-runtime.js?v=20260831-prod-9"></script>\n<script src="/assets/it-agent-xterm-production-stack.js?v=20260831-prod-9"></script>\n`;

for(const target of targets){
  try{await access(target)}catch{continue}
  let html=await readFile(target,'utf8');
  html=html.replace(/\/assets\/it-agent-real-terminal\.js\?v=[^"']+/g,'/assets/it-agent-real-terminal.js?v=20260831-real-terminal-6');
  html=html.replace(/\n?<!-- IT_AGENT_XTERM_EMULATOR_PUBLICATION_V1 -->[\s\S]*?(?=<\/head>)/g,'\n');
  html=html.replace(/\n?<!-- IT_AGENT_XTERM_EMULATOR_PUBLICATION_V2 -->[\s\S]*?(?=<\/head>)/g,'\n');
  html=html.replace(/\n?<!-- IT_AGENT_XTERM_EMULATOR_PUBLICATION_V1 -->\n<script[^>]+xterm\.js[^>]*><\/script>\n<script[^>]+addon-fit\.js[^>]*><\/script>\n<script[^>]+it-agent-xterm-emulator\.js[^>]*><\/script>(?:\n<script[^>]+it-agent-xterm-interrupt-fix\.js[^>]*><\/script>)?\n?/g,'\n');
  html=html.replace(/\n?<!-- IT_AGENT_XTERM_EMULATOR_PUBLICATION_V2 -->\n<script[^>]+sulandra-terminal-runtime\.js[^>]*><\/script>\n<script[^>]+it-agent-xterm-production-stack\.js[^>]*><\/script>\n?/g,'\n');
  if(!html.includes('</head>')||!html.includes('</body>'))throw new Error(`Unable to publish terminal emulator into ${path.relative(root,target)}`);
  html=html.replace('</head>',head+'</head>').replace('</body>',body+'</body>');
  await writeFile(target,html,'utf8');
  console.log(`Published full xterm WSS runtime in ${path.relative(root,target)}.`);
}
