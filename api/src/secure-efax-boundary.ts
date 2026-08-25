import { createHash } from 'node:crypto';
import { approvedHttpsEndpoint, buildAdapterIdempotencyKey, explicitlyEnabled, isSha256, validateCredentialReference } from './production-adapter-controls.js';

export const SECURE_FAX_CONTROLS={
  standard:'HIPAA_REASONABLE_SAFEGUARDS',
  maxDocumentBytes:25*1024*1024,
  allowedMimeTypes:['application/pdf','image/tiff'] as const,
} as const;

export function getSecureFaxReadiness(env:Readonly<Record<string,string|undefined>>){
  const mode=String(env.SECURE_FAX_MODE||'DISABLED').trim().toUpperCase();
  const endpoint=approvedHttpsEndpoint(env.SECURE_FAX_ENDPOINT_URL,env.SECURE_FAX_ALLOWED_HOSTS);
  const blockers:string[]=[];
  if(mode!=='EXTERNAL_API')blockers.push('SECURE_FAX_MODE must be EXTERNAL_API');
  if(endpoint.error)blockers.push(endpoint.error);
  const credentialError=validateCredentialReference(env.SECURE_FAX_CREDENTIAL_REFERENCE,'Secure fax credential reference');
  if(credentialError)blockers.push(credentialError);
  if(!isSha256(env.SECURE_FAX_BAA_EVIDENCE_SHA256))blockers.push('A signed Business Associate Agreement evidence SHA-256 is required');
  if(!isSha256(env.SECURE_FAX_SECURITY_REVIEW_EVIDENCE_SHA256))blockers.push('Secure fax vendor security review evidence is required');
  if(!isSha256(env.SECURE_FAX_TEST_DELIVERY_EVIDENCE_SHA256))blockers.push('Passing test delivery and receipt evidence is required');
  if(!explicitlyEnabled(env.SECURE_FAX_DESTINATION_VERIFICATION_POLICY_ACKNOWLEDGED))blockers.push('Fax destination verification policy acknowledgement is required');
  if(!explicitlyEnabled(env.SECURE_FAX_MINIMUM_NECESSARY_POLICY_ACKNOWLEDGED))blockers.push('HIPAA minimum-necessary policy acknowledgement is required');
  if(!explicitlyEnabled(env.SECURE_FAX_PRODUCTION_ENABLED))blockers.push('SECURE_FAX_PRODUCTION_ENABLED must be explicitly set to 1');
  return {mode,configured:mode==='EXTERNAL_API'&&!endpoint.error&&!credentialError,enabled:blockers.length===0,endpointOrigin:endpoint.origin,blockers};
}

const normalizeFaxNumber=(value:unknown)=>{
  const raw=String(value??'').trim();
  const digits=raw.replace(/\D/g,'');
  if(digits.length===10)return `+1${digits}`;
  if(digits.length>=11&&digits.length<=15)return `+${digits}`;
  return null;
};

export type SecureFaxCandidateInput={
  organizationId:string;
  legalEntityId:string;
  faxJobId:string;
  destinationFax:string;
  destinationDirectoryId?:string|null;
  destinationVerifiedAt?:string|null;
  destinationVerifiedByUserId?:string|null;
  isRegularDestination:boolean;
  minimumNecessaryAttested:boolean;
  coverSheetIncluded:boolean;
  documentMimeType:string;
  documentBytes:number;
  documentSha256:string;
  purposeOfUse:string;
};

export function buildSecureFaxCandidate(input:SecureFaxCandidateInput){
  const errors:string[]=[];
  const destination=normalizeFaxNumber(input.destinationFax);
  if(!destination)errors.push('Destination fax number must be valid E.164');
  if(!input.destinationDirectoryId)errors.push('Destination must resolve to an approved recipient directory entry');
  if(!input.isRegularDestination&&(!input.destinationVerifiedAt||!input.destinationVerifiedByUserId))errors.push('A non-regular fax destination must be independently verified before transmission');
  if(input.destinationVerifiedAt&&Number.isNaN(new Date(input.destinationVerifiedAt).getTime()))errors.push('Destination verification timestamp is invalid');
  if(!input.minimumNecessaryAttested)errors.push('Minimum-necessary disclosure must be attested');
  if(!input.coverSheetIncluded)errors.push('A privacy cover sheet is required');
  if(!(SECURE_FAX_CONTROLS.allowedMimeTypes as readonly string[]).includes(input.documentMimeType))errors.push('Fax document must be PDF or TIFF');
  if(!Number.isInteger(input.documentBytes)||input.documentBytes<1||input.documentBytes>SECURE_FAX_CONTROLS.maxDocumentBytes)errors.push('Fax document size is invalid');
  if(!isSha256(input.documentSha256))errors.push('Fax document SHA-256 is invalid');
  if(!String(input.purposeOfUse||'').trim())errors.push('Purpose of use is required');
  const destinationHash=destination?createHash('sha256').update(destination,'utf8').digest('hex'):null;
  const idempotencyKey=errors.length?null:buildAdapterIdempotencyKey({adapter:'SECURE_EFAX',environment:'PRODUCTION',operation:'SEND',subjectId:input.faxJobId,payloadSha256:input.documentSha256});
  return {valid:errors.length===0,errors,destinationE164:errors.length?null:destination,destinationHash,idempotencyKey,documentSha256:isSha256(input.documentSha256)?input.documentSha256.toLowerCase():null,rawDocumentPersisted:false};
}

export function normalizeSecureFaxReceipt(input:unknown){
  const record=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
  const externalId=String(record.id||record.faxId||record.transmissionId||'').trim().slice(0,200);
  const remote=String(record.status||'').trim().toUpperCase();
  const pages=Number(record.pages||record.pageCount||0);
  const status=['DELIVERED','COMPLETED','SUCCESS'].includes(remote)?'DELIVERED':['FAILED','REJECTED','CANCELED'].includes(remote)?'FAILED':['QUEUED','PROCESSING','SENDING','PENDING'].includes(remote)?'PENDING':'UNKNOWN';
  return {valid:Boolean(externalId)&&status!=='UNKNOWN',externalId,status,pageCount:Number.isInteger(pages)&&pages>=0?pages:null,retryable:status==='PENDING',rawProviderPayloadPersisted:false};
}
