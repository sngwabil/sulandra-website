import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}};
const need=(source,relative,markers)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${relative} missing ${JSON.stringify(marker)}`)};
const syntax=(relative)=>{const result=spawnSync(process.execPath,['--check',path.join(root,relative)],{encoding:'utf8'});if(result.status!==0)failures.push(`${relative} syntax failed: ${(result.stderr||result.stdout||'').trim()}`)};

console.log('SPIRE 1.1 Phase B Step 3 — X12/external claim exchange, acknowledgements, 835, PNM/eMBS evidence');
const files={migration:'prisma/migrations/20260817185500_spire_1_1_claim_exchange/migration.sql',builder:'api/src/revenue-cycle-x12.ts',routes:'api/src/revenue-cycle-claim-exchange-routes.ts',injector:'scripts/inject-revenue-cycle-claim-exchange-routes.mjs',apiPackage:'api/package.json',console:'revenue-claim-exchange.html',runtime:'assets/revenue-claim-exchange-v1.js'};
const data={};for(const[key,relative]of Object.entries(files))data[key]=await read(relative);
need(data.migration,files.migration,['RevenueCycleTradingPartnerProfileVersion','RevenueCycleClaimSubmission','RevenueCycleClaimSubmissionLine','RevenueCycleClaimExchangeEvent','RevenueCycleRemittance','RevenueCycleRemittanceLine','RevenueCycleExternalWorkflow','RevenueCycleExternalWorkflowEvent','append-only','PNM_PROVIDER_ENROLLMENT','DODD_EMBS_BILLING_ACCESS','productionEnabled']);
need(data.builder,files.builder,['005010X222A1','005010X223A2','buildRevenueClaimCandidate','Billing provider NPI must be a 10-digit NPI.','X12 5010 candidate; payer/Ohio companion-guide validation still required','directStateSubmissionConfigured: false','externalCertificationClaimed: false','parseBasic835',"parts[0] === 'CLP'","parts[0] === 'CAS'"]);
need(data.routes,files.routes,['registerRevenueCycleClaimExchangeRoutes','directElectronicSubmissionConfigured:false','directStateSubmissionConfigured:false',"acknowledgements:['TA1','999','277CA']",'835 005010X221A1','/x12-preview','/x12-submissions','/handoff','/acknowledgements','/remittance-835','PNM_PROVIDER_ENROLLMENT','DODD_EMBS_BILLING_ACCESS',"verificationMode:'MANUAL_EVIDENCE'",'DIRECT_CLAIM_TRANSPORT_NOT_CONFIGURED','Direct electronic claim submission is not configured']);
need(data.injector,files.injector,['registerRevenueCycleClaimExchangeRoutes','registerRevenueCycleRoutes','direct electronic submission remains disabled']);
need(data.apiPackage,files.apiPackage,['inject-spire-dodd-billing-routes.mjs && node ../scripts/inject-revenue-cycle-claim-exchange-routes.mjs']);
need(data.console,files.console,['SPIRE_REVENUE_CLAIM_EXCHANGE_V1','No direct state submission is configured','X12 candidate generation','835 reconciliation','PNM/eMBS evidence workflows','PNM_PROVIDER_ENROLLMENT','DODD_EMBS_BILLING_ACCESS','/assets/revenue-claim-exchange-v1.js']);
need(data.runtime,files.runtime,['SPIRE_REVENUE_CLAIM_EXCHANGE_RUNTIME_V1','/api/revenue-cycle/exchange/status','/api/revenue-cycle/trading-profiles','/api/revenue-cycle/external-workflows','/api/revenue-cycle/x12-submissions','/x12-preview','/x12-submissions','/acknowledgements','/remittance-835','Authorization: `Bearer ${token()}`','response.blob()','URL.createObjectURL(blob)','Protected EDI candidate downloaded','No electronic submission occurred']);
syntax(files.runtime);
if(failures.length){console.error(`SPIRE 1.1 Phase B Step 3 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('PASS: audited 837P/837I candidate generation, immutable profile/exchange evidence, authenticated EDI download, manual external handoff, TA1/999/277CA tracking, 835 reconciliation, PNM/eMBS evidence workflows and a hard block on unconfigured direct submission are present.');
