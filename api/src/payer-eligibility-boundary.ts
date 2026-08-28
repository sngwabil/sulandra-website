import { createHash } from 'node:crypto';
import { approvedHttpsEndpoint, explicitlyEnabled, isSha256, validateCredentialReference } from './production-adapter-controls.js';

export const HIPAA_ELIGIBILITY_STANDARD='005010X279A1';
export const CMS_HETS_GUIDES={companion:'15-1',connectivity:'11-1',mode:'REAL_TIME_ONLY'} as const;

export function getPayerConnectivityReadiness(env:Readonly<Record<string,string|undefined>>){
  const mode=String(env.PAYER_CONNECTIVITY_MODE||'DISABLED').trim().toUpperCase();
  const endpoint=approvedHttpsEndpoint(env.PAYER_ENDPOINT_URL,env.PAYER_ALLOWED_HOSTS);
  const blockers:string[]=[];
  if(!['CLEARINGHOUSE','DIRECT_HETS','PAYER_API','SFTP'].includes(mode))blockers.push('An approved payer or clearinghouse transport mode is required');
  if(endpoint.error)blockers.push(endpoint.error);
  const credentialError=validateCredentialReference(env.PAYER_CREDENTIAL_REFERENCE,'Payer credential reference');if(credentialError)blockers.push(credentialError);
  if(mode==='CLEARINGHOUSE'&&!isSha256(env.PAYER_BAA_EVIDENCE_SHA256))blockers.push('Clearinghouse Business Associate Agreement evidence is required');
  if(!isSha256(env.PAYER_TRADING_PARTNER_AGREEMENT_SHA256))blockers.push('Trading Partner Agreement evidence is required');
  if(!isSha256(env.PAYER_COMPANION_GUIDE_SHA256))blockers.push('Payer companion guide evidence is required');
  if(!isSha256(env.PAYER_CONNECTIVITY_TEST_EVIDENCE_SHA256))blockers.push('Passing payer connectivity test evidence is required');
  if(!explicitlyEnabled(env.PAYER_PRODUCTION_ENABLED))blockers.push('PAYER_PRODUCTION_ENABLED must be explicitly set to 1');
  return {mode,configured:!endpoint.error&&!credentialError,enabled:blockers.length===0,endpointOrigin:endpoint.origin,blockers};
}

export function getHetsEligibilityReadiness(env:Readonly<Record<string,string|undefined>>){
  const blockers:string[]=[];
  if(!explicitlyEnabled(env.HETS_TPA_APPROVED))blockers.push('CMS HETS Trading Partner Agreement approval is required');
  if(validateCredentialReference(env.HETS_SUBMITTER_ID_REFERENCE,'HETS Submitter ID reference'))blockers.push('An isolated HETS Submitter ID reference is required');
  if(validateCredentialReference(env.HETS_CREDENTIAL_REFERENCE,'HETS credential reference'))blockers.push('An isolated HETS credential reference is required');
  if(!explicitlyEnabled(env.HETS_PROVIDER_EDI_ENROLLMENT_VERIFIED))blockers.push('Provider EDI enrollment verification is required');
  if(String(env.HETS_COMPANION_GUIDE_VERSION||'').trim()!==CMS_HETS_GUIDES.companion)blockers.push(`CMS HETS companion guide ${CMS_HETS_GUIDES.companion} is required`);
  if(String(env.HETS_CONNECTIVITY_GUIDE_VERSION||'').trim()!==CMS_HETS_GUIDES.connectivity)blockers.push(`CMS HETS connectivity guide ${CMS_HETS_GUIDES.connectivity} is required`);
  if(!['SOAP','MIME'].includes(String(env.HETS_CONNECTIVITY_MODE||'').trim().toUpperCase()))blockers.push('HETS connectivity must be SOAP or MIME');
  if(!isSha256(env.HETS_TEST_APPROVAL_EVIDENCE_SHA256))blockers.push('CMS-approved HETS testing evidence is required');
  if(!explicitlyEnabled(env.HETS_PRODUCTION_ENABLED))blockers.push('HETS_PRODUCTION_ENABLED must be explicitly set to 1');
  return {standard:HIPAA_ELIGIBILITY_STANDARD,mode:CMS_HETS_GUIDES.mode,companionGuide:CMS_HETS_GUIDES.companion,connectivityGuide:CMS_HETS_GUIDES.connectivity,enabled:blockers.length===0,blockers};
}

const clean=(value:unknown,max=80)=>String(value??'').trim().slice(0,max).replace(/[~*:^|]/g,' ').replace(/\s+/g,' ');
const digits=(value:unknown,width:number)=>String(value??'').replace(/\D/g,'').slice(-width).padStart(width,'0');
const date8=(value:unknown)=>{const date=value instanceof Date?value:new Date(String(value||''));return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10).replaceAll('-','');};

export type Eligibility270Input={submitterId:string;receiverId:string;payerName:string;providerNpi:string;memberId:string;subscriberFirstName:string;subscriberLastName:string;subscriberDateOfBirth:string;dateOfService:string;serviceTypeCode:string;traceNumber:string;interchangeControlNumber:string;groupControlNumber:string;transactionControlNumber:string};

