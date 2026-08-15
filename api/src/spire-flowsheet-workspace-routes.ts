import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;ipAddress?:string;userAgent?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext};

const clinical=new Set<UserRole>([
  UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.DSP,
  UserRole.DELEGATING_NURSE,UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,
  UserRole.CEO,UserRole.DOO,
]);
const writers=new Set<UserRole>([
  UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.DSP,UserRole.DELEGATING_NURSE,
  UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO,
]);
const admins=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO]);
const text=(v:unknown,m=4000)=>typeof v==='string'?v.trim().slice(0,m):'';
const entityId=(a:AuthContext)=>{if(!a.legalEntityId)throw Object.assign(new Error('Select a Sulandra company before documenting in SPIRE'),{status:409});return a.legalEntityId;};
const isAdmin=(a:AuthContext)=>admins.has(a.role)||a.enterpriseOwner===true||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const ensure=(a:AuthContext)=>{if(!clinical.has(a.role))throw Object.assign(new Error('SPIRE clinical access is required'),{status:403});};
const ensureWrite=(a:AuthContext)=>{ensure(a);if(!writers.has(a.role))throw Object.assign(new Error('This SPIRE role is read-only'),{status:403});};

async function allowed(prisma:PrismaClient,a:AuthContext,pid:string){
  const entity=entityId(a);
  const enrolled=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(
    `SELECT EXISTS(SELECT 1 FROM "ClientEnrollment" e WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."clientId"=$3 AND e."status" IN ('PENDING','ACTIVE','PAUSED')) AS allowed`,
    a.organizationId,entity,pid,
  );
  if(enrolled[0]?.allowed!==true)return false;
  if(isAdmin(a)||a.role===UserRole.AUDITOR)return true;
  const rows=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(`SELECT EXISTS(
    SELECT 1 FROM "SpireEmployeeClientAssignment" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."userId"=$3 AND x."clientId"=$4
    UNION ALL SELECT 1 FROM "SpirePatientHomeAssignment" p JOIN "SpireEmployeeHomeAssignment" h ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId" WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4 AND (p."endsAt" IS NULL OR p."endsAt">NOW())
    UNION ALL SELECT 1 FROM "UserEntityAccessGrant" g WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."userId"=$3 AND g."scopeType"='CLIENT' AND g."clientId"=$4 AND g."active"=TRUE AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
  ) AS allowed`,a.organizationId,entity,a.userId,pid);
  return rows[0]?.allowed===true;
}

async function requirePatient(prisma:PrismaClient,a:AuthContext,pid:string,write=false){
  write?ensureWrite(a):ensure(a);
  if(!(await allowed(prisma,a,pid)))throw Object.assign(new Error('This chart is outside your authorized clinical scope for the selected company'),{status:403});
}

async function audit(prisma:PrismaClient,a:AuthContext,pid:string,action:string,id:string,after:unknown){
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent") VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'FLOWSHEET_ENTRY',$7,$8::jsonb,$9,$10)`,
    a.organizationId,entityId(a),a.userId,a.email??null,pid,action,id,JSON.stringify(after??{}),a.ipAddress??null,a.userAgent??null,
  );
}

type StandardRow=[string,string,string,string|null,string,string[]];

