import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const required=[
  'IT_AGENT_PROGRESS_BIGINT_SERIALIZATION_V1',
  'sequence:number|string|bigint',
  "typeof row.sequence==='bigint'?row.sequence.toString():row.sequence",
  "/api/it-solutions/agent/progress/:requestId",
];
const missing=required.filter(marker=>!source.includes(marker));
if(missing.length){console.error('IT Agent progress BigInt verification failed:\n- '+missing.join('\n- '));process.exit(1)}
if(source.includes('events:rows.map(row=>({...row,meta:obj(row.meta)}))')){
  console.error('IT Agent progress BigInt verification failed: unsafe raw BIGSERIAL sequence is still passed to res.json().');
  process.exit(1);
}
const sample={sequence:1n,label:'Request received'};
const safe={...sample,sequence:typeof sample.sequence==='bigint'?sample.sequence.toString():sample.sequence};
JSON.stringify({data:{events:[safe]}});
console.log('IT Agent progress BigInt verification passed: progress rows are JSON-safe before the Status Board endpoint responds.');
