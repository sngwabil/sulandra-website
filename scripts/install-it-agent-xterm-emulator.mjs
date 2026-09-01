import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=[path.join(root,'it-solutions.html'),path.join(root,'dist-web','it-solutions.html')];
const terminalAssets=[path.join(root,'assets','it-agent-real-terminal.js'),path.join(root,'dist-web','assets','it-agent-real-terminal.js')];
const marker='IT_AGENT_XTERM_EMULATOR_PUBLICATION_V4';
const head=`\n<!-- ${marker} -->\n<link rel="stylesheet" href="/assets/vendor/xterm.css?v=5.5.0">\n<link rel="stylesheet" href="/assets/it-agent-xterm-emulator.css?v=20260901-prod-17">\n`;
const body=`\n<!-- ${marker} -->\n<script src="/assets/vendor/sulandra-terminal-runtime.js?v=20260901-prod-15"></script>\n<script src="/assets/it-agent-terminal-session-resilience.js?v=20260901-session-2"></script>\n<script src="/assets/it-agent-terminal-wheel-scrollback.js?v=20260901-wheel-4"></script>\n<script src="/assets/it-agent-xterm-production-stack.js?v=20260901-prod-15"></script>\n<script src="/assets/it-agent-terminal-persistent-history.js?v=20260901-history-1"></script>\n<script src="/assets/it-agent-terminal-caret-clock.js?v=20260901-prod-15"></script>\n<script src="/assets/it-agent-terminal-caret-ui.js?v=20260901-prod-15"></script>\n`;

const legacyRestart=`  const restartTerminal=async()=>{\n    const old=activeSession();\n    if(old)await closeTerminal(old.id);\n    await createTerminal();\n  };`;
const scopedRestart=`  const restartTerminal=async()=>{\n    const old=activeSession();\n    if(!old){await createTerminal();return}\n    const index=sessions.indexOf(old);\n    if(index<0){await createTerminal();return}\n    try{\n      const currentWorkspace=await ensureWorkspace();\n      const data=await apiRequest('/api/it-solutions/terminal/workspaces/'+encodeURIComponent(currentWorkspace)+'/sessions',{method:'POST',body:JSON.stringify({cols:120,rows:34})});\n      const replacement={id:String(data.sessionId||''),cursor:0,output:'',rawOutput:'',alive:true,polling:false};\n      if(!replacement.id)throw new Error('Terminal worker did not return a replacement session ID');\n      try{await apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(old.id),{method:'DELETE'})}catch{}\n      sessions.splice(index,1,replacement);\n      activeId=replacement.id;\n      persistSessions();\n      renderTabs();\n      renderScreen();\n      if(!xtermActive(replacement.id))await pollSession(replacement);\n      terminalRoot?.querySelector('#itwsRtCommand')?.focus();\n    }catch(error){\n      setWorkerState(false,error?.message||'Unable to restart terminal');\n      appendSystem(error?.message||'Unable to restart terminal');\n    }\n  };`;

for(const asset of terminalAssets){
  try{await access(asset)}catch{continue}
  let source=await readFile(asset,'utf8');
  if(source.includes(legacyRestart))source=source.replace(legacyRestart,scopedRestart);
  if(!source.includes("const index=sessions.indexOf(old);")||!source.includes('sessions.splice(index,1,replacement);')){
    throw new Error(`Active-terminal-only restart patch missing in ${path.relative(root,asset)}`);
  }
  await writeFile(asset,source,'utf8');
}

for(const target of targets){
  try{await access(target)}catch{continue}
  let html=await readFile(target,'utf8');
  html=html.replace(/\/assets\/it-agent-real-terminal\.js\?v=[^"']+/g,'/assets/it-agent-real-terminal.js?v=20260901-real-terminal-7');
  html=html.replace(/\n?<!-- IT_AGENT_XTERM_EMULATOR_PUBLICATION_V[1234] -->\n(?:<link[^>]+>\n?)+/g,'\n');
  html=html.replace(/\n?<!-- IT_AGENT_XTERM_EMULATOR_PUBLICATION_V[1234] -->\n(?:<script[^>]+><\/script>\n?)+/g,'\n');
  if(!html.includes('</head>')||!html.includes('</body>'))throw new Error(`Unable to publish terminal emulator into ${path.relative(root,target)}`);
  html=html.replace('</head>',head+'</head>').replace('</body>',body+'</body>');
  await writeFile(target,html,'utf8');
  console.log(`Published xterm WSS runtime, normal scrollback, session resilience, transcript viewer, and active-terminal-only restart in ${path.relative(root,target)}.`);
}