const dspDailyRows:StandardRow[]=[
  ['Vitals & Blood Glucose','Temp (°F)','NUMBER','°F','Temperature in degrees Fahrenheit.',[]],
  ['Vitals & Blood Glucose','Temp Source','SELECT',null,'Temperature measurement source.',['Oral','Tympanic','Axillary','Temporal','Refused']],
  ['Vitals & Blood Glucose','Pulse (bpm)','NUMBER','bpm','Pulse/heart rate.',[]],
  ['Vitals & Blood Glucose','Resp (breaths/min)','NUMBER','breaths/min','Respiratory rate.',[]],
  ['Vitals & Blood Glucose','BP (mmHg)','TEXT','mmHg','Blood pressure documented as systolic/diastolic.',[]],
  ['Vitals & Blood Glucose','Blood Glucose (mg/dL)','NUMBER','mg/dL','Blood glucose when ordered or required.',[]],

  ['ADLs & Personal Care Support','Bathing / Showering (Bathing Assistance)','SELECT',null,'Bathing/showering support delivered according to the ISP.',['Prompted','Independent','Partial Assist','Total Assist','Refused','Completed']],
  ['ADLs & Personal Care Support','Dressing Assistance','SELECT',null,'Dressing support delivered according to the ISP.',['Independent','Prompting','Partial Assist','Total Assist','Refused','Completed']],
  ['ADLs & Personal Care Support','Grooming & Oral Care','SELECT',null,'Grooming and oral-care support.',['Prompted','Independent','Partial Assist','Total Assist','Refused','Completed']],
  ['ADLs & Personal Care Support','Toileting Support','SELECT',null,'Toileting support delivered according to the ISP.',['Independent','Prompting','Partial Assist','Total Assist','Refused','Completed']],

  ['Medication Administration (eMAR)','Scheduled Meds Administered (AM)','SELECT',null,'Scheduled medication administration summary; detailed medication rights remain in eMAR.',['Given (8:00 AM)','Given (5:00 PM)','Held','Refused','Omitted']],
  ['Medication Administration (eMAR)','Swallow & Prompt Supervision','SELECT',null,'Medication swallowing/prompt supervision.',['Completed','Supervised','Assisted','Refused']],
  ['Medication Administration (eMAR)','PRN Medication Review','SELECT',null,'PRN medication review; medication administration remains linked to eMAR.',['None','Acetaminophen given','Refused']],
  ['Medication Administration (eMAR)','Medication Refusals / Omissions','SELECT',null,'Medication refusal/omission summary.',['None','Refused','Omitted']],

  ['Meal & Dysphagia Precautions','Diet Texture (Soft & Bite-Sized)','SELECT',null,'Verify ordered/ISP diet texture.',['Verified (Soft)','Modified','Refused']],
  ['Meal & Dysphagia Precautions','Liquid Consistency (Thin Liquids)','SELECT',null,'Verify ordered/ISP liquid consistency.',['Verified (Thin)','Modified','Refused']],
  ['Meal & Dysphagia Precautions','Upright Positioning (30 Min Post-Meal)','SELECT',null,'Post-meal positioning support.',['Maintained (30 min)','Not Maintained','Refused']],
  ['Meal & Dysphagia Precautions','Pacing & Small Bites Supervision','SELECT',null,'Meal pacing/small-bite supervision.',['Completed','Supervised','Refused']],

  ['Seizure & Neurological Check','Seizure Observation','SELECT',null,'Seizure observation and response.',['None','Generalized Tonic-Clonic','Focal','Rescue Med Given','Refused']],
  ['Seizure & Neurological Check','Postictal Recovery Status','SELECT',null,'Postictal recovery observation when applicable.',['Baseline','Fatigued','Confused','Resting']],
  ['Seizure & Neurological Check','Rescue Med Preparedness (Midazolam)','SELECT',null,'Rescue-medication readiness based on the active order/plan.',['Ready','Administered','Not Required']],

  ['Behavioral & Elopement Support','Emotional Baseline / Mood','SELECT',null,'Person-centered emotional baseline/mood observation.',['Calm','Anxious','Agitated','Withdrawn','Cooperative']],
  ['Behavioral & Elopement Support','Triggers / Antecedents Observed','SELECT',null,'Observed triggers/antecedents when applicable.',['None','Loud Noise','Routine Change','Rushed']],
  ['Behavioral & Elopement Support','De-escalation / Proactive Support Used','SELECT',null,'Proactive or de-escalation support used.',['Not Needed','Calm Reassurance','Quiet Space Offered','Redirected']],

  ['Bowel & Elimination Protocol','Bowel Movement Recorded','SELECT',null,'Bowel movement occurrence/characteristics.',['Yes (Normal)','Loose','Constipated','None','Refused']],
  ['Bowel & Elimination Protocol','Fluid Intake Encouragement','SELECT',null,'Hydration support/encouragement.',['Encouraged','Offered & Consumed','Refused','Completed']],

  ['Community Outings & Transport','Community Outing / Activity','SELECT',null,'Community participation/activity status.',['Completed','Rescheduled','Refused','N/A']],
  ['Community Outings & Transport','Vehicle Seat Belt Secured','SELECT',null,'Vehicle safety-belt status when transportation occurs.',['Secured','Refused','N/A']],

  ['ISP Goal Skill-Building','Independent Task Prompting','SELECT',null,'Skill-building prompt/support toward an active ISP outcome.',['Completed','Prompted','Assisted','Refused']],
  ['ISP Goal Skill-Building','Money Management Support','SELECT',null,'Money-management skill support when included in the ISP.',['Reviewed','Assisted','Refused','N/A']],
];

