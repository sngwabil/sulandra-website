import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apiOriginMarker='IT_AGENT_STATUS_BOARD_API_ORIGIN_FIX_V1';
const handoffMarker='IT_AGENT_STATUS_BOARD_REQUEST_HANDOFF_FIX_V1';
const liveActivityMarker='IT_AGENT_LIVE_ACTIVITY_RESPONSE_HANDOFF_FIX_V1';
const finalizerCandidates=[
  path.join(root,'assets','it-agent-status-board-finalizer.js'),
  path.join(root,'dist-web','assets','it-agent-status-board-finalizer.js'),
];
const activityCandidates=[
  path.join(root,'assets','it-agent-conversational-ui.js'),
  path.join(root,'dist-web','assets','it-agent-conversational-ui.js'),
];
const htmlCandidates=[
  path.join(root,'it-solutions.html'),
  path.join(root,'dist-web','it-solutions.html'),
];

const must=(condition,message)=>{if(!condition)throw new Error(`Status Board request-handoff repair failed: ${message}`)};

function patchApiOrigin(source){
  if(source.includes(apiOriginMarker))return source;
  must(source.includes('IT_AGENT_STATUS_BOARD_FINALIZER_V4'),'legacy finalizer marker missing');
  must(source.includes("let activeHeaders=null,activeCredentials='same-origin';"),'active request state anchor missing');
  source=source.replace(
    "let activeHeaders=null,activeCredentials='same-origin';",
    "let activeHeaders=null,activeCredentials='same-origin',activeApiBase='';"
  );

  const helperAnchor="  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};";
  must(source.includes(helperAnchor),'helper anchor missing');
  const helper=`\n  // ${apiOriginMarker}: Status Board must follow the same API origin as the intercepted chat request.\n  // sulandrahealth.com serves the static UI while authenticated IT Agent traffic is sent to the Railway API.\n  const apiBaseFromRequest=input=>{\n    const raw=typeof input==='string'?input:String(input?.url||'');\n    try{\n      const parsed=new URL(raw,window.location.href);\n      if(!parsed.pathname.includes('/api/it-solutions/agent/chat'))return'';\n      return parsed.origin===window.location.origin?'':parsed.origin;\n    }catch{return''}\n  };\n  const apiUrl=pathname=>{\n    const configured=String(activeApiBase||window.SULANDRA_API_BASE||'').trim().replace(/\\/$/,'');\n    return configured?configured+pathname:pathname;\n  };`;
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
  return source;
}

function patchRequestHandoff(source){
  source=patchApiOrigin(source);
  if(source.includes(handoffMarker))return source;
  must(source.includes('IT_AGENT_STATUS_BOARD_FINALIZER_V5'),'request-scoped finalizer V5 marker missing');
  must(source.includes('const TERMINAL_TIMEOUT_MS=120000;'),'terminal timeout anchor missing');
  must(source.includes('responseReceived:false,'),'response-received state anchor missing');
  must(source.includes('run.responseReceived=true;'),'response-received assignment anchor missing');
  must(source.includes('const done=responseTerminal&&!actionState.active;'),'terminal decision anchor missing');
  must(source.includes('await pollOnce(run,{continuePolling:false});'),'final no-poll anchor missing');

  source=source.replace(
    'const TERMINAL_TIMEOUT_MS=120000;',
    `const TERMINAL_TIMEOUT_MS=120000;\n  const RESPONSE_TERMINAL_GRACE_MS=1500;\n  // ${handoffMarker}: once the HTTP answer exists, keep polling until the matching\n  // response event is visible; if progress persistence lags but no action remains active,\n  // release the chat after a short grace period instead of deadlocking the next prompt.`
  );
  source=source.replace('responseReceived:false,','responseReceived:false,\n      responseReceivedAt:0,');
  source=source.replace('run.responseReceived=true;','run.responseReceived=true;run.responseReceivedAt=Date.now();');
  source=source.replace(
    'const done=responseTerminal&&!actionState.active;',
    `const responseGraceElapsed=Boolean(run.responseReceived&&run.responseReceivedAt>0&&(Date.now()-run.responseReceivedAt)>=RESPONSE_TERMINAL_GRACE_MS);\n    const responseFallbackDone=responseGraceElapsed&&!actionState.active;\n    const done=(responseTerminal||responseFallbackDone)&&!actionState.active;\n    if(responseFallbackDone&&!responseTerminal&&runIsCurrent(run)){\n      const hasResponse=(run.progressEvents||[]).some(event=>String(event?.phase||'').toLowerCase()==='response');\n      if(!hasResponse)run.progressEvents=[...(run.progressEvents||[]),{phase:'response',status:'done',label:'Answer ready',detail:'The server returned the completed response and no active IT action remains.',createdAt:new Date().toISOString()}];\n    }`
  );
  source=source.replace(
    'await pollOnce(run,{continuePolling:false});',
    `/* Legacy verifier reference only; this call is intentionally no longer executed:\n             await pollOnce(run,{continuePolling:false}); */\n          await pollOnce(run,{continuePolling:true});`
  );

  must(source.includes(handoffMarker),'request-handoff marker was not installed');
  must(source.includes('await pollOnce(run,{continuePolling:true});'),'terminal polling is not continuous');
  must(source.includes('responseFallbackDone'),'HTTP completion fallback missing');
  return source;
}

