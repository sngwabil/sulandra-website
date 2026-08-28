import { createHash } from 'node:crypto';

export type AdapterEnvironment='TEST'|'UAT'|'PRODUCTION';
export type AdapterReadiness={configured:boolean;enabled:boolean;blockers:string[]};
export type AdapterRetryDecision={retryable:boolean;delayMs:number|null;reason:string};

const sha256=/^[a-f0-9]{64}$/i;
const credentialReference=/^(railway|vault|aws-secretsmanager|azure-keyvault|gcp-secretmanager):\/\/[A-Za-z0-9._/@:+-]{3,500}$/;
const blockedMetadataKey=/(authorization|cookie|credential|password|secret|token|api.?key|ssn|social.?security|medicaid|member.?id|patient|payload|document|fax|phone|email|address|birth|name)/i;

export const isSha256=(value:unknown)=>sha256.test(String(value||'').trim());
export const explicitlyEnabled=(value:unknown)=>String(value||'').trim()==='1';

export function validateCredentialReference(value:unknown,label='credential reference'){
  const reference=String(value||'').trim();
  if(!reference)return `${label} is required`;
  if(!credentialReference.test(reference))return `${label} must reference an approved isolated secret provider`;
  return null;
}

export function approvedHttpsEndpoint(value:unknown,allowedHosts:unknown){
  const raw=String(value||'').trim();
  const allowlist=new Set(String(allowedHosts||'').split(',').map((entry)=>entry.trim().toLowerCase()).filter(Boolean));
  if(!raw)return {origin:null,error:'endpoint URL is required'};
  let parsed:URL;
  try{parsed=new URL(raw);}catch{return {origin:null,error:'endpoint URL must be an absolute URL'};}
  const hostname=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:')return {origin:null,error:'endpoint URL must use HTTPS'};
  if(parsed.username||parsed.password||parsed.hash)return {origin:null,error:'endpoint URL cannot contain credentials or a fragment'};
  if(!hostname||hostname==='localhost'||hostname.endsWith('.local')||hostname.endsWith('.internal')||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)||hostname.includes(':'))return {origin:null,error:'endpoint URL must use an approved public DNS hostname'};
  if(!allowlist.has(hostname))return {origin:parsed.origin,error:'endpoint hostname is not allowlisted'};
  return {origin:parsed.origin,error:null};
}

export function buildAdapterIdempotencyKey(input:{adapter:string;environment:AdapterEnvironment;operation:string;subjectId:string;payloadSha256:string}){
  if(!isSha256(input.payloadSha256))throw new Error('Adapter idempotency requires a valid payload SHA-256');
  const canonical=['spire-production-adapter-v1',input.adapter,input.environment,input.operation,input.subjectId,input.payloadSha256.toLowerCase()].join('\n');
  return `adapter_${createHash('sha256').update(canonical,'utf8').digest('hex')}`;
}

export function retryDecision(input:{attempt:number;httpStatus?:number|null;errorCode?:string|null;retryAfterMs?:number|null},random=0.5):AdapterRetryDecision{
  const attempt=Math.max(1,Math.trunc(input.attempt||1));
  const status=Number(input.httpStatus||0),code=String(input.errorCode||'').toUpperCase();
  const retryable=[408,425,429,500,502,503,504].includes(status)||['ETIMEDOUT','ECONNRESET','EAI_AGAIN','TEMPORARY_UNAVAILABLE'].includes(code);
  if(!retryable)return {retryable:false,delayMs:null,reason:status>=400&&status<500?'non-retryable client or authorization failure':'non-retryable adapter failure'};
  const retryAfter=Number(input.retryAfterMs);
  const cap=300_000,exponential=Math.min(cap,1_000*(2**Math.min(attempt-1,8)));
  const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(cap,retryAfter):Math.max(250,Math.round(exponential*(0.5+Math.min(1,Math.max(0,random)))));
  return {retryable:true,delayMs:delay,reason:status===429?'remote rate limit':'transient remote or network failure'};
}

export function redactAdapterMetadata(value:unknown,depth=0):unknown{
  if(depth>5)return '[TRUNCATED]';
  if(Array.isArray(value))return value.slice(0,50).map((item)=>redactAdapterMetadata(item,depth+1));
  if(!value||typeof value!=='object')return typeof value==='string'?value.slice(0,1000):value;
  const result:Record<string,unknown>={};
  for(const [key,entry] of Object.entries(value as Record<string,unknown>).slice(0,100))result[key]=blockedMetadataKey.test(key)?'[REDACTED]':redactAdapterMetadata(entry,depth+1);
  return result;
}

export function buildAdapterAuditEvent(input:{adapter:string;environment:AdapterEnvironment;operation:string;subjectType:string;subjectId:string;status:string;idempotencyKey?:string|null;payloadSha256?:string|null;externalReference?:string|null;metadata?:unknown}){
  return {
    schema:'spire-production-adapter-audit/v1',
    adapter:input.adapter,
    environment:input.environment,
    operation:input.operation,
    subjectType:input.subjectType,
    subjectIdHash:createHash('sha256').update(input.subjectId,'utf8').digest('hex'),
    status:input.status,
    idempotencyKey:input.idempotencyKey??null,
    payloadSha256:isSha256(input.payloadSha256)?String(input.payloadSha256).toLowerCase():null,
    externalReferenceHash:input.externalReference?createHash('sha256').update(input.externalReference,'utf8').digest('hex'):null,
    metadata:redactAdapterMetadata(input.metadata??{}),
  };
}
