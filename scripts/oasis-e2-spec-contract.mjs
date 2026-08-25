import { createHash } from 'node:crypto';

export const OASIS_E2_CONTRACT_VERSION = 'spire-oasis-e2-contract/1';
export const OASIS_E2_IDENTITY = Object.freeze({
  authority: 'CMS',
  specName: 'OASIS-E2',
  itemSetVersionCode: 'E2-042026',
  submissionSpecVersion: '3.02',
  effectiveFrom: '2026-04-01',
});

const isObject=(value)=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const clean=(value)=>typeof value==='string'?value.trim():'';
const sha256Pattern=/^[a-f0-9]{64}$/i;
const xmlNamePattern=/^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function canonicalizeOasisSpec(value){
  if(Array.isArray(value))return value.map(canonicalizeOasisSpec);
  if(isObject(value))return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>[key,canonicalizeOasisSpec(entry)]));
  return value;
}

export function oasisSpecDigest(value){
  return createHash('sha256').update(JSON.stringify(canonicalizeOasisSpec(value))).digest('hex');
}

function finding(findings,code,message,path,severity='FATAL'){
  findings.push({code,severity,path,message});
}

export function validateNormalizedOasisE2Spec(input){
  const findings=[];
  if(!isObject(input)){
    finding(findings,'SPEC_NOT_OBJECT','Normalized specification must be a JSON object','$');
    return {valid:false,findings,counts:{items:0,edits:0,valueSets:0,submissionMappings:0}};
  }

  for(const [key,expected] of Object.entries(OASIS_E2_IDENTITY)){
    if(clean(input[key])!==expected)finding(findings,'SPEC_IDENTITY_MISMATCH',`${key} must equal ${expected}`,`$.${key}`);
  }
  if(clean(input.contractVersion)!==OASIS_E2_CONTRACT_VERSION)finding(findings,'CONTRACT_VERSION_MISMATCH',`contractVersion must equal ${OASIS_E2_CONTRACT_VERSION}`,'$.contractVersion');

  const sourcePackage=isObject(input.sourcePackage)?input.sourcePackage:{};
  if(!clean(sourcePackage.name))finding(findings,'SOURCE_PACKAGE_NAME_REQUIRED','Official source package name is required','$.sourcePackage.name');
  if(!sha256Pattern.test(clean(sourcePackage.sha256)))finding(findings,'SOURCE_PACKAGE_SHA_REQUIRED','Official source package SHA-256 must be a 64-character hexadecimal digest','$.sourcePackage.sha256');
  if(!isObject(input.sourceManifest)||Object.keys(input.sourceManifest).length===0)finding(findings,'SOURCE_MANIFEST_REQUIRED','Source manifest/provenance is required','$.sourceManifest');

  const items=Array.isArray(input.itemDefinitions)?input.itemDefinitions:[];
  const edits=Array.isArray(input.editRules)?input.editRules:[];
  const valueSets=isObject(input.valueSets)?input.valueSets:{};
  const submission=isObject(input.submissionDefinition)?input.submissionDefinition:{};
  if(items.length===0)finding(findings,'ITEM_DEFINITIONS_REQUIRED','Official item definitions are required','$.itemDefinitions');
  if(edits.length===0)finding(findings,'EDIT_RULES_REQUIRED','Official edit rules are required','$.editRules');
  if(Object.keys(valueSets).length===0)finding(findings,'VALUE_SETS_REQUIRED','Official value-set definitions are required','$.valueSets');

  const itemCodes=new Set();
  items.forEach((item,index)=>{
    if(!isObject(item)){finding(findings,'ITEM_INVALID','Each item definition must be an object',`$.itemDefinitions[${index}]`);return;}
    const code=clean(item.code);
    if(!code)finding(findings,'ITEM_CODE_REQUIRED','Item code is required',`$.itemDefinitions[${index}].code`);
    else if(itemCodes.has(code))finding(findings,'ITEM_CODE_DUPLICATE',`Duplicate item code ${code}`,`$.itemDefinitions[${index}].code`);
    else itemCodes.add(code);
    if(!clean(item.label))finding(findings,'ITEM_LABEL_REQUIRED',`Item ${code||index} requires a label`, `$.itemDefinitions[${index}].label`);
    if(item.maxLength!==undefined&&(!Number.isInteger(item.maxLength)||item.maxLength<1||item.maxLength>100))finding(findings,'ITEM_MAX_LENGTH_INVALID','Item maxLength must be an integer from 1 through 100',`$.itemDefinitions[${index}].maxLength`);
  });
  for(const control of ['ITM_SET_VRSN_CD','SPEC_VRSN_CD'])if(!itemCodes.has(control))finding(findings,'CONTROL_ITEM_REQUIRED',`Required submission control item ${control} is missing`,'$.itemDefinitions');

  const editCodes=new Set();
  edits.forEach((rule,index)=>{
    if(!isObject(rule)){finding(findings,'EDIT_INVALID','Each edit rule must be an object',`$.editRules[${index}]`);return;}
    const code=clean(rule.code||rule.id);
    if(!code)finding(findings,'EDIT_CODE_REQUIRED','Edit rule code/id is required',`$.editRules[${index}]`);
    else if(editCodes.has(code))finding(findings,'EDIT_CODE_DUPLICATE',`Duplicate edit rule code ${code}`,`$.editRules[${index}]`);
    else editCodes.add(code);
    const severity=clean(rule.severity).toUpperCase();
    if(!['FATAL','WARNING','INFO'].includes(severity))finding(findings,'EDIT_SEVERITY_INVALID','Edit rule severity must be FATAL, WARNING or INFO',`$.editRules[${index}].severity`);
    if(!clean(rule.message))finding(findings,'EDIT_MESSAGE_REQUIRED','Edit rule message is required',`$.editRules[${index}].message`);
    if(rule.itemCode&& !itemCodes.has(clean(rule.itemCode)))finding(findings,'EDIT_ITEM_UNKNOWN',`Edit rule references unknown item ${clean(rule.itemCode)}`,`$.editRules[${index}].itemCode`);
    if(rule.requiresExternalState!==undefined&&typeof rule.requiresExternalState!=='boolean')finding(findings,'EDIT_EXTERNAL_FLAG_INVALID','requiresExternalState must be boolean',`$.editRules[${index}].requiresExternalState`);
  });

  const xml=isObject(submission.xml)?submission.xml:{};
  const rootElement=clean(xml.rootElement);
  if(!rootElement||rootElement.length>30||!xmlNamePattern.test(rootElement))finding(findings,'XML_ROOT_INVALID','submissionDefinition.xml.rootElement must be a valid XML element name no longer than 30 characters','$.submissionDefinition.xml.rootElement');
  if(xml.maxTagLength!==30)finding(findings,'XML_TAG_LIMIT_REQUIRED','submissionDefinition.xml.maxTagLength must preserve the CMS structural limit of 30','$.submissionDefinition.xml.maxTagLength');
  if(xml.maxValueLength!==100)finding(findings,'XML_VALUE_LIMIT_REQUIRED','submissionDefinition.xml.maxValueLength must preserve the CMS structural limit of 100','$.submissionDefinition.xml.maxValueLength');

  const mappings=Array.isArray(submission.fields)?submission.fields:[];
  if(mappings.length===0)finding(findings,'SUBMISSION_FIELDS_REQUIRED','Submission field mappings are required','$.submissionDefinition.fields');
  const mappedItems=new Set();
  const mappedTags=new Set();
  mappings.forEach((mapping,index)=>{
    if(!isObject(mapping)){finding(findings,'SUBMISSION_FIELD_INVALID','Each submission field mapping must be an object',`$.submissionDefinition.fields[${index}]`);return;}
    const itemCode=clean(mapping.itemCode),tag=clean(mapping.tag);
    if(!itemCodes.has(itemCode))finding(findings,'SUBMISSION_ITEM_UNKNOWN',`Submission mapping references unknown item ${itemCode||'(blank)'}`,`$.submissionDefinition.fields[${index}].itemCode`);
    if(mappedItems.has(itemCode))finding(findings,'SUBMISSION_ITEM_DUPLICATE',`Duplicate submission mapping for ${itemCode}`,`$.submissionDefinition.fields[${index}].itemCode`);else mappedItems.add(itemCode);
    if(!tag||tag.length>30||!xmlNamePattern.test(tag))finding(findings,'SUBMISSION_TAG_INVALID',`Invalid XML tag for ${itemCode||index}`,`$.submissionDefinition.fields[${index}].tag`);
    if(mappedTags.has(tag))finding(findings,'SUBMISSION_TAG_DUPLICATE',`Duplicate XML tag ${tag}`,`$.submissionDefinition.fields[${index}].tag`);else mappedTags.add(tag);
    if(!Number.isInteger(mapping.order)||mapping.order<0)finding(findings,'SUBMISSION_ORDER_INVALID','Submission mapping order must be a non-negative integer',`$.submissionDefinition.fields[${index}].order`);
  });
  for(const control of ['ITM_SET_VRSN_CD','SPEC_VRSN_CD'])if(!mappedItems.has(control))finding(findings,'CONTROL_MAPPING_REQUIRED',`Required submission mapping ${control} is missing`,'$.submissionDefinition.fields');

  const transactionModes=isObject(submission.transactionModes)?submission.transactionModes:{};
  for(const mode of ['NEW','MODIFICATION','INACTIVATION'])if(!clean(transactionModes[mode]))finding(findings,'TRANSACTION_MODE_MAPPING_REQUIRED',`Official submission mapping for semantic transaction mode ${mode} is required`,`$.submissionDefinition.transactionModes.${mode}`);

  const fatal=findings.filter((entry)=>entry.severity==='FATAL');
  return {
    valid:fatal.length===0,
    findings,
    counts:{items:items.length,edits:edits.length,valueSets:Object.keys(valueSets).length,submissionMappings:mappings.length},
    normalizedDefinitionSha256:oasisSpecDigest({
      contractVersion:input.contractVersion,
      authority:input.authority,
      specName:input.specName,
      itemSetVersionCode:input.itemSetVersionCode,
      submissionSpecVersion:input.submissionSpecVersion,
      effectiveFrom:input.effectiveFrom,
      effectiveThrough:input.effectiveThrough??null,
      sourcePackage:input.sourcePackage,
      sourceManifest:input.sourceManifest,
      itemDefinitions:items,
      editRules:edits,
      valueSets,
      submissionDefinition:submission,
    }),
  };
}
