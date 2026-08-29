import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='IT_AGENT_STATUS_BOARD_API_ORIGIN_FIX_V1';
const candidates=[
  path.join(root,'assets','it-agent-status-board-finalizer.js'),
  path.join(root,'dist-web','assets','it-agent-status-board-finalizer.js'),
];

const must=(condition,message)=>{if(!condition)throw new Error(`Status Board API-origin repair failed: ${message}`)};

function patch(source){
  if(source.includes(marker))return source;
  must(source.includes('IT_AGENT_STATUS_BOARD_FINALIZER_V4'),'finalizer v4 marker missing');
  must(source.includes("let activeHeaders=null,activeCredentials='same-origin';"),'active request state anchor missing');
  source=source.replace(
    "let activeHeaders=null,activeCredentials='same-origin';",
    "let activeHeaders=null,activeCredentials='same-origin',activeApiBase='';"
  );

  const helperAnchor="  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};";
  must(source.includes(helperAnchor),'helper anchor missing');
  const helper=`\n  // ${marker}: Status Board must follow the same API origin as the intercepted chat request.\n  // sulandrahealth.com serves the static UI while authenticated IT Agent traffic is sent to the Railway API.\n  const apiBaseFromRequest=input=>{\n    const raw=typeof input==='string'?input:String(input?.url||'');\n    try{\n      const parsed=new URL(raw,window.location.href);\n      if(!parsed.pathname.includes('/api/it-solutions/agent/chat'))return'';\n      return parsed.origin===window.location.origin?'':parsed.origin;\n    }catch{return''}\n  };\n  const apiUrl=pathname=>{\n    const configured=String(activeApiBase||window.SULANDRA_API_BASE||'').trim().replace(/\\/$/,'');\n    return configured?configured+pathname:pathname;\n  };`;
  source=source.replace(helperAnchor,helperAnchor+helper);

  must(source.includes("previousFetch('/api/it-solutions/agent/actions'"),'Action Center poll URL anchor missing');
  source=source.replace(
    "previousFetch('/api/it-solutions/agent/actions'",
    "previousFetch(apiUrl('/api/it-solutions/agent/actions')"
  );

  must(source.includes("previousFetch(`/api/it-solutions/agent/progress/${encodeURIComponent(requestId)}`"),'progress poll URL anchor missing');
  source=source.replace(
    "previousFetch(`/api/it-solutions/agent/progress/${encodeURIComponent(requestId)}`",
    "previousFetch(apiUrl(`/api/it-solutions/agent/progress/${encodeURIComponent(requestId)}`)"
  );

  const beginAnchor="stopPolling();activeRequestId=requestId;activeConversationId=conversationId||'';activeHeaders=cloneHeaders(input,init);activeCredentials=requestCredentials(input,init);const token=activePollToken;";
  must(source.includes(beginAnchor),'beginRequest anchor missing');
  source=source.replace(
    beginAnchor,
    "stopPolling();activeRequestId=requestId;activeConversationId=conversationId||'';activeHeaders=cloneHeaders(input,init);activeCredentials=requestCredentials(input,init);activeApiBase=apiBaseFromRequest(input);const token=activePollToken;"
  );

  must(source.includes(marker),'repair marker was not installed');
  must(source.includes("previousFetch(apiUrl('/api/it-solutions/agent/actions')"),'action polling still bypasses API origin helper');
  must(source.includes('previousFetch(apiUrl(`/api/it-solutions/agent/progress/'),'progress polling still bypasses API origin helper');
  return source;
}

let patched=0;
for(const file of candidates){
  try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  const original=await readFile(file,'utf8');
  const next=patch(original);
  if(next!==original){await writeFile(file,next,'utf8');patched+=1}
}
if(!patched){
  const existing=[];
  for(const file of candidates){try{const text=await readFile(file,'utf8');if(text.includes(marker))existing.push(file)}catch{}}
  must(existing.length>0,'no Status Board finalizer was found to patch');
}
console.log('IT Agent Status Board API-origin repair installed: progress and action polling now follow the same Railway API origin as the intercepted chat request.');
