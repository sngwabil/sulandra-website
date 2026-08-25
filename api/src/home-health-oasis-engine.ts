import { createHash } from 'node:crypto';

type JsonRecord=Record<string,unknown>;
export type OasisLocalFinding={code:string;severity:'FATAL'|'WARNING'|'INFO';itemCode?:string;message:string;details?:JsonRecord};
export type OasisValidationResult={findings:OasisLocalFinding[];deferredRuleCodes:string[];values:Map<string,unknown>;fatalCount:number;warningCount:number};

const object=(value:unknown):JsonRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as JsonRecord:{};
const text=(value:unknown)=>value===null||value===undefined?'':String(value);
const blank=(value:unknown)=>value===null||value===undefined||String(value).trim()==='';
const array=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const bool=(value:unknown)=>value===true;
const severity=(value:unknown):'FATAL'|'WARNING'|'INFO'=>String(value).toUpperCase()==='WARNING'?'WARNING':String(value).toUpperCase()==='INFO'?'INFO':'FATAL';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

function answerValue(answer:JsonRecord){
  for(const key of ['valueText','valueNumber','valueBoolean','valueJson']){
    if(answer[key]!==undefined&&answer[key]!==null)return answer[key];
  }
  return undefined;
}

export function buildOasisValueMap(snapshot:unknown,spec:JsonRecord,transactionMode:string){
  const values=new Map<string,unknown>();
  const root=object(snapshot),source=object(root.sourceAssessment),responses=object(source.responses);
  for(const [key,value] of Object.entries(responses))values.set(key,value);
  for(const raw of array(source.answers)){
    const answer=object(raw),code=text(answer.code).trim();
    if(code)values.set(code,answerValue(answer));
  }
  values.set('ITM_SET_VRSN_CD',spec.itemSetVersionCode);
  values.set('SPEC_VRSN_CD',spec.submissionSpecVersion);
  const submission=object(spec.submissionDefinition),transactionItem=text(submission.transactionModeItemCode).trim();
  const modes=object(submission.transactionModes);
  if(transactionItem)values.set(transactionItem,modes[transactionMode]);
  return values;
}

function matchesCondition(when:JsonRecord,values:Map<string,unknown>){
  const actual=values.get(text(when.itemCode).trim()),operator=text(when.operator).trim().toUpperCase();
  if(operator==='EQUALS')return text(actual)===text(when.value);
  if(operator==='NOT_EQUALS')return text(actual)!==text(when.value);
  if(operator==='IN')return array(when.values).map(text).includes(text(actual));
  return false;
}

function evaluateRule(rule:JsonRecord,values:Map<string,unknown>):boolean{
  const evaluator=object(rule.evaluator),operator=text(evaluator.operator).trim().toUpperCase();
  const itemCode=text(rule.itemCode).trim(),actual=values.get(itemCode);
  if(operator==='REQUIRED')return !blank(actual);
  if(operator==='MAX_LENGTH')return blank(actual)||text(actual).length<=Number(evaluator.value);
  if(operator==='MIN_LENGTH')return blank(actual)||text(actual).length>=Number(evaluator.value);
  if(operator==='ALLOWED_VALUES')return blank(actual)||array(evaluator.values).map(text).includes(text(actual));
  if(operator==='REGEX')return blank(actual)||new RegExp(text(evaluator.pattern)).test(text(actual));
  if(operator==='EQUALS')return text(actual)===text(evaluator.value);
  if(operator==='NOT_EQUALS')return text(actual)!==text(evaluator.value);
  if(operator==='NUMERIC_RANGE'){
    if(blank(actual))return true;
    const numeric=Number(actual);if(!Number.isFinite(numeric))return false;
    if(typeof evaluator.min==='number'&&numeric<evaluator.min)return false;
    if(typeof evaluator.max==='number'&&numeric>evaluator.max)return false;
    return true;
  }
  if(operator==='CONDITIONAL_REQUIRED')return !matchesCondition(object(evaluator.when),values)||!blank(actual);
  return false;
}

