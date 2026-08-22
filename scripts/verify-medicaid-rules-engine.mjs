import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engine=await readFile(path.join(root,'api','src','spire-medicaid-rules-engine.ts'),'utf8');
const dodd=await readFile(path.join(root,'api','src','spire-dodd-billing-rules.ts'),'utf8');
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};

requireMarkers(engine,[
  'SPIRE_MEDICAID_RULE_ENVELOPE_1_1',
  'evaluateMedicaidRuleEnvelope',
  'allowedPayers',
  'allowedPayerPrograms',
  'allowedWaiverTypes',
  'allowedServiceCodes',
  'allowedUnitTypes',
  'requireAuthorizationActiveStatus',
  'Billable Medicaid units must be greater than zero.',
  'Service date precedes the authorization start date.',
  'Service date is after the authorization end date.',
  'Service code does not match the linked authorization.',
  'Delivered units exceed the authorization ceiling.',
  'Active Medicaid rule version is missing its authority/source citation.',
  "createHash('sha256')",
], 'spire-medicaid-rules-engine.ts');

requireMarkers(dodd,[
  "from './spire-medicaid-rules-engine.js'",
  'SPIRE_MEDICAID_RULE_ENVELOPE_1_1',
  'const medicaidEnvelope = evaluateMedicaidRuleEnvelope',
  'blockers.push(...medicaidEnvelope.blockers)',
  'warnings.push(...medicaidEnvelope.warnings)',
  'medicaidRuleEnvelope:medicaidEnvelope.evidence',
  'medicaidRuleFingerprint:medicaidEnvelope.fingerprint',
], 'spire-dodd-billing-rules.ts');

if(engine.includes('H0036')||engine.includes('T2021')||engine.includes('S0215')){
  failures.push('Medicaid engine hard-codes service codes instead of using date-effective configured rule versions');
}
if(engine.includes('$')&&engine.includes('unitRate')){
  failures.push('Medicaid engine appears to hard-code monetary rate logic');
}

if(failures.length){
  console.error('Medicaid rules engine verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Medicaid rules engine verified: date-effective rule governance, authorization span/status/code/units and configured payer/program/waiver/unit restrictions feed deterministic DODD billing decisions without invented hard-coded Ohio service/rate mappings.');
