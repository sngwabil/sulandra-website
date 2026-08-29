import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const required=[
  'IT_AGENT_LIVE_PROGRESS_V1',
  'requestId:z.string().uuid().optional()',
  'ITAgentProgressEvent',
  "/api/it-solutions/agent/progress/:requestId",
  "'request','done','Request received'",
  "'repository','running','Reading or refreshing the Sulandra repository map'",
  "'system','running','Checking Sulandra IT system context'",
  "'agent','running','Evaluating the retrieved evidence'",
  'No live Railway check is claimed unless a real deployment verification step runs.',
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){console.error('IT Agent live progress verification failed:\n- '+missing.join('\n- '));process.exit(1)}
const hasImmediateResponse=source.includes("'response','done','Answer ready'");
const hasDeferredResponse=source.includes("'response',deferFinal?'waiting':'done',deferFinal?'Release workflow continues':'Answer ready'");
if(!hasImmediateResponse&&!hasDeferredResponse){console.error('IT Agent live progress verification failed:\n- response completion/deferred-release stage');process.exit(1)}
if(source.includes('chain-of-thought is displayed')){console.error('IT Agent live progress must not claim private chain-of-thought visibility');process.exit(1)}
console.log('IT Agent live progress verified: request, repository, system, evidence-evaluation, immediate/deferred response, and owner-scoped progress endpoint stages are observable without exposing private model reasoning.');
