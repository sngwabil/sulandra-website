import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdapterAuditEvent, buildAdapterIdempotencyKey, redactAdapterMetadata, retryDecision } from '../api/src/production-adapter-controls.ts';
import { getIqiesCertificationReadiness, normalizeIqiesFinalValidationEvidence } from '../api/src/iqies-certification-boundary.ts';
import { getOhioSandataReadiness, normalizeSandataAcknowledgement, validateOhioSandataVisitPackage } from '../api/src/ohio-sandata-boundary.ts';
import { buildEligibility270Candidate, getHetsEligibilityReadiness, getPayerConnectivityReadiness, parseEligibility271 } from '../api/src/payer-eligibility-boundary.ts';
import { buildSecureFaxCandidate, getSecureFaxReadiness, normalizeSecureFaxReceipt } from '../api/src/secure-efax-boundary.ts';
import { buildDailyMedLookup, buildRxNormLookup, getDrugKnowledgeReadiness, validateDrugKnowledgeProvenance } from '../api/src/drug-knowledge-boundary.ts';

const evidence='a'.repeat(64);

test('official iQIES readiness requires the CMS XML upload/VUT/FVR human workflow and never claims automated transport',()=>{
  const readiness=getIqiesCertificationReadiness({
    IQIES_VENDOR_REGISTRATION_CONFIRMED:'1',
    IQIES_HARP_ACCOUNT_APPROVED:'1',
    IQIES_PROVIDER_SECURITY_OFFICIAL_APPROVED:'1',
    IQIES_ASSESSMENT_SUBMITTER_ROLE_APPROVED:'1',
    IQIES_CCN_REFERENCE:'railway://iqies-ccn',
    IQIES_VUT_SPEC_VERSION:'3.02',
    IQIES_ERROR_GUIDE_VERSION:'2.4',
    IQIES_VUT_PASS_EVIDENCE_SHA256:evidence,
    IQIES_SANDBOX_WORKFLOW_ENABLED:'1',
  });
  assert.equal(readiness.officialWorkflowReady,true);
  assert.equal(readiness.automatedMachineTransportReady,false);
  const accepted=normalizeIqiesFinalValidationEvidence({reportType:'AGENCY_FINAL_VALIDATION',reportSha256:evidence,submittedAt:'2026-08-25T10:00:00Z',generatedAt:'2026-08-25T10:30:00Z',recordCount:1,fatalCount:0,warningCount:0});
  assert.deepEqual([accepted.valid,accepted.status,accepted.requiresCorrectionAndResubmission],[true,'ACCEPTED',false]);
  const rejected=normalizeIqiesFinalValidationEvidence({reportType:'SUBMITTER_FINAL_VALIDATION',reportSha256:evidence,submittedAt:'2026-08-25T10:00:00Z',generatedAt:'2026-08-25T11:00:00Z',recordCount:1,fatalCount:1,warningCount:0});
  assert.deepEqual([rejected.status,rejected.requiresCorrectionAndResubmission],['REJECTED',true]);
});

test('Ohio Sandata 4.4 readiness and visit validation fail closed on certification or payload gaps',()=>{
  const ready=getOhioSandataReadiness({
    OHIO_ALT_EVV_ENVIRONMENT:'UAT',
    OHIO_ALT_EVV_VENDOR_REGISTERED:'1',
    OHIO_ALT_EVV_PROVIDER_DESIGNATED:'1',
    OHIO_ALT_EVV_SOD_USER_APPROVED:'1',
    SANDATA_CREDENTIAL_REFERENCE:'vault://sandata-uat',
    SANDATA_INTERFACE_SPEC_VERSION:'4.4',
    SANDATA_UAT_CERTIFICATION_EVIDENCE_SHA256:evidence,
    SANDATA_UAT_ENABLED:'1',
  });
  assert.equal(ready.enabled,true);
  assert.equal(ready.endpoints.VISIT,'https://uat-api.sandata.com/interfaces/intake/visit/v2/');
  assert.equal(getOhioSandataReadiness({}).enabled,false);
  const payload=[{
    BusinessEntityID:'BE123',
    BusinessEntityMedicaidIdentifier:'1234567',
    SequenceID:'1',
    VisitOtherID:'VISIT-1',
    StaffOtherID:'STAFF-1',
    PatientOtherID:'PATIENT-1',
    PatientMedicaidID:'MEMBER-1',
    Payer:'ODM',
    PayerProgram:'OHIO_MEDICAID',
    ProcedureCode:'T1019',
    TimeZone:'US/Eastern',
    AdjInDateTime:'2026-08-25T10:00:00Z',
    AdjOutDateTime:'2026-08-25T11:00:00Z',
    Calls:[
      {CallExternalID:'CALL-IN',CallDateTime:'2026-08-25T10:00:00Z',CallAssignment:'Call In',CallType:'Mobile'},
      {CallExternalID:'CALL-OUT',CallDateTime:'2026-08-25T11:00:00Z',CallAssignment:'Call Out',CallType:'Mobile'},
    ],
    VisitChanges:[{ReasonCode:'99',ChangeMadeByEmail:'reviewer@example.org',ChangeDateTime:'2026-08-25T11:05:00Z'}],
  }];
  assert.equal(validateOhioSandataVisitPackage(payload,{completedAt:'2026-08-25T11:00:00Z',now:'2026-08-25T12:00:00Z'}).valid,true);
  assert.equal(validateOhioSandataVisitPackage([{...payload[0],BusinessEntityID:''}]).valid,false);
  const acknowledgement=normalizeSandataAcknowledgement({data:{TransactionID:'550e8400-e29b-41d4-a716-446655440000'},messageSummary:'Transaction received'});
  assert.deepEqual([acknowledgement.valid,acknowledgement.status],[true,'ACCEPTED']);
});

