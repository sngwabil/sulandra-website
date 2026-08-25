import assert from 'node:assert/strict';
import test from 'node:test';
import { DisabledIqiesTransport, IqiesTransportError, assertIqiesReconciliationTransition, buildIqiesIdempotencyKey, getIqiesTransportReadiness } from '../api/src/iqies-transport-boundary.ts';

const production={
  IQIES_TRANSPORT_MODE:'EXTERNAL_ADAPTER',
  IQIES_ENVIRONMENT:'PRODUCTION',
  IQIES_ENDPOINT_URL:'https://iqies.example.gov/oasis',
  IQIES_ALLOWED_HOSTS:'iqies.example.gov',
  IQIES_CREDENTIAL_REFERENCE:'railway://iqies-production',
  IQIES_CERTIFICATION_STATUS:'PRODUCTION_CERTIFIED',
  IQIES_PRODUCTION_SUBMISSION_ENABLED:'1',
};

test('iQIES transport defaults to fail-closed without exposing configuration secrets',()=>{
  const readiness=getIqiesTransportReadiness({});
  assert.equal(readiness.mode,'DISABLED');
  assert.equal(readiness.submissionEnabled,false);
  assert.ok(readiness.blockers.length>=4);
  assert.equal(JSON.stringify(readiness).includes('railway-secret'),false);
});

test('production transport remains fail-closed because CMS has not published an automated OASIS machine contract',()=>{
  const readyConfiguration=getIqiesTransportReadiness(production);
  assert.equal(readyConfiguration.configured,true);
  assert.equal(readyConfiguration.submissionEnabled,false);
  assert.equal(readyConfiguration.machineTransportImplemented,false);
  assert.match(readyConfiguration.blockers.join(' '),/official XML upload/);
  assert.equal(getIqiesTransportReadiness({...production,IQIES_ENDPOINT_URL:'http://iqies.example.gov'}).submissionEnabled,false);
  assert.equal(getIqiesTransportReadiness({...production,IQIES_ALLOWED_HOSTS:'other.example.gov'}).submissionEnabled,false);
  assert.equal(getIqiesTransportReadiness({...production,IQIES_CERTIFICATION_STATUS:'SANDBOX_APPROVED'}).submissionEnabled,false);
  assert.equal(getIqiesTransportReadiness({...production,IQIES_CREDENTIAL_REFERENCE:''}).submissionEnabled,false);
  assert.equal(getIqiesTransportReadiness({...production,IQIES_PRODUCTION_SUBMISSION_ENABLED:'0'}).submissionEnabled,false);
});

test('private, local and credential-bearing endpoint URLs are rejected',()=>{
  for(const endpoint of ['https://localhost/oasis','https://127.0.0.1/oasis','https://user:secret@iqies.example.gov/oasis']){
    const readiness=getIqiesTransportReadiness({...production,IQIES_ENDPOINT_URL:endpoint});
    assert.equal(readiness.submissionEnabled,false,endpoint);
    assert.equal(readiness.endpointOrigin?.includes('secret')??false,false);
  }
});

test('idempotency keys are stable, scoped and reject malformed payload hashes',()=>{
  const input={organizationId:'org-1',legalEntityId:'home-health',oasisAssessmentId:'oasis-1',transactionMode:'NEW',payloadSha256:'a'.repeat(64)};
  assert.equal(buildIqiesIdempotencyKey(input),buildIqiesIdempotencyKey(input));
  assert.notEqual(buildIqiesIdempotencyKey(input),buildIqiesIdempotencyKey({...input,transactionMode:'MODIFICATION'}));
  assert.throws(()=>buildIqiesIdempotencyKey({...input,payloadSha256:'bad'}),IqiesTransportError);
});

test('terminal acknowledgements cannot regress while safe retry and idempotent transitions remain valid',()=>{
  assert.doesNotThrow(()=>assertIqiesReconciliationTransition('EXPORTED','REJECTED'));
  assert.doesNotThrow(()=>assertIqiesReconciliationTransition('ERROR','SUBMITTED'));
  assert.doesNotThrow(()=>assertIqiesReconciliationTransition('ACCEPTED','ACCEPTED'));
  assert.throws(()=>assertIqiesReconciliationTransition('ACCEPTED','REJECTED'),/cannot move/);
  assert.throws(()=>assertIqiesReconciliationTransition('REJECTED','SUBMITTED'),/cannot move/);
});

test('disabled transport never performs submission and returns a non-retryable safe error',async()=>{
  const transport=new DisabledIqiesTransport();
  await assert.rejects(transport.submit({submissionId:'sub-1',idempotencyKey:'key',payload:new Uint8Array([60,120,47,62]),payloadSha256:'a'.repeat(64),payloadBytes:4}),(error:unknown)=>error instanceof IqiesTransportError&&error.code==='ADAPTER_DISABLED'&&error.retryable===false);
});
