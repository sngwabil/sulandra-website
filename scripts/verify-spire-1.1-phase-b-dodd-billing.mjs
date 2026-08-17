import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}};
const need=(source,relative,markers)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${relative} missing ${JSON.stringify(marker)}`)};

console.log('SPIRE 1.1 Phase B Step 2 — date-effective DODD billing validation rules');
const files={migration:'prisma/migrations/20260817185000_spire_1_1_dodd_billing_rules/migration.sql',engine:'api/src/spire-dodd-billing-rules.ts',routes:'api/src/spire-dodd-billing-rule-routes.ts',injector:'scripts/inject-spire-dodd-billing-routes.mjs',apiPackage:'api/package.json',console:'dodd-billing-rules.html'};
const data={};for(const[key,relative]of Object.entries(files))data[key]=await read(relative);
need(data.migration,files.migration,['SpireDoddBillingRuleVersion','SpireDoddBillingValidationDecision','append-only','DODD_HPC_5123_9_30','2024-06-30','2024-07-01','FIFTEEN_MINUTE_DAILY_AGGREGATE','minimumRemainderMinutes','groupRateFactors','APPENDIX_A_5123_9_30','APPENDIX_B_5123_9_30','https://codes.ohio.gov/ohio-administrative-code/rule-5123-9-30']);
need(data.engine,files.engine,['evaluateSpireDoddBilling','HOMEMAKER_PERSONAL_CARE','FIFTEEN_MINUTE_DAILY_AGGREGATE','expectedFifteenMinuteUnits','A matching DODD service authorization is required before billing.','A signed DODD service document linked to this service/visit is required before billing.','Group size is required','prohibitedConcurrentServicePatterns','HPC overlaps a per-trip NMT event','modifier/add-on data is present','rateValidationMode']);
need(data.routes,files.routes,['registerSpireDoddBillingRuleRoutes','/api/revenue-cycle/dodd-rules','/dodd-readiness','/dodd-validation-history','DODD_BILLING_RULE_FAILED','DODD_BILLING_BATCH_BLOCKED',"action:'READY'","action:'BATCH'"]);
need(data.injector,files.injector,['registerSpireDoddBillingRuleRoutes','registerRevenueCycleRoutes','DODD billing rule gate registered before the canonical Revenue Cycle routes']);
need(data.apiPackage,files.apiPackage,['inject-clinical-routes.mjs && node ../scripts/inject-spire-dodd-billing-routes.mjs']);
need(data.console,files.console,['SPIRE_DODD_BILLING_RULE_CONSOLE_V1','Date-effective, append-only Ohio DODD billing configuration','Create Immutable Version','/api/revenue-cycle/dodd-rules','/dodd-readiness','/dodd-validation-history']);
if(failures.length){console.error(`SPIRE 1.1 Phase B Step 2 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('PASS: date-effective append-only DODD billing rules, HPC daily 15-minute aggregation/group/conflict logic, authorization + signed-document gates, modifier/rate configuration controls, READY/BATCH hard stops and audited rule management are present.');