const foundationRows:StandardRow[]=[
  ['ISP Outcomes / Progress','ISP Outcome Progress','TEXT',null,'Document measurable progress, supports provided, response and barriers for active ISP outcomes.',[]],
  ['ISP Outcomes / Progress','Important To / Important For','TEXT',null,'Person-centered observations related to what is important to and important for the individual.',[]],
  ['Sleep / Wake','Sleep / Wake Status','SELECT',null,'Scheduled sleep/wake observation with note when awake or out of routine.',['SLEEPING','AWAKE','RESTROOM','SNACK','OUT_OF_BED','OTHER']],
  ['Daily Living','ADL / Personal Care','SELECT',null,'Bathing, grooming, dressing, oral care and other ISP-directed personal supports.',['INDEPENDENT','PROMPTED','ASSISTED','TOTAL_ASSIST','REFUSED','NOT_APPLICABLE']],
  ['Daily Living','Toileting / Continence','SELECT',null,'Toileting support, continence and related observations.',['INDEPENDENT','PROMPTED','ASSISTED','INCONTINENT','REFUSED','NOT_APPLICABLE']],
  ['Daily Living','Meal / Nutrition Support','TEXT',null,'Meal choice, diet adherence, intake and nutrition supports.',[]],
  ['Daily Living','Hydration','NUMBER','mL','Oral or enteral fluid intake as applicable.',[]],
  ['Community / ISP','Community Participation','TEXT',null,'Community activity, choice, participation, response and progress toward ISP outcomes.',[]],
  ['Behavior / Safety','Behavior Support','TEXT',null,'Antecedent, behavior, staff support/intervention and outcome when applicable.',[]],
  ['Behavior / Safety','Health & Safety Check','SELECT',null,'Routine safety observation based on the ISP and individual risk plan.',['NO_CONCERN','CONCERN_IDENTIFIED','INTERVENTION_COMPLETED','ESCALATED']],
  ['Vitals','Temperature','NUMBER','°F','Temperature.',[]],
  ['Vitals','Pulse','NUMBER','bpm','Pulse/heart rate.',[]],
  ['Vitals','Respirations','NUMBER','/min','Respiratory rate.',[]],
  ['Vitals','Blood Pressure Systolic','NUMBER','mmHg','Systolic blood pressure.',[]],
  ['Vitals','Blood Pressure Diastolic','NUMBER','mmHg','Diastolic blood pressure.',[]],
  ['Vitals','SpO₂','NUMBER','%','Oxygen saturation.',[]],
  ['Vitals','Weight','NUMBER','lb','Weight.',[]],
  ['Vitals','Blood Glucose','NUMBER','mg/dL','Blood glucose when ordered/required.',[]],
  ['Intake / Output','Urine Output','NUMBER','mL','Measured urinary output when applicable.',[]],
  ['Intake / Output','Bowel Movement','SELECT',null,'Bowel movement occurrence/characteristics.',['YES','NO','SMALL','MEDIUM','LARGE','LOOSE','FORMED','HARD']],
  ['Clinical Monitoring','Pain','NUMBER','0-10','Pain rating when applicable.',[]],
  ['Clinical Monitoring','Skin / Wound Observation','TEXT',null,'Skin integrity or wound observation; use clinical wound module for detailed treatment documentation.',[]],
  ['Clinical Monitoring','Respiratory Status','TEXT',null,'Respiratory assessment/observation based on individual needs.',[]],
  ['Clinical Monitoring','Seizure / Neurologic Status','TEXT',null,'Seizure or neurologic observation and response.',[]],
  ['Clinical Monitoring','Mobility / Transfer','SELECT',null,'Mobility/transfer level and support.',['INDEPENDENT','SUPERVISION','ONE_PERSON_ASSIST','TWO_PERSON_ASSIST','LIFT','WHEELCHAIR']],
  ['Clinical Monitoring','Position / Repositioning','TEXT',null,'Positioning and pressure-relief documentation when required.',[]],
  ['Clinical Monitoring','Catheter / Tube Check','TEXT',null,'Foley, suprapubic catheter, feeding tube or other device observation when applicable.',[]],
  ['Medication / Treatment','Treatment / PRN Effectiveness','TEXT',null,'Treatment completion or PRN effectiveness observation linked to the care plan/order.',[]],
];

