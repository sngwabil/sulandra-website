import { createHash } from 'node:crypto';

export type IqiesTransportEnvironment='SANDBOX'|'PRODUCTION';
export type IqiesCertificationStatus='NOT_CERTIFIED'|'SANDBOX_APPROVED'|'PRODUCTION_CERTIFIED';
export type IqiesReconciliationStatus='EXPORTED'|'SUBMITTED'|'ACCEPTED'|'REJECTED'|'PARTIAL'|'ERROR';

export type IqiesTransportReadiness={
  mode:'DISABLED'|'EXTERNAL_ADAPTER';
  environment:IqiesTransportEnvironment;
  certificationStatus:IqiesCertificationStatus;
  configured:boolean;
  submissionEnabled:boolean;
  endpointOrigin:string|null;
  blockers:string[];
};

export type IqiesTransportRequest={
  submissionId:string;
  idempotencyKey:string;
  payload:Uint8Array;
  payloadSha256:string;
  payloadBytes:number;
};

export type IqiesTransportReceipt={
  externalSubmissionId:string;
  status:'SUBMITTED';
  acceptedAt:string;
};

export interface IqiesTransport{
  submit(request:IqiesTransportRequest):Promise<IqiesTransportReceipt>;
}

export class IqiesTransportError extends Error{
  readonly code:'ADAPTER_DISABLED'|'ADAPTER_NOT_READY'|'REMOTE_REJECTED'|'REMOTE_TRANSIENT'|'REMOTE_PROTOCOL_ERROR';
  readonly retryable:boolean;
  constructor(code:IqiesTransportError['code'],safeMessage:string,retryable=false){
    super(safeMessage);
    this.name='IqiesTransportError';
    this.code=code;
    this.retryable=retryable;
  }
}

const mode=(value:unknown):IqiesTransportReadiness['mode']=>String(value||'').trim().toUpperCase()==='EXTERNAL_ADAPTER'?'EXTERNAL_ADAPTER':'DISABLED';
const environment=(value:unknown):IqiesTransportEnvironment=>String(value||'').trim().toUpperCase()==='PRODUCTION'?'PRODUCTION':'SANDBOX';
const certification=(value:unknown):IqiesCertificationStatus=>{
  const normalized=String(value||'').trim().toUpperCase();
  if(normalized==='PRODUCTION_CERTIFIED')return 'PRODUCTION_CERTIFIED';
  if(normalized==='SANDBOX_APPROVED')return 'SANDBOX_APPROVED';
  return 'NOT_CERTIFIED';
};
const enabled=(value:unknown)=>String(value||'').trim()==='1';
const allowedHosts=(value:unknown)=>new Set(String(value||'').split(',').map((entry)=>entry.trim().toLowerCase()).filter(Boolean));
const sha256=/^[a-f0-9]{64}$/i;

function safeEndpoint(value:unknown,allowed:Set<string>){
  const raw=String(value||'').trim();
  if(!raw)return {origin:null,error:'IQIES_ENDPOINT_URL is required'};
  let parsed:URL;
  try{parsed=new URL(raw);}catch{return {origin:null,error:'IQIES_ENDPOINT_URL must be a valid absolute URL'};}
  const hostname=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:')return {origin:null,error:'IQIES_ENDPOINT_URL must use HTTPS'};
  if(parsed.username||parsed.password||parsed.hash)return {origin:null,error:'IQIES_ENDPOINT_URL cannot contain credentials or a fragment'};
  if(!hostname||hostname==='localhost'||hostname.endsWith('.local')||hostname.endsWith('.internal')||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)||hostname.includes(':'))return {origin:null,error:'IQIES_ENDPOINT_URL must use an approved public DNS hostname'};
  if(!allowed.size||!allowed.has(hostname))return {origin:parsed.origin,error:'IQIES endpoint hostname is not present in IQIES_ALLOWED_HOSTS'};
  return {origin:parsed.origin,error:null};
}

