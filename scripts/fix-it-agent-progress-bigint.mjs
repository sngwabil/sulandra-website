import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'api','src','it-agent-workbench-routes.ts');
const marker='IT_AGENT_PROGRESS_BIGINT_SERIALIZATION_V1';
let source=await readFile(file,'utf8');

const routeAnchor="app.get('/api/it-solutions/agent/progress/:requestId'";
if(!source.includes(routeAnchor))throw new Error('IT Agent progress route is missing; run install-it-agent-live-progress.mjs first.');

if(!source.includes(marker)){
  const typeBefore='sequence:number|string;conversationId:string|null;phase:string;status:string;label:string;detail:string;meta:Record<string,unknown>|string;createdAt:Date|string';
  const typeAfter='sequence:number|string|bigint;conversationId:string|null;phase:string;status:string;label:string;detail:string;meta:Record<string,unknown>|string;createdAt:Date|string';
  if(source.includes(typeBefore))source=source.replace(typeBefore,typeAfter);
  else if(!source.includes(typeAfter))throw new Error('IT Agent progress sequence type anchor changed.');

  const responseBefore='events:rows.map(row=>({...row,meta:obj(row.meta)}))';
  const responseAfter=`events:rows.map(row=>({...row,sequence:typeof row.sequence==='bigint'?row.sequence.toString():row.sequence,meta:obj(row.meta)}))`;
  if(!source.includes(responseBefore))throw new Error('IT Agent progress response serialization anchor changed.');
  source=source.replace(responseBefore,responseAfter);

  source=source.replace(routeAnchor,`/* ${marker}: PostgreSQL BIGSERIAL is returned as bigint by the runtime driver; convert it before res.json(). */\n  ${routeAnchor}`);
}

if(!source.includes("typeof row.sequence==='bigint'?row.sequence.toString():row.sequence"))throw new Error('IT Agent progress BigInt conversion was not installed.');
await writeFile(file,source,'utf8');
console.log('IT Agent Status Board progress serialization repaired: BIGSERIAL sequence values are converted before Express JSON serialization.');