const nurseFlowsheetRows:StandardRow[]=[
  ['Nurse Flowsheets','Skilled Visit Type','SELECT',null,'Identify the home-health or waiver nursing visit context.',['START_OF_CARE','ROUTINE_SKILLED_NURSING','RECERTIFICATION','RESUMPTION_OF_CARE','PRN_VISIT','SUPERVISORY_VISIT','CHANGE_OF_CONDITION']],
  ['Nurse Flowsheets','Visit / Patient Status','SELECT',null,'Overall patient status for this nursing contact.',['STABLE','IMPROVING','DECLINING','ACUTE_CHANGE','TRANSFERRED_TO_HIGHER_LEVEL_OF_CARE']],
  ['Nurse Flowsheets','General Appearance','SELECT',null,'General appearance and observed distress.',['NO_ACUTE_DISTRESS','MILD_DISTRESS','MODERATE_DISTRESS','SEVERE_DISTRESS','FATIGUED','DIAPHORETIC','OTHER']],
  ['Nurse Flowsheets','Level of Consciousness','SELECT',null,'Current level of consciousness.',['ALERT','DROWSY','LETHARGIC','RESPONDS_TO_VOICE','RESPONDS_TO_PAIN','UNRESPONSIVE']],
  ['Nurse Flowsheets','Orientation','SELECT',null,'Orientation and cognitive status.',['ORIENTED_X4','ORIENTED_X3','ORIENTED_X2','ORIENTED_X1','CONFUSED_BASELINE','ACUTE_CONFUSION']],
  ['Nurse Flowsheets','Pain Score','NUMBER','0-10','Patient-reported or observed pain intensity.',[]],
  ['Nurse Flowsheets','Pain Location / Description','TEXT',null,'Pain location, quality, pattern, aggravating/relieving factors and relevant observations.',[]],
  ['Nurse Flowsheets','Respiratory Effort','SELECT',null,'Observed work of breathing.',['UNLABORED','MILDLY_LABORED','LABORED','ACCESSORY_MUSCLE_USE','RESPIRATORY_DISTRESS']],
  ['Nurse Flowsheets','Lung Sounds / Respiratory Assessment','TEXT',null,'Breath sounds, cough, sputum, dyspnea and other respiratory findings as applicable.',[]],
  ['Nurse Flowsheets','Oxygen Therapy','SELECT',null,'Current oxygen use and delivery status.',['ROOM_AIR','NASAL_CANNULA','MASK','TRACH_COLLAR','OTHER_DEVICE','NOT_APPLICABLE']],
  ['Nurse Flowsheets','Oxygen Flow Rate','NUMBER','L/min','Ordered oxygen flow rate when oxygen is in use.',[]],
  ['Nurse Flowsheets','Cardiac / Circulatory Assessment','TEXT',null,'Heart/circulatory findings including rhythm observations, perfusion, pulses and symptoms as applicable.',[]],
  ['Nurse Flowsheets','Edema','SELECT',null,'Peripheral edema assessment.',['NONE','TRACE','1_PLUS','2_PLUS','3_PLUS','4_PLUS']],
  ['Nurse Flowsheets','Capillary Refill','SELECT',null,'Peripheral perfusion screening.',['LESS_THAN_2_SECONDS','2_TO_3_SECONDS','GREATER_THAN_3_SECONDS','NOT_ASSESSED']],
  ['Nurse Flowsheets','GI / Abdominal Assessment','TEXT',null,'Abdominal assessment, nausea/vomiting, bowel sounds, ostomy and other gastrointestinal findings.',[]],
  ['Nurse Flowsheets','Bowel Status','SELECT',null,'Bowel pattern compared with baseline.',['BASELINE','CONSTIPATION','DIARRHEA','INCONTINENCE','NO_BM_CONCERN','OSTOMY','OTHER']],
  ['Nurse Flowsheets','GU / Urinary Assessment','TEXT',null,'Urinary pattern, continence, dysuria, urine characteristics and other genitourinary findings.',[]],
  ['Nurse Flowsheets','Skin Integrity','SELECT',null,'Overall skin integrity assessment.',['INTACT','AT_RISK','REDNESS','OPEN_AREA','WOUND_PRESENT','PRESSURE_INJURY','OTHER']],
  ['Nurse Flowsheets','Wound / Incision Observation','TEXT',null,'Brief wound or incision observation; use the dedicated wound-care module for measurements, staging and treatment details.',[]],
  ['Nurse Flowsheets','Nutrition / Appetite','SELECT',null,'Nutrition and appetite status compared with baseline.',['GOOD','FAIR','POOR','NPO','ENTERAL_FEEDING','CHANGE_FROM_BASELINE']],
  ['Nurse Flowsheets','Hydration Status','SELECT',null,'Hydration assessment.',['ADEQUATE','AT_RISK','DEHYDRATION_CONCERN','FLUID_RESTRICTION','OTHER']],
  ['Nurse Flowsheets','Blood Glucose','NUMBER','mg/dL','Point-of-care or patient-reported blood glucose when ordered or clinically indicated.',[]],
  ['Nurse Flowsheets','Diabetes / Insulin Monitoring','TEXT',null,'Diabetes management observations, insulin teaching, symptoms and follow-up needs.',[]],
  ['Nurse Flowsheets','Medication Reconciliation','SELECT',null,'Medication reconciliation status for the visit.',['COMPLETED_NO_DISCREPANCY','COMPLETED_DISCREPANCY_FOUND','PARTIAL','NOT_COMPLETED','NOT_APPLICABLE']],
  ['Nurse Flowsheets','Medication Changes / Concerns','TEXT',null,'New, changed, discontinued or concerning medications and actions taken.',[]],
  ['Nurse Flowsheets','Medication Teaching / Adherence','TEXT',null,'Medication education, adherence assessment, patient/caregiver understanding and barriers.',[]],
  ['Nurse Flowsheets','Foley / Urinary Catheter Status','TEXT',null,'Catheter type, patency, drainage, site observation and nursing care when applicable.',[]],
  ['Nurse Flowsheets','Feeding Tube / Enteral Status','TEXT',null,'Tube site, patency, feeding tolerance, flushes and relevant nursing observations when applicable.',[]],
  ['Nurse Flowsheets','IV / PICC / Infusion Status','TEXT',null,'Vascular access site, patency, infusion status, dressing and complications when applicable.',[]],
  ['Nurse Flowsheets','Mobility / Fall Risk','SELECT',null,'Current mobility and fall-risk status.',['INDEPENDENT_LOW_RISK','ASSISTIVE_DEVICE','SUPERVISION_REQUIRED','ONE_PERSON_ASSIST','TWO_PERSON_ASSIST','HIGH_FALL_RISK','BEDBOUND']],
  ['Nurse Flowsheets','Safety / Home Environment','TEXT',null,'Clinically relevant home-safety, equipment, infection-control or caregiver concerns and interventions.',[]],
  ['Nurse Flowsheets','Skilled Nursing Intervention','TEXT',null,'Skilled assessment, treatment, procedure, monitoring or intervention performed during the visit.',[]],
  ['Nurse Flowsheets','Patient / Caregiver Education','TEXT',null,'Teaching provided, method used, teach-back/return demonstration and educational needs.',[]],
  ['Nurse Flowsheets','Response to Intervention','TEXT',null,'Patient response, tolerance, effectiveness and reassessment following nursing intervention.',[]],
  ['Nurse Flowsheets','Provider / Physician Notification','TEXT',null,'Provider notification, reason, time, response and follow-up instructions when applicable.',[]],
  ['Nurse Flowsheets','New / Changed Orders','TEXT',null,'New or changed orders received or identified during the visit and required follow-up.',[]],
  ['Nurse Flowsheets','Change of Condition / Escalation','SELECT',null,'Escalation status for clinically meaningful changes.',['NO_CHANGE','MONITOR_AND_FOLLOW_UP','PROVIDER_NOTIFIED','URGENT_VISIT_RECOMMENDED','EMS_911_ACTIVATED','ED_HOSPITAL_TRANSFER']],
  ['Nurse Flowsheets','Care Plan / Goal Progress','TEXT',null,'Progress toward active nursing goals, barriers and care-plan updates needed.',[]],
  ['Nurse Flowsheets','Next Visit Focus','TEXT',null,'Priority assessment, treatment, teaching or follow-up planned for the next nursing visit.',[]],
  ['Nurse Flowsheets','RN / LPN Narrative','TEXT',null,'Concise skilled nursing narrative supporting the clinical picture, interventions, response and coordination of care.',[]],
];

