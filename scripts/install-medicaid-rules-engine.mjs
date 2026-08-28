import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','spire-dodd-billing-rules.ts');
let source=await readFile(target,'utf8');

const importAnchor="import type { PrismaClient } from '@prisma/client';";
const engineImport="import { evaluateMedicaidRuleEnvelope } from './spire-medicaid-rules-engine.js';";
if(!source.includes(engineImport)){
  if(!source.includes(importAnchor))throw new Error('Medicaid rule installer could not find import anchor');
  source=source.replace(importAnchor,`${importAnchor}\n${engineImport}`);
}

const configAnchor='  const config = obj(rule?.ruleConfig);';
const engineBlock=`  const config = obj(rule?.ruleConfig);\n  // SPIRE_MEDICAID_RULE_ENVELOPE_1_1\n  const medicaidEnvelope = evaluateMedicaidRuleEnvelope({\n    event, authorization, rule, ruleConfig: config, serviceDate, serviceCode, serviceFamily: family,\n  });\n  blockers.push(...medicaidEnvelope.blockers);\n  warnings.push(...medicaidEnvelope.warnings);`;
if(!source.includes('const medicaidEnvelope = evaluateMedicaidRuleEnvelope')){
  if(!source.includes(configAnchor))throw new Error('Medicaid rule installer could not find evaluation anchor');
  source=source.replace(configAnchor,engineBlock);
}

const detailsAnchor='      groupSize, groupRateFactor, modifiers, rateValidationMode:config.rateValidationMode??null,';
const detailsReplacement='      groupSize, groupRateFactor, modifiers, rateValidationMode:config.rateValidationMode??null,\n      medicaidRuleEnvelope:medicaidEnvelope.evidence, medicaidRuleFingerprint:medicaidEnvelope.fingerprint,';
if(!source.includes('medicaidRuleFingerprint:medicaidEnvelope.fingerprint')){
  if(!source.includes(detailsAnchor))throw new Error('Medicaid rule installer could not find decision-details anchor');
  source=source.replace(detailsAnchor,detailsReplacement);
}

await writeFile(target,source,'utf8');
console.log('Medicaid rules engine installed: date-effective DODD decisions now include deterministic authorization, units, payer/program/waiver and rule-governance evidence without inventing unconfigured Ohio code or rate mappings.');
