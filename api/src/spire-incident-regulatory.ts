import type { PrismaClient } from '@prisma/client';

export type RegulatoryClassification='PENDING'|'UI'|'MUI'|'NON_REPORTABLE';
export type MuiCategory='A'|'B'|'C';
export const MUI_TYPES_BY_CATEGORY:Record<MuiCategory,string[]>={
 A:['EMOTIONAL_ABUSE','EXPLOITATION','FAILURE_TO_REPORT','MISAPPROPRIATION','NEGLECT','PHYSICAL_ABUSE','PROHIBITED_SEXUAL_RELATIONS','RIGHTS_CODE_VIOLATION','SEXUAL_ABUSE','UNEXPLAINED_OR_UNANTICIPATED_DEATH'],
 B:['ATTEMPTED_SUICIDE','DEATH_OTHER_THAN_UNEXPLAINED_OR_UNANTICIPATED','MEDICAL_EMERGENCY','MISSING_INDIVIDUAL','PEER_TO_PEER_ACT','SIGNIFICANT_INJURY'],
 C:['LAW_ENFORCEMENT','UNANTICIPATED_HOSPITALIZATION','UNAPPROVED_BEHAVIORAL_SUPPORT'],
};
export const FOUR_HOUR_MUI_TYPES=new Set(['EMOTIONAL_ABUSE','EXPLOITATION','MISAPPROPRIATION','NEGLECT','PEER_TO_PEER_ACT','PHYSICAL_ABUSE','PROHIBITED_SEXUAL_RELATIONS','SEXUAL_ABUSE','UNEXPLAINED_OR_UNANTICIPATED_DEATH']);
const TZ='America/New_York',DAY=86_400_000;
const clean=(v:unknown,max=5000)=>String(v??'').trim().slice(0,max);
const dateKey=(y:number,m:number,d:number)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const zonedParts=(date:Date,timeZone=TZ)=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value||0);return{year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')}};
const zonedDate=(year:number,month:number,day:number,hour:number,minute=0,second=0,timeZone=TZ)=>{let ms=Date.UTC(year,month-1,day,hour,minute,second);for(let i=0;i<3;i++){const p=zonedParts(new Date(ms),timeZone),seen=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),wanted=Date.UTC(year,month-1,day,hour,minute,second);ms+=wanted-seen;}return new Date(ms)};
const nthWeekday=(year:number,month:number,weekday:number,n:number)=>{const first=new Date(Date.UTC(year,month-1,1)),delta=(weekday-first.getUTCDay()+7)%7;return 1+delta+(n-1)*7};
const lastWeekday=(year:number,month:number,weekday:number)=>{const last=new Date(Date.UTC(year,month,0)),delta=(last.getUTCDay()-weekday+7)%7;return last.getUTCDate()-delta};
export const ohioRecurringLegalHoliday=(year:number,month:number,day:number)=>{
 const key=dateKey(year,month,day),fixed=[dateKey(year,1,1),dateKey(year,6,19),dateKey(year,7,4),dateKey(year,11,11),dateKey(year,12,25)],moving=[dateKey(year,1,nthWeekday(year,1,1,3)),dateKey(year,2,nthWeekday(year,2,1,3)),dateKey(year,5,lastWeekday(year,5,1)),dateKey(year,9,nthWeekday(year,9,1,1)),dateKey(year,10,nthWeekday(year,10,1,2)),dateKey(year,11,nthWeekday(year,11,4,4))];
 if(fixed.includes(key)||moving.includes(key))return true;
 for(const item of fixed){const d=new Date(`${item}T12:00:00Z`);if(d.getUTCDay()===0){d.setUTCDate(d.getUTCDate()+1);if(dateKey(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate())===key)return true;}}
 return false;
};
export async function isOhioWorkingDay(prisma:PrismaClient,organizationId:string,legalEntityId:string,year:number,month:number,day:number){const d=new Date(Date.UTC(year,month-1,day)),weekday=d.getUTCDay();if(weekday===0||weekday===6||ohioRecurringLegalHoliday(year,month,day))return false;const key=dateKey(year,month,day),rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "SpireIncidentWorkingDayException" WHERE "organizationId"=$1 AND ("legalEntityId" IS NULL OR "legalEntityId"=$2) AND "exceptionDate"=$3::date LIMIT 1`,organizationId,legalEntityId,key).catch(()=>[]);return !rows[0];}
export async function firstWorkingDay3pm(prisma:PrismaClient,organizationId:string,legalEntityId:string,after:Date){const p=zonedParts(after);let cursor=new Date(Date.UTC(p.year,p.month-1,p.day)+DAY);for(let i=0;i<20;i++){const y=cursor.getUTCFullYear(),m=cursor.getUTCMonth()+1,d=cursor.getUTCDate();if(await isOhioWorkingDay(prisma,organizationId,legalEntityId,y,m,d))return zonedDate(y,m,d,15,0,0);cursor=new Date(cursor.getTime()+DAY);}throw new Error('Unable to resolve Ohio working-day incident deadline');}
const endOfLocalDay=(date:Date)=>{const p=zonedParts(date);return zonedDate(p.year,p.month,p.day,23,59,59)};
export const categoryForMuiType=(muiType:string):MuiCategory|null=>{for(const category of ['A','B','C'] as MuiCategory[])if(MUI_TYPES_BY_CATEGORY[category].includes(muiType))return category;return null};
export type DeadlineSpec={deadlineType:string;required:boolean;dueAt:Date|null;notes:string};
export async function regulatoryDeadlineSpecs(prisma:PrismaClient,organizationId:string,legalEntityId:string,input:{classification:RegulatoryClassification;muiCategory:MuiCategory|null;muiType:string|null;occurredAt:Date;discoveredAt:Date;providerAwareAt:Date}){
 const specs:DeadlineSpec[]=[];
 if(input.classification==='UI')specs.push({deadlineType:'UI_EMPLOYEE_REPORT_24_HOUR',required:true,dueAt:new Date(input.occurredAt.getTime()+24*60*60*1000),notes:'Employee UI report due no later than 24 hours following occurrence.'});
 if(input.classification==='MUI'){
  if(input.muiType&&FOUR_HOUR_MUI_TYPES.has(input.muiType))specs.push({deadlineType:'MUI_FOUR_HOUR_COUNTY_BOARD',required:true,dueAt:new Date(input.discoveredAt.getTime()+4*60*60*1000),notes:'County-board notice due as soon as possible and no later than four hours after discovery.'});
  specs.push({deadlineType:'MUI_INCIDENT_REPORT_FIRST_WORKDAY_3PM',required:true,dueAt:await firstWorkingDay3pm(prisma,organizationId,legalEntityId,input.providerAwareAt),notes:'Incident report due by 3 p.m. on the first Ohio working day following provider awareness.'});
  specs.push({deadlineType:'MUI_SAME_DAY_NOTIFICATION',required:true,dueAt:endOfLocalDay(input.discoveredAt),notes:'Applicable guardian/SSA/provider/residence notifications due the same day, subject to rule exceptions.'});
  if(input.muiCategory==='C')specs.push({deadlineType:'MUI_CATEGORY_C_ADMIN_REVIEW_FORM',required:true,dueAt:await firstWorkingDay3pm(prisma,organizationId,legalEntityId,input.providerAwareAt),notes:'Category C administrative review form is due with the incident report.'});
 }
 return specs;
}
export async function currentRegulatoryProfile(prisma:PrismaClient,at:Date){const date=at.toISOString().slice(0,10),rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireIncidentRegulatoryProfileVersion" WHERE "profileCode"='OH_DODD_MUI_UI' AND "effectiveFrom"<=$1::date AND ("effectiveTo" IS NULL OR "effectiveTo">=$1::date) ORDER BY "effectiveFrom" DESC,"version" DESC LIMIT 1`,date);if(!rows[0])throw Object.assign(new Error(`No Ohio incident regulatory profile is configured for ${date}`),{status:409});return rows[0]}
export async function syncRegulatoryDeadlines(prisma:PrismaClient,input:{organizationId:string;legalEntityId:string;patientId:string;incidentId:string;regulatoryCaseId:string;classification:RegulatoryClassification;muiCategory:MuiCategory|null;muiType:string|null;occurredAt:Date;discoveredAt:Date;providerAwareAt:Date}){
 const specs=await regulatoryDeadlineSpecs(prisma,input.organizationId,input.legalEntityId,input),required=new Set(specs.map(s=>s.deadlineType));
 for(const spec of specs)await prisma.$executeRawUnsafe(`INSERT INTO "SpireIncidentRegulatoryDeadline"("organizationId","legalEntityId","patientId","incidentId","regulatoryCaseId","deadlineType","required","dueAt","status","notes") VALUES($1,$2,$3,$4,$5,$6,true,$7,'PENDING',$8) ON CONFLICT("organizationId","legalEntityId","regulatoryCaseId","deadlineType") DO UPDATE SET "required"=true,"dueAt"=EXCLUDED."dueAt","status"=CASE WHEN "SpireIncidentRegulatoryDeadline"."status"='SATISFIED' THEN 'SATISFIED' WHEN EXCLUDED."dueAt"<NOW() THEN 'OVERDUE' ELSE 'PENDING' END,"notes"=EXCLUDED."notes","updatedAt"=NOW()`,input.organizationId,input.legalEntityId,input.patientId,input.incidentId,input.regulatoryCaseId,spec.deadlineType,spec.dueAt,spec.notes);
 await prisma.$executeRawUnsafe(`UPDATE "SpireIncidentRegulatoryDeadline" SET "required"=false,"status"=CASE WHEN "status"='SATISFIED' THEN 'SATISFIED' ELSE 'NOT_APPLICABLE' END,"updatedAt"=NOW() WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "regulatoryCaseId"=$3 AND NOT ("deadlineType"=ANY($4::text[]))`,input.organizationId,input.legalEntityId,input.regulatoryCaseId,[...required]).catch(()=>undefined);
 await prisma.$executeRawUnsafe(`UPDATE "SpireIncidentRegulatoryDeadline" SET "status"='OVERDUE',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "regulatoryCaseId"=$3 AND "required"=true AND "status"='PENDING' AND "dueAt" IS NOT NULL AND "dueAt"<NOW()`,input.organizationId,input.legalEntityId,input.regulatoryCaseId);
 return prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireIncidentRegulatoryDeadline" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "regulatoryCaseId"=$3 ORDER BY "dueAt" NULLS LAST,"deadlineType"`,input.organizationId,input.legalEntityId,input.regulatoryCaseId);
}
export const incidentRegulatoryBoundary={timezone:TZ,authority:'Ohio Administrative Code 5123-17-02',authorityUrl:'https://codes.ohio.gov/ohio-administrative-code/rule-5123-17-02',liveOitmsIntegrationConfigured:false,submissionMode:'MANUAL_OITMS_OR_COUNTY_BOARD'} as const;
export const asText=clean;