export function getIqiesTransportReadiness(env:Readonly<Record<string,string|undefined>>):IqiesTransportReadiness{
  const selectedMode=mode(env.IQIES_TRANSPORT_MODE);
  const selectedEnvironment=environment(env.IQIES_ENVIRONMENT);
  const certificationStatus=certification(env.IQIES_CERTIFICATION_STATUS);
  const endpoint=safeEndpoint(env.IQIES_ENDPOINT_URL,allowedHosts(env.IQIES_ALLOWED_HOSTS));
  const blockers:string[]=[];

  if(selectedMode!=='EXTERNAL_ADAPTER')blockers.push('IQIES_TRANSPORT_MODE is not EXTERNAL_ADAPTER');
  if(endpoint.error)blockers.push(endpoint.error);
  if(!String(env.IQIES_CREDENTIAL_REFERENCE||'').trim())blockers.push('IQIES_CREDENTIAL_REFERENCE is required');
  if(selectedEnvironment==='SANDBOX'&&!['SANDBOX_APPROVED','PRODUCTION_CERTIFIED'].includes(certificationStatus))blockers.push('iQIES sandbox approval is required');
  if(selectedEnvironment==='PRODUCTION'&&certificationStatus!=='PRODUCTION_CERTIFIED')blockers.push('iQIES production certification is required');
  const activationKey=selectedEnvironment==='PRODUCTION'?'IQIES_PRODUCTION_SUBMISSION_ENABLED':'IQIES_SANDBOX_SUBMISSION_ENABLED';
  if(!enabled(env[activationKey]))blockers.push(`${activationKey} must be explicitly set to 1`);

  const configured=selectedMode==='EXTERNAL_ADAPTER'&&!endpoint.error&&Boolean(String(env.IQIES_CREDENTIAL_REFERENCE||'').trim());
  return {mode:selectedMode,environment:selectedEnvironment,certificationStatus,configured,submissionEnabled:configured&&blockers.length===0,endpointOrigin:endpoint.origin,blockers};
}

export function buildIqiesIdempotencyKey(input:{organizationId:string;legalEntityId:string;oasisAssessmentId:string;transactionMode:string;payloadSha256:string}){
  if(!sha256.test(input.payloadSha256))throw new IqiesTransportError('REMOTE_PROTOCOL_ERROR','A valid OASIS payload SHA-256 is required');
  const canonical=['spire-iqies-v1',input.organizationId,input.legalEntityId,input.oasisAssessmentId,input.transactionMode,input.payloadSha256.toLowerCase()].join('\n');
  return `iqies_${createHash('sha256').update(canonical,'utf8').digest('hex')}`;
}

const transitions:Record<IqiesReconciliationStatus,ReadonlySet<IqiesReconciliationStatus>>={
  EXPORTED:new Set(['EXPORTED','SUBMITTED','ACCEPTED','REJECTED','PARTIAL','ERROR']),
  SUBMITTED:new Set(['SUBMITTED','ACCEPTED','REJECTED','PARTIAL','ERROR']),
  PARTIAL:new Set(['PARTIAL','ACCEPTED','REJECTED','ERROR']),
  ERROR:new Set(['ERROR','SUBMITTED']),
  ACCEPTED:new Set(['ACCEPTED']),
  REJECTED:new Set(['REJECTED']),
};

export function assertIqiesReconciliationTransition(current:unknown,next:unknown){
  const from=String(current||'').toUpperCase() as IqiesReconciliationStatus;
  const to=String(next||'').toUpperCase() as IqiesReconciliationStatus;
  if(!transitions[from]||!transitions[from].has(to))throw new IqiesTransportError('REMOTE_PROTOCOL_ERROR',`iQIES reconciliation cannot move from ${from||'UNKNOWN'} to ${to||'UNKNOWN'}`);
}

export class DisabledIqiesTransport implements IqiesTransport{
  async submit(_request:IqiesTransportRequest):Promise<IqiesTransportReceipt>{
    throw new IqiesTransportError('ADAPTER_DISABLED','External iQIES submission is disabled');
  }
}