export function validateOasisSnapshot(snapshot:unknown,spec:JsonRecord,transactionMode:string):OasisValidationResult{
  const findings:OasisLocalFinding[]=[],deferredRuleCodes:string[]=[];
  if(String(spec.status)!=='VALIDATED')findings.push({code:'CMS_SPEC_NOT_VALIDATED',severity:'FATAL',message:'OASIS export requires a VALIDATED official CMS specification import'});
  const items=array(spec.itemDefinitions).map(object),rules=array(spec.editRules).map(object),valueSets=object(spec.valueSets),submission=object(spec.submissionDefinition);
  if(!items.length||!rules.length||!Object.keys(submission).length)findings.push({code:'CMS_SPEC_INCOMPLETE',severity:'FATAL',message:'Official item definitions, edit rules and submission mappings must be loaded before OASIS validation'});
  if(!snapshot)findings.push({code:'SNAPSHOT_REQUIRED',severity:'FATAL',message:'Create the immutable OASIS submission snapshot before validation'});
  const values=buildOasisValueMap(snapshot,spec,transactionMode);
  for(const item of items){
    const code=text(item.code).trim();if(!code)continue;const value=values.get(code);
    if(bool(item.required)&&blank(value))findings.push({code:`ITEM_REQUIRED:${code}`,severity:'FATAL',itemCode:code,message:`Required OASIS item ${code} is missing`});
    if(typeof item.maxLength==='number'&&!blank(value)&&text(value).length>item.maxLength)findings.push({code:`ITEM_LENGTH:${code}`,severity:'FATAL',itemCode:code,message:`OASIS item ${code} exceeds its loaded maximum length`});
    const valueSetName=text(item.valueSet).trim();if(valueSetName&&!blank(value)){
      const raw=valueSets[valueSetName],allowed=Array.isArray(raw)?raw:array(object(raw).values);
      if(allowed.length&&!allowed.map(text).includes(text(value)))findings.push({code:`ITEM_VALUE_SET:${code}`,severity:'FATAL',itemCode:code,message:`OASIS item ${code} is not an allowed value in the loaded CMS value set`});
    }
  }
  for(const rule of rules){
    const code=text(rule.code||rule.id).trim()||'UNNAMED_EDIT';
    if(rule.requiresExternalState===true){deferredRuleCodes.push(code);continue;}
    let passed=false;
    try{passed=evaluateRule(rule,values);}catch(error){findings.push({code:`EDIT_ENGINE:${code}`,severity:'FATAL',itemCode:text(rule.itemCode).trim()||undefined,message:`Local evaluator for ${code} could not execute`,details:{error:error instanceof Error?error.message:String(error)}});continue;}
    if(!passed)findings.push({code,severity:severity(rule.severity),itemCode:text(rule.itemCode).trim()||undefined,message:text(rule.message)||`OASIS edit ${code} failed`});
  }
  return {findings,deferredRuleCodes,values,fatalCount:findings.filter((entry)=>entry.severity==='FATAL').length,warningCount:findings.filter((entry)=>entry.severity==='WARNING').length};
}

function xmlEscape(value:unknown){return text(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}

export function buildOasisSubmissionXml(snapshot:unknown,spec:JsonRecord,transactionMode:string){
  const validation=validateOasisSnapshot(snapshot,spec,transactionMode);
  if(validation.fatalCount)throw Object.assign(new Error('OASIS XML export blocked by fatal local validation findings'),{findings:validation.findings});
  const submission=object(spec.submissionDefinition),xml=object(submission.xml),root=text(xml.rootElement).trim(),maxValue=Number(xml.maxValueLength||100);
  if(!root)throw new Error('Validated OASIS specification is missing XML rootElement');
  const fields=array(submission.fields).map(object).sort((a,b)=>Number(a.order)-Number(b.order));
  const body:string[]=[];
  for(const mapping of fields){
    const itemCode=text(mapping.itemCode).trim(),tag=text(mapping.tag).trim(),value=validation.values.get(itemCode);
    if(mapping.omitIfBlank===true&&blank(value))continue;
    const rendered=text(value);if(rendered.length>maxValue)throw new Error(`OASIS submission value for ${itemCode} exceeds loaded XML value length`);
    body.push(`<${tag}>${xmlEscape(rendered)}</${tag}>`);
  }
  const payload=`<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body.map((line)=>`  ${line}`).join('\n')}\n</${root}>\n`;
  return {xml:payload,sha256:hash(payload),bytes:Buffer.byteLength(payload,'utf8'),recordCount:1,deferredRuleCodes:validation.deferredRuleCodes};
}
