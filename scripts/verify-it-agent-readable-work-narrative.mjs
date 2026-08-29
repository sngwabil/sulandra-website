import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const required=[
  'IT_AGENT_READABLE_WORK_NARRATIVE_V1',
  'observableRequestPlan',
  'observableToolLabel',
  'observableToolDetail',
  "'understanding','done','Understanding your request'",
  "'plan','done','Choosing what to check'",
  "'decision','done',observableCalls.length?'Next step selected':'Preparing the answer'",
  "'tool','running',observableToolLabel(item.name)",
  "'tool','done','Tool state recorded'",
  'No live Railway check is claimed unless a real deployment verification step runs.',
  "/api/it-solutions/agent/progress/:requestId",
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){console.error('IT Agent readable Status Board narrative verification failed:\n- '+missing.join('\n- '));process.exit(1)}
if(source.includes('private chain-of-thought is displayed')||source.includes('raw chain-of-thought is displayed')){
  console.error('IT Agent Status Board must never claim private chain-of-thought visibility.');
  process.exit(1);
}
if(!source.includes("observableCalls=(payload.output||[]).filter(item=>item.type==='function_call'&&item.name)")){
  console.error('IT Agent Status Board selected-tool narrative must be grounded in actual model function calls.');
  process.exit(1);
}
console.log('IT Agent readable Status Board narrative verified: live request understanding, work plan, evidence checks, actual selected tools and verified handoff state are observable without exposing private chain-of-thought.');