const standardRows:StandardRow[]=[...dspDailyRows,...foundationRows,...nurseFlowsheetRows];
const rowKey=(group:string,name:string)=>`${group}\u0000${name}`;

async function ensureRows(prisma:PrismaClient,a:AuthContext){
  const existing=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
    `SELECT * FROM "SpireFlowsheetRow" WHERE "organizationId"=$1 AND "active"=TRUE ORDER BY "groupName","sortOrder","name"`,
    a.organizationId,
  );
  const byKey=new Map<string,Record<string,unknown>>();
  for(const row of existing){
    byKey.set(rowKey(String(row.groupName??''),String(row.name??'')),row);
  }

  const ensured:Record<string,unknown>[]=[];
  let sort=100;
  for(const [group,name,dataType,unit,description,options] of standardRows){
    const key=rowKey(group,name);
    let row=byKey.get(key);
    if(!row){
      const inserted=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
        `INSERT INTO "SpireFlowsheetRow"("id","organizationId","name","groupName","dataType","unit","active","description","options","sortOrder","createdAt","updatedAt") VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,TRUE,$6,$7::jsonb,$8,NOW(),NOW()) RETURNING *`,
        a.organizationId,name,group,dataType,unit,description,JSON.stringify(options.filter(Boolean)),sort,
      );
      row=inserted[0];
      if(!row)throw Object.assign(new Error(`SPIRE could not create required flowsheet row: ${name}`),{status:500});
      byKey.set(key,row);
    }
    ensured.push(row);
    sort++;
  }

  const merged=new Map<string,Record<string,unknown>>();
  for(const row of existing)merged.set(String(row.id),row);
  for(const row of ensured)merged.set(String(row.id),row);
  return [...merged.values()].sort((left,right)=>{
    const groupCompare=String(left.groupName??'').localeCompare(String(right.groupName??''));
    if(groupCompare!==0)return groupCompare;
    const sortCompare=Number(left.sortOrder??0)-Number(right.sortOrder??0);
    if(sortCompare!==0)return sortCompare;
    return String(left.name??'').localeCompare(String(right.name??''));
  });
}

