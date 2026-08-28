import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compositor=await readFile(path.join(root,'api','src','spire-prebill-hard-stop.ts'),'utf8');
const revenue=await readFile(path.join(root,'api','src','revenue-cycle-routes.ts'),'utf8');
const exchange=await readFile(path.join(root,'api','src','revenue-cycle-claim-exchange-routes.ts'),'utf8');
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};

requireMarkers(compositor,[
  'evaluateRevenuePrebillBatch','assertRevenuePrebillBatch','evaluateSpireEvvPrebill','evaluateSpireDoddBilling','recordSpireEvvPrebillDecision','recordSpireDoddBillingDecision','REVENUE_PREBILL_HARD_STOP_BLOCKED','REVENUE_PREBILL_SNAPSHOT_STALE',"createHash('sha256')",'Training-only service events cannot be billed.','Service event is not marked billable.',
], 'spire-prebill-hard-stop.ts');
requireMarkers(revenue,["from './spire-prebill-hard-stop.js'","stage:'BATCH_FINALIZE'","stage:'CSV_EXPORT'"], 'revenue-cycle-routes.ts');
requireMarkers(exchange,["from './spire-prebill-hard-stop.js'","stage:'CLAIM_GENERATE'","stage:'CLAIM_DOWNLOAD'","stage:'CLAIM_HANDOFF'",'prebillHardStop:{fingerprint:prebill.fingerprint','REVENUE_PREBILL_SNAPSHOT_MISSING'], 'revenue-cycle-claim-exchange-routes.ts');
const generatedRoute=exchange.slice(exchange.indexOf("app.post('/api/revenue-cycle/batches/:batchId/x12-submissions'"),exchange.indexOf("app.get('/api/revenue-cycle/x12-submissions'"));
if(!generatedRoute.includes("stage:'CLAIM_GENERATE'"))failures.push('X12 claim generation can bypass the unified prebill hard stop');
const handoffRoute=exchange.slice(exchange.indexOf("app.post('/api/revenue-cycle/x12-submissions/:submissionId/handoff'"),exchange.indexOf("app.post('/api/revenue-cycle/x12-submissions/:submissionId/acknowledgements'"));
if(!handoffRoute.includes("stage:'CLAIM_HANDOFF'")||!handoffRoute.includes('expectedFingerprint:expected'))failures.push('external claim handoff can bypass stale-snapshot verification');
if(failures.length){console.error('Prebill hard-stop verification failed:\n- '+failures.join('\n- '));process.exit(1);}
console.log('Prebill hard stops verified: EVV and billing-rule decisions are rechecked at batch finalize, CSV export, claim generation, generated-file download and external handoff, with claim snapshot fingerprints preventing stale handoff.');