test('payer connectivity and HETS 270/271 use 005010X279A1 and do not persist raw eligibility payloads',()=>{
  const payer=getPayerConnectivityReadiness({
    PAYER_CONNECTIVITY_MODE:'CLEARINGHOUSE',
    PAYER_ENDPOINT_URL:'https://payer.example.org/x12',
    PAYER_ALLOWED_HOSTS:'payer.example.org',
    PAYER_CREDENTIAL_REFERENCE:'aws-secretsmanager://payer-prod',
    PAYER_BAA_EVIDENCE_SHA256:evidence,
    PAYER_TRADING_PARTNER_AGREEMENT_SHA256:evidence,
    PAYER_COMPANION_GUIDE_SHA256:evidence,
    PAYER_CONNECTIVITY_TEST_EVIDENCE_SHA256:evidence,
    PAYER_PRODUCTION_ENABLED:'1',
  });
  assert.equal(payer.enabled,true);
  const hets=getHetsEligibilityReadiness({
    HETS_TPA_APPROVED:'1',
    HETS_SUBMITTER_ID_REFERENCE:'vault://hets-submitter',
    HETS_CREDENTIAL_REFERENCE:'vault://hets-credential',
    HETS_PROVIDER_EDI_ENROLLMENT_VERIFIED:'1',
    HETS_COMPANION_GUIDE_VERSION:'15-1',
    HETS_CONNECTIVITY_GUIDE_VERSION:'11-1',
    HETS_CONNECTIVITY_MODE:'SOAP',
    HETS_TEST_APPROVAL_EVIDENCE_SHA256:evidence,
    HETS_PRODUCTION_ENABLED:'1',
  });
  assert.equal(hets.enabled,true);
  const candidate=buildEligibility270Candidate({submitterId:'SUBMITTER',receiverId:'CMS',payerName:'MEDICARE',providerNpi:'1234567890',memberId:'MEMBER123',subscriberFirstName:'ALEX',subscriberLastName:'DOE',subscriberDateOfBirth:'1980-01-01',dateOfService:'2026-08-25',serviceTypeCode:'30',traceNumber:'TRACE-1',interchangeControlNumber:'1',groupControlNumber:'1',transactionControlNumber:'1'},new Date('2026-08-25T12:30:00Z'));
  assert.equal(candidate.valid,true);
  assert.match(candidate.payload??'',/ST\*270\*0001\*005010X279A1/);
  const parsed=parseEligibility271('ST*271*0001*005010X279A1~BHT*0022*11*TRACE-1*20260825*1230~TRN*2*TRACE-1*CMS~EB*1*IND*30*MB*ACTIVE**23*0~SE*5*0001~');
  assert.equal(parsed.valid,true);
  assert.equal(parsed.rawPayloadPersisted,false);
  assert.equal(parsed.traceNumber,'TRACE-1');
});