function configuredDspRowCount(rows:Array<Record<string,unknown>>){
  const keys=new Set(rows.map((row)=>rowKey(String(row.groupName??''),String(row.name??''))));
  return dspDailyRows.filter(([group,name])=>keys.has(rowKey(group,name))).length;
}

function dateValue(value:unknown){
  const raw=text(value,80);
  if(!raw)return new Date();
  const d=new Date(raw);
  if(Number.isNaN(d.getTime()))throw Object.assign(new Error('A valid flowsheet time is required'),{status:400});
  return d;
}

function badRequest(message:string){
  return Object.assign(new Error(message),{status:400});
}

function rowOptions(row:Record<string,unknown>){
  const raw=row.options;
  if(Array.isArray(raw))return raw.map((option)=>String(option).trim()).filter(Boolean);
  if(typeof raw==='string'){
    try{
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed))return parsed.map((option)=>String(option).trim()).filter(Boolean);
    }catch{
      return [];
    }
  }
  return [];
}

function validateEntryValues(row:Record<string,unknown>,rawNumeric:unknown,rawValue:unknown,rawComment:unknown){
  const rowName=String(row.name??'Flowsheet row');
  const dataType=String(row.dataType??'TEXT').trim().toUpperCase();
  const comment=text(rawComment,4000)||null;
  let numeric:number|null=null;
  let value:string|null=null;

  if(dataType==='NUMBER'){
    if(rawValue!==undefined&&rawValue!==null&&text(rawValue,4000)){
      throw badRequest(`${rowName} accepts numeric values only.`);
    }
    if(rawNumeric!==undefined&&rawNumeric!==null&&rawNumeric!==''){
      numeric=Number(rawNumeric);
      if(!Number.isFinite(numeric))throw badRequest(`${rowName} requires a valid numeric value.`);
    }
  }else{
    if(rawNumeric!==undefined&&rawNumeric!==null&&rawNumeric!==''){
      throw badRequest(`${rowName} does not accept a numeric-only value.`);
    }
    value=text(rawValue,4000)||null;

    if(dataType==='SELECT'&&value){
      const options=rowOptions(row);
      if(options.length&&!options.includes(value)){
        throw badRequest(`Choose an allowed value for ${rowName}: ${options.join(', ')}.`);
      }
    }

    if(rowName==='BP (mmHg)'&&value){
      const match=value.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
      if(!match)throw badRequest('Blood pressure must be entered as systolic/diastolic, for example 120/80.');
      const systolic=Number(match[1]);
      const diastolic=Number(match[2]);
      if(systolic<=diastolic)throw badRequest('Blood pressure systolic value must be greater than diastolic value.');
      value=`${systolic}/${diastolic}`;
    }
  }

  if(numeric==null&&!value&&!comment)throw badRequest('Enter a value or comment before saving.');
  return{numeric,value,comment};
}

