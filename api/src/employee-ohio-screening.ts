import type { PrismaClient } from '@prisma/client';

export type OhioScreeningReadiness = {
  caseId: string; employeeId: string; profileCode: string;
  status: 'IN_PROGRESS'|'CONDITIONAL'|'ELIGIBLE'|'BLOCKED'|'EXPIRED'; workEligible: boolean;
  blockers: string[]; warnings: string[]; missingChecks: string[]; nextRecheckDate: string|null; details: Record<string,unknown>;
};
type ScreeningRequirement={code:string;label:string;result:string;renewalDays?:number;conditional?:'FBI_IF_NO_OHIO_5Y'|'RAPBACK_REQUIRED'|'TRANSPORT';reviewOnly?:boolean};
const clean=(v:unknown,max=5000)=>String(v??'').trim().slice(0,max);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const toDate=(v:unknown):Date|null=>{
 if(v===null||v===undefined||v==='')return null;
 if(v instanceof Date)return Number.isNaN(v.getTime())?null:new Date(v.getTime());
 const raw=clean(v,80);if(!raw||!/\b\d{4}\b/.test(raw))return null;
 const parsed=new Date(raw);return Number.isNaN(parsed.getTime())?null:parsed;
};
const dateOnly=(v:unknown)=>{
 if(v===null||v===undefined||v==='')return '';
 if(v instanceof Date)return Number.isNaN(v.getTime())?'':v.toISOString().slice(0,10);
 const raw=clean(v,80),iso=/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(raw);if(iso)return iso[1];
 const parsed=toDate(raw);return parsed?parsed.toISOString().slice(0,10):'';
};
const dayMs=86_400_000;
const addDays=(v:unknown,days:number)=>{const d=toDate(v)??(!v?new Date():null);if(!d)return null;d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const daysSince=(v:unknown)=>{const d=toDate(v);return d?Math.floor((Date.now()-d.getTime())/dayMs):null};
const businessDaysAfter=(v:unknown,count:number)=>{const only=dateOnly(v),d=only?new Date(`${only}T12:00:00Z`):null;if(!d||Number.isNaN(d.getTime()))return null;let left=count;while(left>0){d.setUTCDate(d.getUTCDate()+1);const day=d.getUTCDay();if(day!==0&&day!==6)left--;}return d.toISOString().slice(0,10)};
const unique=(v:string[])=>[...new Set(v.filter(Boolean))];
export async function loadOhioScreeningCase(p:PrismaClient,o:string,e:string,id:string){const rows=await p.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT c.*,p."profileCode",p."name" AS "profileName",p."renewalDays",p."requirements",p."authority",p."authorityUrl",p."reviewedOn" FROM "EmployeeOhioScreeningCase" c JOIN "EmployeeOhioScreeningProfileVersion" p ON p."id"=c."profileVersionId" WHERE c."organizationId"=$1 AND c."legalEntityId"=$2 AND c."id"=$3 LIMIT 1`,o,e,id);if(!rows[0])throw Object.assign(new Error('Ohio workforce-screening case was not found in the selected company'),{status:404});return rows[0]}
export async function latestOhioScreeningChecks(p:PrismaClient,o:string,e:string,id:string){return p.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT DISTINCT ON ("checkCode") * FROM "EmployeeOhioScreeningCheck" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "caseId"=$3 ORDER BY "checkCode","checkedAt" DESC,"createdAt" DESC`,o,e,id)}
function applies(r:ScreeningRequirement,row:Record<string,unknown>){if(r.conditional==='FBI_IF_NO_OHIO_5Y')return row.ohioResidentFiveYears!==true;if(r.conditional==='TRANSPORT')return row.transportDuties===true;if(r.conditional==='RAPBACK_REQUIRED')return row.rapbackUnavailable!==true;return true}
function passes(c:Record<string,unknown>|undefined,r:ScreeningRequirement){const x=clean(c?.result,40).toUpperCase();return r.result==='CLEAR'?x==='CLEAR':r.result==='ENROLLED'?x==='ENROLLED':x==='COMPLETED'||x===r.result}
export async function evaluateOhioScreeningCase(p:PrismaClient,o:string,e:string,id:string):Promise<OhioScreeningReadiness>{
 const row=await loadOhioScreeningCase(p,o,e,id),checks=await latestOhioScreeningChecks(p,o,e,id),by=new Map(checks.map(c=>[clean(c.checkCode,120),c])),reqs=arr(row.requirements).map(v=>obj(v) as unknown as ScreeningRequirement),profile=clean(row.profileCode,120),blockers:string[]=[],warnings:string[]=[],missing:string[]=[];let nextRecheck:string|null=null;
 const rapbackRequired=profile==='OH_DODD_DIRECT_SERVICES'&&row.rapbackUnavailable!==true;
 for(const r of reqs){
  if(!r.code||!applies(r,row))continue;
  const c=by.get(r.code);
  if(r.code==='RAPBACK_ENROLLMENT'&&rapbackRequired){if(!c)missing.push(r.code);continue;}
  if(!c){missing.push(r.code);(r.reviewOnly?warnings:blockers).push(`${r.label} is missing.`);continue}
  const result=clean(c.result,40).toUpperCase();
  if(['HIT','DISQUALIFYING','EXPIRED'].includes(result)){(r.reviewOnly&&result==='HIT'?warnings:blockers).push(`${r.label} is ${result.toLowerCase()}${r.reviewOnly?' and requires documented review.':' and prevents direct-service eligibility.'}`);continue}
  if(result==='UNAVAILABLE'){blockers.push(`${r.label} is unavailable and requires follow-up before eligibility can be established.`);continue}
  const renewal=Number(r.renewalDays||0);
  if(renewal>0){const age=daysSince(c.checkedAt),due=dateOnly(c.expiresAt)||addDays(c.checkedAt,renewal);if(due&&(!nextRecheck||due<nextRecheck))nextRecheck=due;if(age!=null&&age>renewal)blockers.push(`${r.label} is past its ${renewal}-day recheck interval.`)}
  if(!passes(c,r)&&!r.reviewOnly)blockers.push(`${r.label} is ${result.toLowerCase()||'not complete'}.`)
 }
 if(profile==='OH_DODD_DIRECT_SERVICES'&&row.rapbackUnavailable===true){const bci=by.get('BCI_CRIMINAL_CHECK'),age=daysSince(bci?.checkedAt),due=bci?addDays(bci.checkedAt,1825):null;if(due&&(!nextRecheck||due<nextRecheck))nextRecheck=due;if(!bci||clean(bci.result,40).toUpperCase()!=='CLEAR'||age==null||age>1825)blockers.push('A current BCI criminal records check is required at least every five years because Rapback enrollment is unavailable.')}
 if(rapbackRequired){
  const rapback=by.get('RAPBACK_ENROLLMENT'),result=clean(rapback?.result,40).toUpperCase();
  if(result!=='ENROLLED'){
   if(['HIT','DISQUALIFYING','UNAVAILABLE','EXPIRED'].includes(result))blockers.push(`Rapback enrollment/maintenance is ${result.toLowerCase()}.`);
   else{
    const bci=by.get('BCI_CRIMINAL_CHECK'),basis=[dateOnly(row.hireDate),dateOnly(bci?.checkedAt)].filter(Boolean).sort().at(-1),due=basis?addDays(basis,14):null,today=dateOnly(new Date());
    if(!due)blockers.push('Rapback enrollment/maintenance is missing.');
    else if(today<=due)warnings.push(`Rapback enrollment is due by ${due}.`);
    else blockers.push(`Rapback enrollment deadline ${due} has passed.`);
   }
  }
 }
 if(row.transportDuties===true){const driving=by.get('BMV_DRIVING_RECORD'),points=Number(obj(driving?.metadata).pointsLast24Months);if(Number.isFinite(points)&&points>=6)blockers.push('Driving record has six or more points in the preceding 24 months; transporting individuals is prohibited.')}
 let conditionalAllowed=false,conditionalDeadline:string|null=null,requestDeadline:string|null=null;
 if(row.conditionalEmployment===true&&row.conditionalStartDate){
  if(profile==='OH_DODD_DIRECT_SERVICES'){
   const request=by.get('BCI_REQUESTED'),fbiRequired=row.ohioResidentFiveYears!==true,fbiRequestSatisfied=!fbiRequired||Boolean(by.get('FBI_REQUESTED')||by.get('FBI_CRIMINAL_CHECK'));
   conditionalDeadline=addDays(row.conditionalStartDate,60);
   const codes=['EMPLOYMENT_APPLICATION','REFERENCE_ATTEMPT','OIG_EXCLUSION','DODD_ABUSER_REGISTRY','OH_NURSE_AIDE_REGISTRY','OH_SEX_OFFENDER','SAM_EXCLUSION','OH_MEDICAID_EXCLUSION','OH_DRC_OFFENDER','DISQUALIFYING_OFFENSE_ATTESTATION','FOURTEEN_DAY_NOTIFICATION_AGREEMENT'];if(row.transportDuties===true)codes.push('VALID_DRIVER_LICENSE','BMV_DRIVING_RECORD');
   const prereqs=codes.every(code=>{const c=by.get(code),r=clean(c?.result,40).toUpperCase();return Boolean(c)&&!['HIT','DISQUALIFYING','UNAVAILABLE','EXPIRED','PENDING'].includes(r)});
   conditionalAllowed=prereqs&&Boolean(request)&&fbiRequestSatisfied&&Boolean(conditionalDeadline)&&dateOnly(new Date())<=conditionalDeadline!;
  } else if(profile==='OH_HOME_HEALTH_DIRECT_CARE'){
   const fingerprint=by.get('FINGERPRINT_FORMS'),codes=['SAM_EXCLUSION','OIG_EXCLUSION','DODD_ABUSER_REGISTRY','OH_SEX_OFFENDER','OH_DRC_OFFENDER','OH_NURSE_AIDE_REGISTRY'],databaseClear=codes.every(code=>clean(by.get(code)?.result,40).toUpperCase()==='CLEAR'),request=by.get('BCI_REQUESTED'),requestDate=dateOnly(request?.checkedAt);
   requestDeadline=businessDaysAfter(row.conditionalStartDate,5);const requestTimely=Boolean(requestDate)&&Boolean(requestDeadline)&&requestDate<=requestDeadline!;conditionalDeadline=requestDate?addDays(requestDate,60):null;conditionalAllowed=databaseClear&&clean(fingerprint?.result,40).toUpperCase()==='COMPLETED'&&requestTimely&&Boolean(conditionalDeadline)&&dateOnly(new Date())<=conditionalDeadline!;if(!requestTimely)warnings.push('Home Health conditional employment requires the criminal-records-check request no later than five business days after conditional employment begins.');
  }
 }
 const finalBlockers=unique(blockers);let status:OhioScreeningReadiness['status']=finalBlockers.length===0?'ELIGIBLE':conditionalAllowed?'CONDITIONAL':'BLOCKED';if(nextRecheck&&nextRecheck<dateOnly(new Date())&&status==='ELIGIBLE')status='EXPIRED';return{caseId:id,employeeId:clean(row.employeeId,160),profileCode:profile,status,workEligible:status==='ELIGIBLE'||status==='CONDITIONAL',blockers:finalBlockers,warnings:unique(warnings),missingChecks:unique(missing),nextRecheckDate:nextRecheck,details:{authority:row.authority,authorityUrl:row.authorityUrl,reviewedOn:row.reviewedOn,conditionalEmployment:row.conditionalEmployment,conditionalStartDate:row.conditionalStartDate,conditionalDeadline,criminalCheckRequestDeadline:requestDeadline,ohioResidentFiveYears:row.ohioResidentFiveYears,rapbackUnavailable:row.rapbackUnavailable,transportDuties:row.transportDuties,evidenceIsManual:true,liveRegistryIntegrationConfigured:false,criminalReportContentStoredHere:false}}
}
