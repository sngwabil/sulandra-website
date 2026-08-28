import { isSha256 } from './production-adapter-controls.js';

export const DRUG_KNOWLEDGE_SOURCES={
  rxnorm:{authority:'U.S. National Library of Medicine',baseUrl:'https://rxnav.nlm.nih.gov/REST',purpose:'NORMALIZATION'},
  dailyMed:{authority:'U.S. National Library of Medicine',baseUrl:'https://dailymed.nlm.nih.gov/dailymed/services/v2',purpose:'CURRENT_SPL_LABELS'},
  openFda:{authority:'U.S. Food and Drug Administration',baseUrl:'https://api.fda.gov/drug/label.json',purpose:'RESEARCH_ONLY_NOT_CLINICAL_DECISION_SUPPORT'},
  rxnavInteractions:{status:'DISCONTINUED',discontinuedAt:'2024-01-02'},
} as const;

export function getDrugKnowledgeReadiness(env:Readonly<Record<string,string|undefined>>){
  const blockers:string[]=[];
  const terminologyEvidence=isSha256(env.RXNORM_VERSION_EVIDENCE_SHA256);
  const labelEvidence=isSha256(env.DAILYMED_VERSION_EVIDENCE_SHA256);
  const interactionChecks=String(env.DRUG_INTERACTION_MODE||'DISABLED').trim().toUpperCase()==='LICENSED_CLINICAL_SOURCE';
  if(!terminologyEvidence)blockers.push('Current RxNorm version evidence is required');
  if(!labelEvidence)blockers.push('Current DailyMed label-version evidence is required');
  if(!interactionChecks)blockers.push('Clinical interaction checks require a separately licensed and validated clinical source; RxNav interaction features are discontinued');
  if(interactionChecks&&!isSha256(env.DRUG_CLINICAL_SOURCE_LICENSE_EVIDENCE_SHA256))blockers.push('Licensed drug clinical source agreement evidence is required');
  if(interactionChecks&&!isSha256(env.DRUG_CLINICAL_VALIDATION_EVIDENCE_SHA256))blockers.push('Drug clinical decision-support validation evidence is required');
  return {
    terminologyReady:terminologyEvidence,
    labelingReady:labelEvidence,
    clinicalDecisionSupportReady:interactionChecks&&blockers.filter((item)=>item.startsWith('Licensed')||item.startsWith('Drug clinical')).length===0,
    enabled:blockers.length===0,
    sources:DRUG_KNOWLEDGE_SOURCES,
    blockers,
  };
}

const safeTerm=(value:unknown,max=200)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').slice(0,max);

export function buildRxNormLookup(input:{name?:string|null;rxcui?:string|null}){
  const name=safeTerm(input.name),rxcui=String(input.rxcui||'').replace(/\D/g,'').slice(0,20);
  if(Boolean(name)===Boolean(rxcui))throw new Error('Provide exactly one RxNorm drug name or RxCUI');
  const url=rxcui?`${DRUG_KNOWLEDGE_SOURCES.rxnorm.baseUrl}/rxcui/${encodeURIComponent(rxcui)}/properties.json`:`${DRUG_KNOWLEDGE_SOURCES.rxnorm.baseUrl}/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
  return {url,authority:DRUG_KNOWLEDGE_SOURCES.rxnorm.authority,purpose:'NORMALIZATION',containsPhi:false};
}

export function buildDailyMedLookup(input:{rxcui?:string|null;setId?:string|null}){
  const rxcui=String(input.rxcui||'').replace(/\D/g,'').slice(0,20),setId=String(input.setId||'').trim().replace(/[^a-fA-F0-9-]/g,'').slice(0,50);
  if(Boolean(rxcui)===Boolean(setId))throw new Error('Provide exactly one RxCUI or DailyMed set ID');
  const url=setId?`${DRUG_KNOWLEDGE_SOURCES.dailyMed.baseUrl}/spls/${encodeURIComponent(setId)}.json`:`${DRUG_KNOWLEDGE_SOURCES.dailyMed.baseUrl}/spls.json?rxcui=${encodeURIComponent(rxcui)}`;
  return {url,authority:DRUG_KNOWLEDGE_SOURCES.dailyMed.authority,purpose:'CURRENT_SPL_LABELS',containsPhi:false,clinicalDecisionSupport:false};
}

export function validateDrugKnowledgeProvenance(input:{source:string;sourceVersion:string;retrievedAt:string;artifactSha256:string}){
  const errors:string[]=[];
  if(!['RXNORM','DAILYMED','LICENSED_CLINICAL_SOURCE'].includes(String(input.source||'').toUpperCase()))errors.push('Drug knowledge source is not approved');
  if(!safeTerm(input.sourceVersion,100))errors.push('Drug knowledge source version is required');
  const retrieved=new Date(input.retrievedAt);
  if(Number.isNaN(retrieved.getTime())||retrieved.getTime()>Date.now()+300_000)errors.push('Drug knowledge retrieval timestamp is invalid');
  if(!isSha256(input.artifactSha256))errors.push('Drug knowledge artifact SHA-256 is invalid');
  return {valid:errors.length===0,errors,source:String(input.source||'').toUpperCase(),sourceVersion:safeTerm(input.sourceVersion,100),artifactSha256:isSha256(input.artifactSha256)?input.artifactSha256.toLowerCase():null};
}
