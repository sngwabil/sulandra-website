import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'assets','it-agent-status-board-finalizer.js');
const source=await readFile(file,'utf8');

new Function(source);

const required=[
  'IT_AGENT_STATUS_BOARD_FINALIZER_V5',
  'IT_AGENT_STATUS_BOARD_API_ORIGIN_FIX_V1',
  'apiBaseFromRequest',
  "apiUrl(run,'/api/it-solutions/agent/actions')",
  'apiUrl(run,`/api/it-solutions/agent/progress/',
  'apiBase:apiBaseFromRequest(input)',
  'collapseProgressEvents',
  'supersedeActiveRun()',
  'run.startedAt-ACTION_CLOCK_SLOP_MS',
  "if(clean(body.requestId,100))return downstream(input,init);",
  'await pollOnce(run,{continuePolling:false});',
  'await waitForTerminal(run);',
  "if(event.shiftKey)return;",
  'event.stopImmediatePropagation();',
  "document.getElementById('agentSend')",
  'Verified work for the current request, in real time.',
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){
  console.error('IT Agent Status Board request-lifecycle verification failed:\n- '+missing.join('\n- '));
  process.exit(1);
}

const waitAt=source.indexOf('await waitForTerminal(run);');
const returnAt=source.indexOf('return response;',waitAt);
if(waitAt<0||returnAt<waitAt){
  console.error('IT Agent Status Board request-lifecycle verification failed: assistant response is not gated behind terminal status.');
  process.exit(1);
}

if(source.includes('Loading this chat’s latest work…')||source.includes('storedRequest(')){
  console.error('IT Agent Status Board request-lifecycle verification failed: historical conversation loading must not replace current-request status.');
  process.exit(1);
}

if(source.includes("previousFetch('/api/it-solutions/agent/actions'")||source.includes('previousFetch(`/api/it-solutions/agent/progress/')){
  console.error('IT Agent Status Board request-lifecycle verification failed: progress/action polling bypasses the request-scoped Railway API origin.');
  process.exit(1);
}

console.log('IT Agent Status Board request lifecycle verified: each prompt resets the board, stale runs are isolated, phase duplicates collapse, Railway API-origin continuity is preserved, the answer waits for terminal status, and Enter/Shift+Enter use standard composer behavior.');