export function buildEligibility270Candidate(input:Eligibility270Input,now=new Date()){
  const errors:string[]=[];
  if(!clean(input.submitterId,30))errors.push('Submitter ID is required');
  if(!clean(input.receiverId,30))errors.push('Receiver ID is required');
  if(!/^\d{10}$/.test(clean(input.providerNpi,20)))errors.push('Provider NPI must be 10 digits');
  if(!clean(input.memberId,30))errors.push('Subscriber member ID is required');
  if(!clean(input.subscriberFirstName,35)||!clean(input.subscriberLastName,60))errors.push('Subscriber first and last name are required');
  if(!date8(input.subscriberDateOfBirth))errors.push('Subscriber date of birth is invalid');
  if(!date8(input.dateOfService))errors.push('Date of service is invalid');
  if(!clean(input.serviceTypeCode,3))errors.push('Eligibility service type code is required');
  const isa=digits(input.interchangeControlNumber,9),gs=String(Number(input.groupControlNumber)||1),st=digits(input.transactionControlNumber,4),trace=clean(input.traceNumber,50);
  const yymmdd=now.toISOString().slice(2,10).replaceAll('-',''),date=date8(now),time=now.toISOString().slice(11,16).replace(':','');
  const pad=(value:unknown,width:number)=>clean(value,width).padEnd(width,' ');
  const segments=[
    `ISA*00*${' '.repeat(10)}*00*${' '.repeat(10)}*ZZ*${pad(input.submitterId,15)}*ZZ*${pad(input.receiverId,15)}*${yymmdd}*${time}*^*00501*${isa}*1*T*:`,
    `GS*HS*${clean(input.submitterId,15)}*${clean(input.receiverId,15)}*${date}*${time}*${gs}*X*${HIPAA_ELIGIBILITY_STANDARD}`,
    `ST*270*${st}*${HIPAA_ELIGIBILITY_STANDARD}`,
    `BHT*0022*13*${trace}*${date}*${time}`,
    'HL*1**20*1',
    `NM1*PR*2*${clean(input.payerName,60)}*****PI*${clean(input.receiverId,30)}`,
    'HL*2*1*21*1',
    `NM1*1P*2*SULANDRA HEALTH*****XX*${clean(input.providerNpi,10)}`,
    'HL*3*2*22*0',
    `TRN*1*${trace}*${clean(input.submitterId,30)}`,
    `NM1*IL*1*${clean(input.subscriberLastName,60)}*${clean(input.subscriberFirstName,35)}****MI*${clean(input.memberId,30)}`,
    `DMG*D8*${date8(input.subscriberDateOfBirth)}`,
    `DTP*291*D8*${date8(input.dateOfService)}`,
    `EQ*${clean(input.serviceTypeCode,3)}`,
  ];
  segments.push(`SE*${segments.length-1}*${st}`,`GE*1*${gs}`,`IEA*1*${isa}`);
  const payload=`${segments.join('~')}~`;
  return {valid:errors.length===0,errors,payload:errors.length?null:payload,payloadSha256:errors.length?null:createHash('sha256').update(payload,'utf8').digest('hex'),standard:HIPAA_ELIGIBILITY_STANDARD,realTimeOnly:true,externalCompanionGuideValidationRequired:true};
}

export function parseEligibility271(raw:string){
  if(typeof raw!=='string'||raw.length<10||raw.length>2_000_000)throw new Error('271 payload size is invalid');
  const segments=raw.replace(/[\r\n]+/g,'').split('~').map((segment)=>segment.trim()).filter(Boolean);
  const errors:Array<{level:string;rejectReason:string|null;followUpAction:string|null}> = [];
  const benefits:Array<{informationCode:string|null;coverageLevel:string|null;serviceTypeCodes:string[];insuranceType:string|null;description:string|null;amount:string|null;percent:string|null}> = [];
  let traceNumber:string|null=null;
  for(const segment of segments){const parts=segment.split('*');if(parts[0]==='TRN'&&!traceNumber)traceNumber=clean(parts[2],100)||null;if(parts[0]==='AAA')errors.push({level:clean(parts[1],20)||'UNKNOWN',rejectReason:clean(parts[3],10)||null,followUpAction:clean(parts[4],10)||null});if(parts[0]==='EB')benefits.push({informationCode:clean(parts[1],10)||null,coverageLevel:clean(parts[2],10)||null,serviceTypeCodes:clean(parts[3],200).split('^').filter(Boolean),insuranceType:clean(parts[4],10)||null,description:clean(parts[5],250)||null,amount:clean(parts[7],30)||null,percent:clean(parts[8],30)||null});}
  return {valid:segments.some((segment)=>segment.startsWith('ST*271*'))&&Boolean(traceNumber),traceNumber,errors,benefits,responseSha256:createHash('sha256').update(raw,'utf8').digest('hex'),rawPayloadPersisted:false};
}
