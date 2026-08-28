import { explicitlyEnabled, isSha256, validateCredentialReference } from './production-adapter-controls.js';

export const IQIES_OFFICIAL_WORKFLOW={
  portalUrl:'https://iqies.cms.gov/',
  validationUtilityUrl:'https://iqies.cms.gov/vut',
  oasisSpecification:'OASIS-E2 3.02.0',
  errorGuideVersion:'2.4',
  finalValidationReportDeadlineHours:24,
} as const;

export type IqiesCertificationReadiness={
  workflow:'CMS_IQIES_XML_UPLOAD';
  officialWorkflowReady:boolean;
  automatedMachineTransportReady:false;
  vendorRegistered:boolean;
  harpApproved:boolean;
  providerSecurityOfficialApproved:boolean;
  assessmentSubmitterRoleApproved:boolean;
  vutEvidenceVerified:boolean;
  blockers:string[];
};

export function getIqiesCertificationReadiness(env:Readonly<Record<string,string|undefined>>):IqiesCertificationReadiness{
  const blockers:string[]=[];
  const vendorRegistered=explicitlyEnabled(env.IQIES_VENDOR_REGISTRATION_CONFIRMED);
  const harpApproved=explicitlyEnabled(env.IQIES_HARP_ACCOUNT_APPROVED);
  const providerSecurityOfficialApproved=explicitlyEnabled(env.IQIES_PROVIDER_SECURITY_OFFICIAL_APPROVED);
  const assessmentSubmitterRoleApproved=explicitlyEnabled(env.IQIES_ASSESSMENT_SUBMITTER_ROLE_APPROVED);
  const vutEvidenceVerified=isSha256(env.IQIES_VUT_PASS_EVIDENCE_SHA256);
  if(!vendorRegistered)blockers.push('CMS OASIS vendor registration is not confirmed');
  if(!harpApproved)blockers.push('HARP account approval is required');
  if(!providerSecurityOfficialApproved)blockers.push('Provider Security Official approval is required');
  if(!assessmentSubmitterRoleApproved)blockers.push('iQIES Assessment Submitter role approval is required');
  if(validateCredentialReference(env.IQIES_CCN_REFERENCE,'CCN reference'))blockers.push('An isolated CCN reference is required');
  if(String(env.IQIES_VUT_SPEC_VERSION||'').trim()!=='3.02')blockers.push('VUT evidence must use OASIS-E2 submission specification 3.02');
  if(String(env.IQIES_ERROR_GUIDE_VERSION||'').trim()!=='2.4')blockers.push('OASIS Error Message Reference Guide 2.4 acknowledgement is required');
  if(!vutEvidenceVerified)blockers.push('A SHA-256-bound passing VUT result is required');
  if(!explicitlyEnabled(env.IQIES_SANDBOX_WORKFLOW_ENABLED))blockers.push('IQIES_SANDBOX_WORKFLOW_ENABLED must be explicitly set to 1');
  return {workflow:'CMS_IQIES_XML_UPLOAD',officialWorkflowReady:blockers.length===0,automatedMachineTransportReady:false,vendorRegistered,harpApproved,providerSecurityOfficialApproved,assessmentSubmitterRoleApproved,vutEvidenceVerified,blockers};
}

export type IqiesFinalValidationEvidence={
  reportType:'AGENCY_FINAL_VALIDATION'|'SUBMITTER_FINAL_VALIDATION';
  reportSha256:string;
  submittedAt:string;
  generatedAt:string;
  recordCount:number;
  fatalCount:number;
  warningCount:number;
};

export function normalizeIqiesFinalValidationEvidence(input:IqiesFinalValidationEvidence){
  const errors:string[]=[];
  if(!isSha256(input.reportSha256))errors.push('Final Validation Report SHA-256 is invalid');
  const submitted=new Date(input.submittedAt),generated=new Date(input.generatedAt);
  if(Number.isNaN(submitted.getTime())||Number.isNaN(generated.getTime()))errors.push('Submission and report timestamps must be valid ISO timestamps');
  const elapsedHours=(generated.getTime()-submitted.getTime())/3_600_000;
  if(!Number.isNaN(elapsedHours)&&(elapsedHours<0||elapsedHours>IQIES_OFFICIAL_WORKFLOW.finalValidationReportDeadlineHours))errors.push('Final Validation Report must be associated with the submission and generated within 24 hours');
  for(const [label,value] of [['recordCount',input.recordCount],['fatalCount',input.fatalCount],['warningCount',input.warningCount]] as const)if(!Number.isInteger(value)||value<0)errors.push(`${label} must be a non-negative integer`);
  if(input.fatalCount>input.recordCount||input.warningCount>input.recordCount)errors.push('Finding counts cannot exceed the submitted record count');
  const status=input.fatalCount>0?'REJECTED':input.warningCount>0?'REVIEW_REQUIRED':'ACCEPTED';
  return {valid:errors.length===0,status,errors,requiresCorrectionAndResubmission:input.fatalCount>0,requiresWarningReview:input.warningCount>0,reportSha256:isSha256(input.reportSha256)?input.reportSha256.toLowerCase():null,elapsedHours:Number.isFinite(elapsedHours)?elapsedHours:null};
}