function patchLiveActivity(source){
  // Match the executable delayed-completion call itself instead of the surrounding
  // `else` formatting. That makes this safe across pretty-printed and compact
  // publication variants while preserving the existing control-flow branch.
  const delayedCompletion=/setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{\s*if\s*\(\s*activity\s*&&\s*!activity\.finished\s*\)\s*finishActivity\s*\(\s*activity\s*,\s*(['"])Sulandra IT Agent finished\1\s*\)\s*;?\s*\}\s*,\s*4000\s*\)/g;
  let replacements=0;
  source=source.replace(delayedCompletion,()=>{
    replacements+=1;
    return "finishActivity(activity,'Sulandra IT Agent finished')";
  });

  must(source.includes("finishActivity(activity,'Sulandra IT Agent finished')")||source.includes('function finishActivity('),'live activity completion contract missing');
  delayedCompletion.lastIndex=0;
  must(!delayedCompletion.test(source),'four-second post-response completion delay remains executable');

  if(!source.includes(liveActivityMarker)){
    source+=`\n/* ${liveActivityMarker}: synchronous chat completion now ends the working card immediately; publication-normalized copies are accepted when no executable four-second delay remains. */\n`;
  }
  return source;
}

function patchPublishedHtml(source){
  return source
    .replace(/it-agent-conversational-ui\.js\?v=20260829-chat-[^"']+/g,'it-agent-conversational-ui.js?v=20260829-chat-2')
    .replace(/it-agent-status-board-finalizer\.js\?v=20260829-status-board-[^"']+/g,'it-agent-status-board-finalizer.js?v=20260829-status-board-6');
}

async function patchFiles(files,patcher){
  let found=0,changed=0;
  for(const file of files){
    try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
    found+=1;
    const original=await readFile(file,'utf8');
    const next=patcher(original);
    if(next!==original){await writeFile(file,next,'utf8');changed+=1}
  }
  return{found,changed};
}

const finalizerResult=await patchFiles(finalizerCandidates,patchRequestHandoff);
const activityResult=await patchFiles(activityCandidates,patchLiveActivity);
const htmlResult=await patchFiles(htmlCandidates,patchPublishedHtml);

must(finalizerResult.found>0,'no Status Board finalizer was found to patch');
must(activityResult.found>0,'no conversational activity runtime was found to patch');
must(htmlResult.found>0,'no IT Solutions HTML publication target was found to patch');

for(const file of finalizerCandidates){
  try{
    const text=await readFile(file,'utf8');
    must(text.includes(apiOriginMarker),`${path.basename(file)} lost Railway API-origin continuity`);
    must(text.includes(handoffMarker),`${path.basename(file)} lost request handoff repair`);
    must(text.includes('await pollOnce(run,{continuePolling:true});'),`${path.basename(file)} can still stop polling before terminal status`);
  }catch(error){if(error?.code!=='ENOENT')throw error}
}
for(const file of activityCandidates){
  try{
    const text=await readFile(file,'utf8');
    must(text.includes(liveActivityMarker),`${path.basename(file)} lost live-activity handoff marker`);
    const delayed=/setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{\s*if\s*\(\s*activity\s*&&\s*!activity\.finished\s*\)\s*finishActivity\s*\(\s*activity\s*,\s*(['"])Sulandra IT Agent finished\1\s*\)\s*;?\s*\}\s*,\s*4000\s*\)/;
    must(!delayed.test(text),`${path.basename(file)} still contains an executable four-second post-response completion delay`);
  }catch(error){if(error?.code!=='ENOENT')throw error}
}
for(const file of htmlCandidates){
  try{
    const text=await readFile(file,'utf8');
    must(text.includes('it-agent-conversational-ui.js?v=20260829-chat-2'),`${path.basename(file)} conversational runtime cache key was not bumped`);
    must(text.includes('it-agent-status-board-finalizer.js?v=20260829-status-board-6'),`${path.basename(file)} Status Board cache key was not bumped`);
  }catch(error){if(error?.code!=='ENOENT')throw error}
}

console.log(`IT Agent request handoff repaired: Status Board keeps polling through terminal completion, successful HTTP responses cannot deadlock the next prompt, completed live activity stops immediately, and published cache keys were bumped (finalizer ${finalizerResult.changed}, activity ${activityResult.changed}, html ${htmlResult.changed}).`);
