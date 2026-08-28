import { explicitlyEnabled, isSha256, validateCredentialReference } from './production-adapter-controls.js';

export type SandataEnvironment='UAT'|'PRODUCTION';
export type SandataRecordType='RECIPIENT'|'STAFF'|'VISIT';

export const OHIO_SANDATA_SPEC={
  version:'4.4',
  published:'2026-05-06',
  maxRecordsPerTransaction:5000,
  completedVisitTransmissionHours:24,
  endpoints:{
    UAT:{RECIPIENT:'https://uat-api.sandata.com/interfaces/intake/patient/v2',STAFF:'https://uat-api.sandata.com/interfaces/intake/staff/v1',VISIT:'https://uat-api.sandata.com/interfaces/intake/visit/v2/'},
    PRODUCTION:{RECIPIENT:'https://api.sandata.com/interfaces/intake/patient/v2',STAFF:'https://api.sandata.com/interfaces/intake/staff/v1',VISIT:'https://api.sandata.com/interfaces/intake/visit/v2'},
  },
} as const;

export function getOhioSandataReadiness(env:Readonly<Record<string,string|undefined>>){
  const selectedEnvironment=String(env.OHIO_ALT_EVV_ENVIRONMENT||'UAT').trim().toUpperCase();
  const environment:SandataEnvironment=selectedEnvironment==='PRODUCTION'?'PRODUCTION':'UAT';
  const blockers:string[]=[];
  if(!explicitlyEnabled(env.OHIO_ALT_EVV_VENDOR_REGISTERED))blockers.push('Alternate EVV vendor registration is required');
  if(!explicitlyEnabled(env.OHIO_ALT_EVV_PROVIDER_DESIGNATED))blockers.push('At least one Ohio provider must designate SPIRE as its Alternate EVV vendor');
  if(!explicitlyEnabled(env.OHIO_ALT_EVV_SOD_USER_APPROVED))blockers.push('Sandata on Demand vendor user approval is required');
  const credentialError=validateCredentialReference(env.SANDATA_CREDENTIAL_REFERENCE,'Sandata credential reference');if(credentialError)blockers.push(credentialError);
  if(String(env.SANDATA_INTERFACE_SPEC_VERSION||'').trim()!==OHIO_SANDATA_SPEC.version)blockers.push('Ohio Alternate EVV interface specification 4.4 is required');
  if(!isSha256(env.SANDATA_UAT_CERTIFICATION_EVIDENCE_SHA256))blockers.push('Passing Sandata UAT certification evidence is required');
  if(environment==='PRODUCTION'&&!explicitlyEnabled(env.SANDATA_PRODUCTION_CERTIFIED))blockers.push('Sandata production certification is required');
  const activation=environment==='PRODUCTION'?env.SANDATA_PRODUCTION_ENABLED:env.SANDATA_UAT_ENABLED;
  if(!explicitlyEnabled(activation))blockers.push(`${environment==='PRODUCTION'?'SANDATA_PRODUCTION_ENABLED':'SANDATA_UAT_ENABLED'} must be explicitly set to 1`);
  return {environment,specificationVersion:OHIO_SANDATA_SPEC.version,configured:!credentialError,enabled:blockers.length===0,endpoints:OHIO_SANDATA_SPEC.endpoints[environment],blockers};
}

const utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const text=(value:unknown,max=500)=>String(value??'').trim().slice(0,max);
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

