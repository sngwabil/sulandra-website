import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNormalizedOasisE2Spec } from '../scripts/oasis-e2-spec-contract.mjs';
import { buildOasisSubmissionXml, validateOasisSnapshot } from '../api/src/home-health-oasis-engine.ts';

const packageHash='a'.repeat(64);

function validSpec(){
  return {
    contractVersion:'spire-oasis-e2-contract/1',
    authority:'CMS',
    specName:'OASIS-E2',
    itemSetVersionCode:'E2-042026',
    submissionSpecVersion:'3.02',
    effectiveFrom:'2026-04-01',
    effectiveThrough:null,
    sourcePackage:{name:'cms-oasis-e2-3.02.0-fixture.zip',sha256:packageHash},
    sourceManifest:{fixture:true,files:['data-spec.xml','edit-spec.xml']},
    itemDefinitions:[
      {code:'ITM_SET_VRSN_CD',label:'Item set version',required:true,maxLength:20},
      {code:'SPEC_VRSN_CD',label:'Submission specification version',required:true,maxLength:20},
      {code:'TRANS_TYPE',label:'Transaction mode',required:true,maxLength:1,valueSet:'transactionModes'},
      {code:'M_TEST',label:'Synthetic regression item',required:true,maxLength:5,valueSet:'yesNo'},
    ],
    editRules:[
      {code:'EDIT_M_TEST_REQUIRED',severity:'FATAL',itemCode:'M_TEST',message:'M_TEST is required',evaluator:{operator:'REQUIRED'}},
      {code:'EDIT_EXTERNAL_ONLY',severity:'WARNING',itemCode:'M_TEST',message:'Final iQIES state check is deferred',requiresExternalState:true,evaluator:{operator:'REQUIRED'}},
    ],
    valueSets:{yesNo:['0','1'],transactionModes:['N','M','I']},
    submissionDefinition:{
      xml:{rootElement:'OASIS_DATA',maxTagLength:30,maxValueLength:100},
      transactionModeItemCode:'TRANS_TYPE',
      transactionModes:{NEW:'N',MODIFICATION:'M',INACTIVATION:'I'},
      fields:[
        {itemCode:'ITM_SET_VRSN_CD',tag:'ITM_SET_VRSN_CD',order:0},
        {itemCode:'SPEC_VRSN_CD',tag:'SPEC_VRSN_CD',order:1},
        {itemCode:'TRANS_TYPE',tag:'TRANS_TYPE',order:2},
        {itemCode:'M_TEST',tag:'M_TEST',order:3},
      ],
    },
  };
}

function snapshot(value='1'){
  return {sourceAssessment:{responses:{M_TEST:value},answers:[]}};
}

test('normalized OASIS-E2 3.02 contract accepts a complete, provenance-bound package',()=>{
  const result=validateNormalizedOasisE2Spec(validSpec());
  assert.equal(result.valid,true,JSON.stringify(result.findings));
  assert.equal(result.counts.items,4);
  assert.equal(result.counts.edits,2);
  assert.equal(result.counts.valueSets,2);
  assert.equal(result.counts.submissionMappings,4);
  assert.match(result.normalizedDefinitionSha256,/^[a-f0-9]{64}$/);
});

test('contract rejects incomplete control mappings instead of silently validating them',()=>{
  const spec=validSpec();
  spec.submissionDefinition.fields=spec.submissionDefinition.fields.filter((entry)=>entry.itemCode!=='SPEC_VRSN_CD');
  const result=validateNormalizedOasisE2Spec(spec);
  assert.equal(result.valid,false);
  assert.ok(result.findings.some((entry)=>entry.code==='CONTROL_MAPPING_REQUIRED'));
});

test('local validation executes loaded rules, injects semantic transaction values, and defers external-state edits',()=>{
  const spec={...validSpec(),status:'VALIDATED'};
  const result=validateOasisSnapshot(snapshot(),spec,'MODIFICATION');
  assert.equal(result.fatalCount,0,JSON.stringify(result.findings));
  assert.deepEqual(result.deferredRuleCodes,['EDIT_EXTERNAL_ONLY']);
  assert.equal(result.values.get('ITM_SET_VRSN_CD'),'E2-042026');
  assert.equal(result.values.get('SPEC_VRSN_CD'),'3.02');
  assert.equal(result.values.get('TRANS_TYPE'),'M');
});

test('deterministic XML export is spec-driven and hashes the exact payload',()=>{
  const spec={...validSpec(),status:'VALIDATED'};
  const first=buildOasisSubmissionXml(snapshot(),spec,'NEW');
  const second=buildOasisSubmissionXml(snapshot(),spec,'NEW');
  assert.equal(first.xml,second.xml);
  assert.equal(first.sha256,second.sha256);
  assert.equal(first.recordCount,1);
  assert.ok(first.bytes>0);
  assert.match(first.xml,/<ITM_SET_VRSN_CD>E2-042026<\/ITM_SET_VRSN_CD>/);
  assert.match(first.xml,/<SPEC_VRSN_CD>3\.02<\/SPEC_VRSN_CD>/);
  assert.match(first.xml,/<TRANS_TYPE>N<\/TRANS_TYPE>/);
  assert.match(first.xml,/<M_TEST>1<\/M_TEST>/);
});

test('invalid item values hard-stop XML generation',()=>{
  const spec={...validSpec(),status:'VALIDATED'};
  const result=validateOasisSnapshot(snapshot('9'),spec,'NEW');
  assert.ok(result.fatalCount>0);
  assert.ok(result.findings.some((entry)=>entry.code==='ITEM_VALUE_SET:M_TEST'));
  assert.throws(()=>buildOasisSubmissionXml(snapshot('9'),spec,'NEW'),/blocked by fatal local validation findings/);
});

test('unvalidated specification can never export',()=>{
  const spec={...validSpec(),status:'LOADED'};
  const result=validateOasisSnapshot(snapshot(),spec,'NEW');
  assert.ok(result.findings.some((entry)=>entry.code==='CMS_SPEC_NOT_VALIDATED'));
  assert.throws(()=>buildOasisSubmissionXml(snapshot(),spec,'NEW'),/blocked by fatal local validation findings/);
});