export const registerSpireFlowsheetWorkspaceRoutes=(app:express.Express,prisma:PrismaClient,deps:Deps)=>{
  const{authOf}=deps;

  app.get('/api/spire/patients/:patientId/flowsheet-workspace',async(req,res,next)=>{try{
    const a=authOf(res),pid=req.params.patientId;
    await requirePatient(prisma,a,pid);
    const rows=await ensureRows(prisma,a);
    const configuredRows=configuredDspRowCount(rows);
    if(configuredRows!==dspDailyRows.length){
      throw Object.assign(new Error(`SPIRE flowsheet server bootstrap incomplete (${configuredRows}/${dspDailyRows.length} DSP rows ready)`),{status:500});
    }
    const entity=entityId(a);
    const from=text(req.query.from,80)||new Date(Date.now()-24*60*60*1000).toISOString();
    const to=text(req.query.to,80)||new Date(Date.now()+60*60*1000).toISOString();
    const [patient,entries,goals]=await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpirePatient" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,a.organizationId,pid),
      prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT e.*,r."name" AS "rowName",r."groupName",r."dataType",r."unit",CASE WHEN e."recordedById"=$1 THEN TRUE ELSE FALSE END AS "canEdit" FROM "SpireFlowsheetEntry" e JOIN "SpireFlowsheetRow" r ON r."id"=e."rowId" AND r."organizationId"=e."organizationId" WHERE e."organizationId"=$2 AND e."patientId"=$3 AND e."recordedAt">=$4::timestamptz AND e."recordedAt"<=$5::timestamptz ORDER BY e."recordedAt",r."groupName",r."sortOrder",r."name"`,a.userId,a.organizationId,pid,from,to),
      prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","title","frequency","desiredOutcome","progressPercent" FROM "SpireCarePlanGoal" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "status"='ACTIVE' ORDER BY "createdAt","title"`,a.organizationId,entity,pid),
    ]);
    if(!patient[0])throw Object.assign(new Error('Patient was not found'),{status:404});
    res.json({data:{patient:patient[0],rows,entries,goals,templateVersion:'20260815-nurse-flowsheet-grid-1',serverRowCount:rows.length,dspDailyRowCount:configuredRows,viewer:{userId:a.userId,role:a.role,canWrite:writers.has(a.role),admin:isAdmin(a)},from,to}});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/flowsheet-workspace/entries',async(req,res,next)=>{try{
    const a=authOf(res),pid=req.params.patientId;
    await requirePatient(prisma,a,pid,true);
    await ensureRows(prisma,a);
    const rowId=text(req.body?.rowId,120);
    if(!rowId)throw Object.assign(new Error('Flowsheet row is required'),{status:400});
    const row=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireFlowsheetRow" WHERE "organizationId"=$1 AND "id"=$2 AND "active"=TRUE LIMIT 1`,a.organizationId,rowId);
    if(!row[0])throw Object.assign(new Error('Flowsheet row was not found'),{status:404});
    const recordedAt=dateValue(req.body?.recordedAt);
    const{numeric,value,comment}=validateEntryValues(row[0],req.body?.numericValue,req.body?.value,req.body?.comment);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
      `INSERT INTO "SpireFlowsheetEntry"("organizationId","legalEntityId","patientId","rowId","value","numericValue","recordedAt","recordedById","comment","source") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SPIRE_FLOWSHEET') RETURNING *`,
      a.organizationId,entityId(a),pid,rowId,value,numeric,recordedAt,a.userId,comment,
    );
    await audit(prisma,a,pid,'FLOWSHEET_ENTRY_CREATED',String(rows[0].id),rows[0]);
    res.status(201).json({data:{...rows[0],canEdit:true,rowName:row[0].name,groupName:row[0].groupName,dataType:row[0].dataType,unit:row[0].unit}});
  }catch(e){next(e);}});

  app.put('/api/spire/patients/:patientId/flowsheet-workspace/entries/:entryId',async(req,res,next)=>{try{
    const a=authOf(res),pid=req.params.patientId;
    await requirePatient(prisma,a,pid,true);
    const entity=entityId(a);
    const original=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT e.*,r."name" AS "rowName",r."groupName",r."dataType",r."unit",r."options" FROM "SpireFlowsheetEntry" e JOIN "SpireFlowsheetRow" r ON r."id"=e."rowId" AND r."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND e."patientId"=$2 AND e."id"=$3 LIMIT 1`,a.organizationId,pid,req.params.entryId);
    if(!original[0])throw Object.assign(new Error('Flowsheet entry was not found'),{status:404});
    if(String(original[0].recordedById||'')!==a.userId)throw Object.assign(new Error('Only the user who documented this flowsheet entry can edit it'),{status:403});
    const recordedAt=req.body?.recordedAt?dateValue(req.body.recordedAt):original[0].recordedAt;
    const rawNumeric=req.body?.numericValue===undefined?original[0].numericValue:req.body.numericValue;
    const rawValue=req.body?.value===undefined?original[0].value:req.body.value;
    const rawComment=req.body?.comment===undefined?original[0].comment:req.body.comment;
    const rowForValidation:Record<string,unknown>={name:original[0].rowName,dataType:original[0].dataType,unit:original[0].unit,options:original[0].options};
    const{numeric,value,comment}=validateEntryValues(rowForValidation,rawNumeric,rawValue,rawComment);
    const updated=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
      `UPDATE "SpireFlowsheetEntry" SET "value"=$1,"numericValue"=$2,"recordedAt"=$3,"comment"=$4,"updatedAt"=NOW() WHERE "organizationId"=$5 AND "patientId"=$6 AND "id"=$7 AND "recordedById"=$8 RETURNING *`,
      value,numeric,recordedAt,comment,a.organizationId,pid,req.params.entryId,a.userId,
    );
    if(!updated[0])throw Object.assign(new Error('This entry can no longer be edited'),{status:409});
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","beforeValue","afterValue","ipAddress","userAgent") VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,'FLOWSHEET_ENTRY_EDITED','FLOWSHEET_ENTRY',$6,$7::jsonb,$8::jsonb,$9,$10)`,
      a.organizationId,entity,a.userId,a.email??null,pid,req.params.entryId,JSON.stringify(original[0]),JSON.stringify(updated[0]),a.ipAddress??null,a.userAgent??null,
    );
    res.json({data:{...updated[0],canEdit:true,rowName:original[0].rowName,groupName:original[0].groupName,dataType:original[0].dataType,unit:original[0].unit}});
  }catch(e){next(e);}});
};