export function validateOhioSandataVisitPackage(input:unknown,options:{completedAt?:string|Date|null;now?:string|Date}={}){
  const rows=Array.isArray(input)?input:[];
  const errors:string[]=[];
  if(!Array.isArray(input))errors.push('Sandata visit package must be a JSON array');
  if(rows.length<1||rows.length>OHIO_SANDATA_SPEC.maxRecordsPerTransaction)errors.push('Sandata visit package must contain 1 to 5,000 records');
  rows.forEach((raw,index)=>{
    const visit=record(raw),prefix=`visit[${index}]`;
    const required=(key:string,max=500)=>{const value=text(visit[key],max);if(!value)errors.push(`${prefix}.${key} is required`);return value;};
    const business=required('BusinessEntityID',10),medicaid=required('BusinessEntityMedicaidIdentifier',9),sequence=required('SequenceID',50);
    required('VisitOtherID',50);required('StaffOtherID',50);required('PatientOtherID',50);required('PatientMedicaidID',20);required('Payer',20);required('PayerProgram',20);required('ProcedureCode',20);required('TimeZone',80);
    if(business.length>10)errors.push(`${prefix}.BusinessEntityID exceeds 10 characters`);
    if(!/^\d{7}$/.test(medicaid))errors.push(`${prefix}.BusinessEntityMedicaidIdentifier must be the Ohio 7-digit Medicaid provider ID`);
    if(!/^\d+$/.test(sequence)||BigInt(sequence)<1n)errors.push(`${prefix}.SequenceID must be a positive integer`);
    const calls=Array.isArray(visit.Calls)?visit.Calls:[];
    if(!calls.length)errors.push(`${prefix}.Calls is required`);
    const assignments=new Set<string>();
    calls.forEach((rawCall,callIndex)=>{const call=record(rawCall),callPrefix=`${prefix}.Calls[${callIndex}]`;const assignment=text(call.CallAssignment,40);assignments.add(assignment);if(!text(call.CallExternalID,50))errors.push(`${callPrefix}.CallExternalID is required`);if(!utc.test(text(call.CallDateTime,40)))errors.push(`${callPrefix}.CallDateTime must use UTC YYYY-MM-DDTHH:MM:SSZ`);if(!['Call In','Call Out'].includes(assignment))errors.push(`${callPrefix}.CallAssignment must be Call In or Call Out`);if(!text(call.CallType,40))errors.push(`${callPrefix}.CallType is required`);});
    if(!assignments.has('Call In')||!assignments.has('Call Out'))errors.push(`${prefix} requires both Call In and Call Out evidence`);
    const changes=Array.isArray(visit.VisitChanges)?visit.VisitChanges:[];
    changes.forEach((rawChange,changeIndex)=>{const change=record(rawChange),changePrefix=`${prefix}.VisitChanges[${changeIndex}]`;if(text(change.ReasonCode,4)!=='99')errors.push(`${changePrefix}.ReasonCode must be 99 for the current Ohio program`);if(!/^\S+@\S+\.\S+$/.test(text(change.ChangeMadeByEmail,64)))errors.push(`${changePrefix}.ChangeMadeByEmail must be valid`);if(!utc.test(text(change.ChangeDateTime,40)))errors.push(`${changePrefix}.ChangeDateTime must use UTC`);});
    const adjustedIn=text(visit.AdjInDateTime,40),adjustedOut=text(visit.AdjOutDateTime,40);
    if(adjustedIn&&!utc.test(adjustedIn))errors.push(`${prefix}.AdjInDateTime must use UTC`);
    if(adjustedOut&&!utc.test(adjustedOut))errors.push(`${prefix}.AdjOutDateTime must use UTC`);
    if(adjustedIn&&adjustedOut&&new Date(adjustedOut)<=new Date(adjustedIn))errors.push(`${prefix} adjusted end must be later than adjusted start`);
  });
  if(options.completedAt){const completed=new Date(options.completedAt),now=new Date(options.now??Date.now());const age=(now.getTime()-completed.getTime())/3_600_000;if(Number.isNaN(age)||age<0)errors.push('Completed visit timestamp is invalid');else if(age>OHIO_SANDATA_SPEC.completedVisitTransmissionHours)errors.push('Completed visit exceeded the Ohio 24-hour transmission requirement');}
  return {valid:errors.length===0,errors:[...new Set(errors)],recordCount:rows.length,specificationVersion:OHIO_SANDATA_SPEC.version};
}

export function normalizeSandataAcknowledgement(input:unknown){
  const response=record(input),data=record(response.data),transactionId=text(data.TransactionID||response.id,80),summary=text(response.messageSummary||data.Reason||response.data,500),failedCount=Number(response.failedCount||0);
  const transactionValid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId);
  const pending=/not ready|try again/i.test(summary),accepted=!pending&&failedCount===0&&/transaction received|uploaded successfully/i.test(summary);
  return {valid:transactionValid&&Boolean(summary),status:pending?'PENDING':accepted?'ACCEPTED':'REJECTED',transactionId:transactionValid?transactionId:null,summary:summary.slice(0,250),failedCount:Number.isFinite(failedCount)?failedCount:0,retryable:pending};
}