test('secure fax requires BAA, destination verification, minimum necessary and immutable document evidence',()=>{
  const readiness=getSecureFaxReadiness({
    SECURE_FAX_MODE:'EXTERNAL_API',
    SECURE_FAX_ENDPOINT_URL:'https://fax.example.org/v1',
    SECURE_FAX_ALLOWED_HOSTS:'fax.example.org',
    SECURE_FAX_CREDENTIAL_REFERENCE:'railway://fax-prod',
    SECURE_FAX_BAA_EVIDENCE_SHA256:evidence,
    SECURE_FAX_SECURITY_REVIEW_EVIDENCE_SHA256:evidence,
    SECURE_FAX_TEST_DELIVERY_EVIDENCE_SHA256:evidence,
    SECURE_FAX_DESTINATION_VERIFICATION_POLICY_ACKNOWLEDGED:'1',
    SECURE_FAX_MINIMUM_NECESSARY_POLICY_ACKNOWLEDGED:'1',
    SECURE_FAX_PRODUCTION_ENABLED:'1',
  });
  assert.equal(readiness.enabled,true);
  const input={organizationId:'org-1',legalEntityId:'entity-1',faxJobId:'fax-1',destinationFax:'(614) 555-0100',destinationDirectoryId:'provider-1',destinationVerifiedAt:'2026-08-25T12:00:00Z',destinationVerifiedByUserId:'user-1',isRegularDestination:false,minimumNecessaryAttested:true,coverSheetIncluded:true,documentMimeType:'application/pdf',documentBytes:1000,documentSha256:evidence,purposeOfUse:'TREATMENT'};
  const candidate=buildSecureFaxCandidate(input);
  assert.equal(candidate.valid,true);
  assert.equal(candidate.destinationE164,'+16145550100');
  assert.equal(candidate.rawDocumentPersisted,false);
  assert.equal(buildSecureFaxCandidate({...input,minimumNecessaryAttested:false}).valid,false);
  assert.equal(normalizeSecureFaxReceipt({id:'fax-remote-1',status:'delivered',pages:2}).status,'DELIVERED');
});

test('drug knowledge uses official terminology/label sources while clinical interactions require a licensed validated source',()=>{
  const partial=getDrugKnowledgeReadiness({RXNORM_VERSION_EVIDENCE_SHA256:evidence,DAILYMED_VERSION_EVIDENCE_SHA256:evidence});
  assert.equal(partial.terminologyReady,true);
  assert.equal(partial.labelingReady,true);
  assert.equal(partial.clinicalDecisionSupportReady,false);
  assert.match(partial.blockers.join(' '),/licensed and validated/);
  const ready=getDrugKnowledgeReadiness({RXNORM_VERSION_EVIDENCE_SHA256:evidence,DAILYMED_VERSION_EVIDENCE_SHA256:evidence,DRUG_INTERACTION_MODE:'LICENSED_CLINICAL_SOURCE',DRUG_CLINICAL_SOURCE_LICENSE_EVIDENCE_SHA256:evidence,DRUG_CLINICAL_VALIDATION_EVIDENCE_SHA256:evidence});
  assert.equal(ready.enabled,true);
  assert.match(buildRxNormLookup({name:'acetaminophen'}).url,/rxnav\.nlm\.nih\.gov/);
  assert.match(buildDailyMedLookup({rxcui:'161'}).url,/dailymed\.nlm\.nih\.gov/);
  assert.equal(validateDrugKnowledgeProvenance({source:'RXNORM',sourceVersion:'2026-08-04',retrievedAt:'2026-08-25T12:00:00Z',artifactSha256:evidence}).valid,true);
});

test('shared controls isolate credentials, make retries selective, scope idempotency and redact PHI or secrets',()=>{
  const key=buildAdapterIdempotencyKey({adapter:'SANDATA',environment:'UAT',operation:'VISIT',subjectId:'visit-1',payloadSha256:evidence});
  assert.equal(key,buildAdapterIdempotencyKey({adapter:'SANDATA',environment:'UAT',operation:'VISIT',subjectId:'visit-1',payloadSha256:evidence}));
  assert.equal(retryDecision({attempt:2,httpStatus:503},0.5).retryable,true);
  assert.equal(retryDecision({attempt:2,httpStatus:401},0.5).retryable,false);
  const redacted=redactAdapterMetadata({authorization:'Bearer secret',patientName:'Alex',safeCode:'READY'});
  assert.deepEqual(redacted,{authorization:'[REDACTED]',patientName:'[REDACTED]',safeCode:'READY'});
  const audit=buildAdapterAuditEvent({adapter:'HETS',environment:'PRODUCTION',operation:'ELIGIBILITY',subjectType:'PATIENT',subjectId:'patient-1',status:'PENDING',payloadSha256:evidence,metadata:{memberId:'secret',result:'PENDING'}});
  assert.equal(JSON.stringify(audit).includes('patient-1'),false);
  assert.equal(JSON.stringify(audit).includes('secret'),false);
});
