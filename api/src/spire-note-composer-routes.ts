import type express from 'express';
import type { PrismaClient } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
  ipAddress?: string;
  userAgent?: string;
};
type Deps = { authOf: (response: express.Response) => AuthContext };

type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  version: string;
  body: string;
};
type NoteType = {
  code: string;
  label: string;
  category: string;
  roles: string[];
  templates: NoteTemplate[];
};

const clinicalRoles = new Set([
  'ADMINISTRATOR','PROGRAM_MANAGER','AUDITOR','DSP','DELEGATING_NURSE','LPN','RN','HOUSE_MANAGER','CEO','COO','DOO',
]);
const writeRoles = new Set([
  'ADMINISTRATOR','PROGRAM_MANAGER','DSP','DELEGATING_NURSE','LPN','RN','HOUSE_MANAGER','CEO','COO','DOO',
]);
const adminRoles = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','CEO','COO','DOO']);
const nurseRoles = new Set(['RN','LPN','DELEGATING_NURSE']);
const dspRoles = new Set(['DSP','HOUSE_MANAGER']);
const text = (value: unknown, max = 100000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const bool = (value: unknown) => value === true;
const count = (value: unknown, max = 1000000) => Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));
const owner = (auth: AuthContext) => auth.enterpriseOwner === true || text(auth.email, 300).toLowerCase() === 'admin@sulandrahealth.com';
const isAdmin = (auth: AuthContext) => owner(auth) || adminRoles.has(String(auth.role || ''));
const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(String(auth.role || '')) && !owner(auth)) throw Object.assign(new Error('SPIRE clinical access is required'), { status: 403 });
};
const ensureWrite = (auth: AuthContext) => {
  ensureClinical(auth);
  if (!writeRoles.has(String(auth.role || '')) && !owner(auth)) throw Object.assign(new Error('This SPIRE role is read-only'), { status: 403 });
};
const selectedEntity = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw Object.assign(new Error('Select a Sulandra company before using SPIRE'), { status: 409 });
  return auth.legalEntityId;
};
const template = (id: string, name: string, description: string, body: string): NoteTemplate => ({ id, name, description, version: '2026.08.15', body });

const NOTE_TYPES: NoteType[] = [
  { code:'PROGRESS_NOTE', label:'Progress Note', category:'General Clinical', roles:['ALL'], templates:[
    template('progress-standard','Standard Progress Note','General observation, intervention, response and follow-up.','Focus / Reason for Note: [Enter focus]\n\nObservation / Assessment: [Enter objective findings]\n\nInterventions / Supports Provided: [Enter actions]\n\nResponse / Outcome: [Enter response]\n\nCommunication / Coordination: [Enter communication]\n\nPlan / Follow-up: [Enter plan]'),
    template('progress-focused-problem','Focused Problem Note','Focused documentation for one problem or concern.','Problem / Concern: [Enter problem]\n\nOnset / Context: [Enter context]\n\nRelevant Findings: [Enter findings]\n\nAction Taken: [Enter action]\n\nResponse: [Enter response]\n\nEscalation / Notification: [Enter if applicable]\n\nFollow-up: [Enter follow-up]'),
    template('progress-care-coordination','Care Coordination Note','Care-team coordination and closed-loop follow-up.','Reason for Coordination: [Enter reason]\n\nPerson(s) Contacted / Method: [Enter details]\n\nInformation Reviewed or Shared: [Enter details]\n\nDecision / Action: [Enter decision]\n\nPatient / Client Impact: [Enter impact]\n\nOutstanding Items: [Enter outstanding items]\n\nFollow-up Owner / Due: [Enter owner and timing]'),
    template('progress-status-update','Status Update','Concise status update when no focused intervention is required.','Current Status: [Enter status]\n\nChange From Prior Status: [Enter change or no change]\n\nServices / Supports Today: [Enter services]\n\nResponse / Participation: [Enter response]\n\nConcerns / Exceptions: [Enter concerns or none]\n\nNext Steps: [Enter next steps]'),
  ]},
  { code:'NURSING_PROGRESS_NOTE', label:'Nursing Progress Note', category:'Nursing', roles:['RN','LPN','DELEGATING_NURSE'], templates:[
    template('nursing-standard','Comprehensive Nursing Progress','Focused systems assessment, interventions, response and plan.','Reason / Focus: [Enter reason]\n\nAssessment / Clinical Observations: [Enter findings]\n\nVital Signs / Relevant Measurements: [Enter values or reference flowsheet]\n\nSkilled Nursing Interventions: [Enter interventions]\n\nMedication / Treatment Review: [Enter findings]\n\nPatient Response / Outcome: [Enter response]\n\nEducation / Care Coordination: [Enter education and communication]\n\nPlan / Follow-up: [Enter plan]'),
    template('nursing-change-condition','Change of Condition','Structured change-from-baseline documentation.','Change From Baseline / Time Identified: [Enter change and time]\n\nFocused Assessment: [Enter assessment]\n\nVital Signs / Measurements: [Enter values]\n\nSymptoms / Clinical Findings: [Enter findings]\n\nImmediate Nursing Actions: [Enter actions]\n\nProvider / Guardian / Team Notification: [Enter who, when, method]\n\nOrders / Instructions Received: [Enter orders or none]\n\nResponse / Disposition: [Enter response]\n\nMonitoring / Follow-up Plan: [Enter plan]'),
    template('nursing-symptom-followup','Symptom Follow-up','Reassessment after a reported symptom or intervention.','Symptom / Concern: [Enter symptom]\n\nPrior Intervention / Order: [Enter prior action]\n\nReassessment Findings: [Enter findings]\n\nPain / Distress / Functional Impact: [Enter impact]\n\nResponse to Intervention: [Enter response]\n\nAdditional Action / Notification: [Enter action]\n\nPlan: [Enter plan]'),
    template('nursing-education','Patient / Caregiver Education','Teaching, understanding and reinforcement.','Education Topic: [Enter topic]\n\nReason / Learning Need: [Enter need]\n\nTeaching Method / Materials: [Enter method]\n\nKey Information Reviewed: [Enter content]\n\nTeach-back / Return Demonstration: [Enter result]\n\nBarriers / Accommodations: [Enter barriers]\n\nFollow-up Teaching Needed: [Enter plan]'),
    template('nursing-safety-review','Nursing Safety Review','Clinical safety, risk and precaution review.','Safety Risk / Precaution Reviewed: [Enter risk]\n\nCurrent Status / Findings: [Enter findings]\n\nOrders / Protocols Verified: [Enter verification]\n\nInterventions / Precautions Reinforced: [Enter interventions]\n\nStaff / Patient Education: [Enter education]\n\nEscalation / Notification: [Enter if applicable]\n\nFollow-up: [Enter plan]'),
  ]},
  { code:'SKILLED_NURSING_VISIT', label:'Skilled Nursing Visit', category:'Home Health Nursing', roles:['RN','LPN','DELEGATING_NURSE'], templates:[
    template('sn-routine','Routine Skilled Nursing Visit','Routine home-health skilled visit narrative.','Visit Purpose / Skilled Need: [Enter skilled need]\n\nHomebound / Functional Status as Applicable: [Enter status]\n\nFocused Systems Assessment: [Enter findings]\n\nMedication Review / Reconciliation: [Enter findings]\n\nSkilled Interventions / Treatments: [Enter services]\n\nPatient / Caregiver Education and Understanding: [Enter education]\n\nResponse to Care / Progress Toward Goals: [Enter response]\n\nCare Coordination / Provider Communication: [Enter communication]\n\nNext Visit / Plan: [Enter plan]'),
    template('sn-start-care','Start-of-Care Nursing Narrative','Initial skilled nursing narrative complementing structured SOC documentation.','Referral / Reason for Admission: [Enter reason]\n\nPertinent History / Recent Transition: [Enter history]\n\nInitial Clinical Assessment: [Enter findings]\n\nMedication Reconciliation / Discrepancies: [Enter findings]\n\nSkilled Needs Identified: [Enter needs]\n\nSafety / Home Environment Concerns: [Enter concerns]\n\nEducation / Emergency Planning: [Enter education]\n\nCare Coordination / Provider Notifications: [Enter communication]\n\nPlan of Care Priorities / Next Visit: [Enter plan]'),
    template('sn-resumption','Resumption of Care Follow-up','Post-hospital or post-facility resumption assessment.','Reason for Resumption / Interval Event: [Enter event]\n\nHospital / Facility Course Reviewed: [Enter summary]\n\nNew / Changed Diagnoses or Orders: [Enter changes]\n\nMedication Reconciliation: [Enter changes or discrepancies]\n\nCurrent Clinical Status: [Enter findings]\n\nSkilled Interventions: [Enter interventions]\n\nEducation / Safety Reinforcement: [Enter education]\n\nProvider / Team Coordination: [Enter communication]\n\nUpdated Plan / Next Visit: [Enter plan]'),
    template('sn-recert','Recertification Skilled Need','Continued skilled-need and goal-progress narrative.','Certification Period Review: [Enter period]\n\nProgress Toward Goals: [Enter progress]\n\nCurrent Skilled Nursing Needs: [Enter needs]\n\nClinical Changes / Ongoing Risks: [Enter changes]\n\nMedication / Treatment Status: [Enter status]\n\nPatient / Caregiver Ability and Barriers: [Enter findings]\n\nWhy Continued Skilled Service Is Needed: [Enter individualized reason]\n\nUpdated Goals / Plan: [Enter plan]'),
    template('sn-prn','PRN Skilled Nursing Visit','Unscheduled/PRN nursing visit for a new concern.','Reason for PRN Visit / Time Requested: [Enter reason]\n\nFocused Assessment: [Enter findings]\n\nImmediate Skilled Intervention: [Enter intervention]\n\nProvider Notification / Orders: [Enter communication]\n\nResponse / Disposition: [Enter outcome]\n\nEducation / Warning Signs: [Enter education]\n\nFollow-up / Next Contact: [Enter plan]'),
    template('sn-discharge','Skilled Nursing Discharge Visit','Final skilled nursing visit and transition narrative.','Reason for Discharge: [Enter reason]\n\nClinical Status at Discharge: [Enter status]\n\nGoal Status / Outcomes: [Enter outcomes]\n\nMedication / Treatment Review: [Enter review]\n\nEducation / Self-management Reinforced: [Enter education]\n\nFollow-up Providers / Services: [Enter follow-up]\n\nUnresolved Needs / Risks: [Enter risks or none]\n\nDischarge Instructions / Emergency Guidance: [Enter guidance]'),
  ]},
  { code:'WOUND_CARE_NOTE', label:'Wound Care Note', category:'Nursing', roles:['RN','LPN','DELEGATING_NURSE'], templates:[
    template('wound-assess-treatment','Wound Assessment & Treatment','Assessment and ordered wound treatment.','Wound Location / Type: [Enter location/type]\n\nMeasurements / Tissue / Drainage / Odor: [Enter findings]\n\nPeriwound / Infection Indicators: [Enter findings]\n\nPain / Tolerance: [Enter findings]\n\nTreatment Performed Per Order: [Enter treatment]\n\nResponse / Complications: [Enter response]\n\nEducation / Offloading / Prevention: [Enter education]\n\nProvider Notification / New Orders: [Enter if applicable]\n\nPlan / Next Assessment: [Enter plan]'),
    template('wound-change','Wound Change / Concern','Focused change in wound status.','Observed Change: [Enter change]\n\nComparison With Prior Assessment: [Enter comparison]\n\nCurrent Measurements / Findings: [Enter findings]\n\nPain / Systemic Symptoms: [Enter findings]\n\nAction Taken: [Enter action]\n\nProvider / Wound Specialist Notification: [Enter details]\n\nOrders / Recommendations: [Enter details]\n\nFollow-up: [Enter plan]'),
    template('wound-healing','Wound Healing Progress','Progress toward healing and plan continuation.','Wound / Location: [Enter]\n\nHealing Progress: [Enter progress]\n\nCurrent Findings: [Enter findings]\n\nTreatment Tolerance / Adherence: [Enter status]\n\nBarriers to Healing: [Enter barriers]\n\nEducation / Prevention: [Enter education]\n\nPlan: [Enter plan]'),
  ]},
  { code:'MEDICATION_MANAGEMENT_NOTE', label:'Medication Management Note', category:'Nursing / Medication', roles:['RN','LPN','DELEGATING_NURSE'], templates:[
    template('med-reconciliation','Medication Reconciliation','Medication list comparison and discrepancies.','Reason for Reconciliation: [Enter reason]\n\nSources Compared: [Enter sources]\n\nMedication Discrepancies Identified: [Enter discrepancies or none]\n\nHigh-risk / Time-sensitive Concerns: [Enter concerns]\n\nProvider / Pharmacy Communication: [Enter communication]\n\nOrders / Clarifications Received: [Enter changes]\n\nUpdated List / Education: [Enter actions]\n\nFollow-up: [Enter plan]'),
    template('med-prn-effect','PRN Medication Effectiveness','Indication, administration context and reassessment.','PRN Medication / Indication: [Enter medication and reason]\n\nPre-administration Assessment: [Enter assessment]\n\nAdministration Reference: [Enter MAR time or reference]\n\nReassessment Time: [Enter time]\n\nResponse / Effectiveness: [Enter response]\n\nAdverse Effects: [Enter or none]\n\nAdditional Action / Notification: [Enter action]'),
    template('med-adverse','Medication Adverse Effect / Concern','Potential adverse effect or medication-related concern.','Medication(s) of Concern: [Enter medication]\n\nObserved / Reported Effect: [Enter concern]\n\nOnset / Severity / Relevant Findings: [Enter findings]\n\nImmediate Action: [Enter action]\n\nProvider / Pharmacy Notification: [Enter details]\n\nOrders / Instructions: [Enter details]\n\nResponse / Monitoring Plan: [Enter plan]'),
    template('med-teaching','Medication Teaching','Medication purpose, administration and safety teaching.','Medication / Topic: [Enter medication]\n\nTeaching Need: [Enter need]\n\nPurpose / Dose / Schedule Reviewed: [Enter details]\n\nSide Effects / Precautions Reviewed: [Enter details]\n\nAdherence / Access Barriers: [Enter findings]\n\nTeach-back / Understanding: [Enter result]\n\nFollow-up: [Enter plan]'),
  ]},
  { code:'RESPIRATORY_NOTE', label:'Respiratory / Oxygen Note', category:'Nursing', roles:['RN','LPN','DELEGATING_NURSE'], templates:[
    template('resp-status','Respiratory Status','Focused respiratory assessment and intervention.','Reason / Respiratory Concern: [Enter reason]\n\nRespiratory Rate / Effort: [Enter findings]\n\nBreath Sounds / Cough / Secretions: [Enter findings]\n\nSpO2 / Oxygen Device / Flow Per Order: [Enter values]\n\nIntervention: [Enter intervention]\n\nResponse / Reassessment: [Enter response]\n\nProvider Notification / Orders: [Enter if applicable]\n\nPlan: [Enter plan]'),
    template('oxygen-safety','Oxygen Therapy & Safety','Oxygen use, equipment and safety assessment.','Oxygen Order Verified: [Enter order]\n\nDevice / Flow / SpO2: [Enter details]\n\nEquipment / Supply Check: [Enter findings]\n\nSkin / Device Tolerance: [Enter findings]\n\nSafety Precautions Reviewed: [Enter education]\n\nResponse / Concerns: [Enter response]\n\nPlan: [Enter plan]'),
    template('resp-change','Acute Respiratory Change','Focused response to respiratory change.','Change / Time Identified: [Enter]\n\nFocused Respiratory Findings: [Enter findings]\n\nSpO2 / Vital Signs: [Enter values]\n\nImmediate Actions: [Enter actions]\n\nProvider / Emergency Escalation: [Enter details]\n\nResponse / Disposition: [Enter outcome]\n\nFollow-up Monitoring: [Enter plan]'),
  ]},
  { code:'NEURO_SEIZURE_NOTE', label:'Neurological / Seizure Note', category:'Nursing / Safety', roles:['RN','LPN','DELEGATING_NURSE','DSP','HOUSE_MANAGER'], templates:[
    template('seizure-event','Seizure Event Follow-up','Event details and post-event follow-up; does not replace required incident reporting.','Event Date / Time / Location: [Enter]\n\nObserved Activity / Duration: [Enter objective observation]\n\nPre-event Factors / Symptoms: [Enter if known]\n\nSafety Measures / Rescue Plan Actions: [Enter actions]\n\nPost-event Status / Recovery: [Enter findings]\n\nInjury / Aspiration Concern: [Enter findings]\n\nMedication / MAR Reference: [Enter if applicable]\n\nNotifications / Emergency Escalation: [Enter details]\n\nFollow-up Monitoring: [Enter plan]'),
    template('neuro-focused','Focused Neurological Check','Focused neurological status documentation.','Reason for Check: [Enter reason]\n\nLevel of Consciousness / Responsiveness: [Enter findings]\n\nSpeech / Communication: [Enter findings]\n\nPupils / Motor / Strength as Applicable: [Enter findings]\n\nGait / Balance / Safety: [Enter findings]\n\nChange From Baseline: [Enter change or none]\n\nAction / Notification: [Enter action]\n\nPlan: [Enter plan]'),
    template('postictal','Postictal Reassessment','Serial post-seizure recovery assessment.','Seizure Reference / End Time: [Enter]\n\nReassessment Time: [Enter]\n\nResponsiveness / Orientation: [Enter findings]\n\nRespiratory / SpO2 Status: [Enter findings]\n\nMotor / Safety / Injury Check: [Enter findings]\n\nReturn Toward Baseline: [Enter progress]\n\nAdditional Action / Notification: [Enter action]'),
  ]},
  { code:'DEVICE_LINE_TUBE_NOTE', label:'Catheter / Line / Tube Note', category:'Nursing / Devices', roles:['RN','LPN','DELEGATING_NURSE'], templates:[
    template('foley-status','Foley / Urinary Catheter Status','Catheter patency, drainage, site and care.','Catheter Type / Size / Indication: [Enter]\n\nPatency / Drainage / Urine Characteristics: [Enter findings]\n\nInsertion Site / Meatus / Securement: [Enter findings]\n\nOutput / I&O Reference: [Enter or reference flowsheet]\n\nCatheter Care Performed: [Enter care]\n\nSymptoms / Infection Concerns: [Enter findings]\n\nEducation / Plan: [Enter plan]'),
    template('foley-change','Urinary Catheter Change','Ordered catheter replacement/change.','Order / Indication Verified: [Enter]\n\nPrior Catheter Removed / Findings: [Enter]\n\nNew Catheter Type / Size / Balloon: [Enter]\n\nTechnique / Tolerance: [Enter]\n\nUrine Return / Characteristics: [Enter]\n\nComplications: [Enter or none]\n\nEducation / Follow-up: [Enter plan]'),
    template('feeding-tube','Feeding Tube / Enteral Status','Tube site, patency, feeding and tolerance.','Tube Type / Site: [Enter]\n\nSite / Skin Assessment: [Enter findings]\n\nPlacement / Patency Verification Per Policy: [Enter method]\n\nFeeding / Flush / Medication Reference: [Enter details]\n\nTolerance / GI Symptoms: [Enter findings]\n\nCare Performed: [Enter care]\n\nConcerns / Notification: [Enter if applicable]\n\nPlan: [Enter plan]'),
    template('picc-line','PICC / Central Line Status','Line site, dressing, patency and complication surveillance.','Line Type / Location / Lumens: [Enter]\n\nSite / Dressing Assessment: [Enter findings]\n\nPatency / Flush / Blood Return as Applicable: [Enter findings]\n\nInfusion / Therapy Reference: [Enter details]\n\nSigns of Infection / Infiltration / Complication: [Enter findings]\n\nCare / Dressing Change Per Order: [Enter care]\n\nProvider Notification / Plan: [Enter details]'),
    template('device-complication','Device / Tube Complication','Focused documentation for line/tube/device concern.','Device / Location: [Enter]\n\nProblem Identified / Time: [Enter]\n\nFocused Assessment: [Enter findings]\n\nImmediate Safety Action: [Enter action]\n\nProvider / Team Notification: [Enter details]\n\nOrders / Replacement / Disposition: [Enter outcome]\n\nFollow-up: [Enter plan]'),
  ]},
  { code:'DSP_SERVICE_NOTE', label:'DSP / ISP Service Note', category:'DODD / Waiver Services', roles:['DSP','HOUSE_MANAGER'], templates:[
    template('dsp-isp-progress','ISP Outcome Progress','Person-centered progress toward an active ISP outcome.','ISP Outcome / Service Focus: [Enter outcome]\n\nChoice / Preference Expressed: [Enter choice]\n\nSupports / Prompts Provided: [Enter supports]\n\nWhat the Individual Did / Response: [Enter objective response]\n\nMeasurable Progress / Barrier: [Enter progress]\n\nHealth & Safety Observation as Applicable: [Enter observation]\n\nImportant To / Important For Observation: [Enter relevant detail]\n\nFollow-up for Next Shift / Team: [Enter follow-up]'),
    template('dsp-daily','Daily Service Narrative','Concise service narrative supporting structured daily documentation.','Activities / Services Provided: [Enter activities]\n\nADL / Personal Support Highlights: [Enter supports]\n\nCommunity / Skill-Building Participation: [Enter participation]\n\nMood / Behavior / Safety Observations: [Enter objective observations]\n\nMeals / Hydration / Elimination Highlights: [Enter if relevant]\n\nIndividual Choices / Response: [Enter choices]\n\nExceptions / Follow-up Needed: [Enter follow-up]'),
    template('dsp-adl','ADL / Personal Care Support','Person-centered ADL support and level of assistance.','ADL / Task: [Enter task]\n\nChoice / Preference: [Enter preference]\n\nPrompting / Assistance Level: [Enter assistance]\n\nIndividual Participation: [Enter participation]\n\nSkin / Safety / Comfort Observation: [Enter observation]\n\nOutcome / Follow-up: [Enter outcome]'),
    template('dsp-meal-dysphagia','Meal & Dysphagia Support','Diet order and individualized swallowing precautions.','Meal / Time: [Enter]\n\nOrdered Diet Texture / Liquid Consistency Verified: [Enter]\n\nPositioning / Pacing / Bite Size Supports: [Enter supports]\n\nIntake / Tolerance: [Enter observation]\n\nCoughing / Choking / Aspiration Signs: [Enter findings or none]\n\nIndividual Choice / Participation: [Enter]\n\nEscalation / Follow-up: [Enter if applicable]'),
    template('dsp-sleep-wake','Sleep / Wake Exception Note','Context for an awake/sleep exception that needs narrative detail.','Scheduled Sleep / Wake Period: [Enter]\n\nObserved Status / Time: [Enter]\n\nReason Awake / Activity: [Enter reason if known]\n\nSupport Provided: [Enter support]\n\nSafety / Health Observation: [Enter observation]\n\nReturn to Sleep / Outcome: [Enter outcome]\n\nFollow-up Needed: [Enter if applicable]'),
    template('dsp-behavior','Behavior / Elopement Support','Objective behavior support documentation without replacing required incident reporting.','Antecedent / Context: [Enter observable context]\n\nObjective Behavior Observed: [Enter behavior]\n\nDuration / Frequency as Applicable: [Enter]\n\nPositive Supports / Plan Strategies Used: [Enter supports]\n\nIndividual Response: [Enter response]\n\nSafety Measures / Injury: [Enter findings]\n\nNotifications / Follow-up: [Enter details]'),
    template('dsp-community','Community Outing / Transportation','Community participation and transportation support.','Destination / Purpose: [Enter]\n\nIndividual Choice / Goal Connection: [Enter]\n\nTransportation / Safety Supports: [Enter supports]\n\nParticipation / Skill Practice: [Enter participation]\n\nHealth / Behavior / Access Needs: [Enter observations]\n\nOutcome / Return: [Enter outcome]\n\nFollow-up: [Enter if applicable]'),
  ]},
  { code:'INCIDENT_FOLLOWUP_NOTE', label:'Incident Follow-up Note', category:'Safety / Quality', roles:['ALL'], templates:[
    template('incident-followup','Incident / Event Follow-up','Clinical/service follow-up without replacing the formal incident report.','Incident / Event Referenced: [Enter event]\n\nCurrent Status / Follow-up Assessment: [Enter findings]\n\nImmediate and Ongoing Actions: [Enter actions]\n\nNotifications / Communication: [Enter details]\n\nOrders / Recommendations: [Enter details]\n\nPatient / Client Response: [Enter response]\n\nPrevention / Monitoring Plan: [Enter plan]'),
    template('fall-followup','Fall Follow-up','Post-fall reassessment and monitoring.','Fall Date / Time / Circumstances: [Enter]\n\nImmediate Assessment / Injury Check: [Enter findings]\n\nVital / Neuro Monitoring as Ordered: [Enter findings/reference]\n\nPain / Mobility / Function: [Enter findings]\n\nProvider / Guardian / Team Notification: [Enter details]\n\nOrders / Interventions: [Enter details]\n\nSubsequent Reassessment: [Enter findings]\n\nPrevention / Follow-up: [Enter plan]'),
    template('injury-followup','Injury Follow-up','Follow-up assessment after documented injury.','Injury / Event Reference: [Enter]\n\nSite / Current Findings: [Enter]\n\nPain / Function: [Enter findings]\n\nTreatment / First Aid / Ordered Care: [Enter]\n\nResponse / Progress: [Enter]\n\nNotifications / Orders: [Enter]\n\nFollow-up: [Enter plan]'),
    template('med-error-followup','Medication Event Follow-up','Clinical follow-up after a medication-related event; does not replace formal incident reporting.','Medication Event Reference: [Enter]\n\nMedication / Dose / Timing Involved: [Enter]\n\nCurrent Assessment / Symptoms: [Enter findings]\n\nImmediate Actions: [Enter actions]\n\nProvider / Pharmacy / Leadership Notification: [Enter details]\n\nOrders / Monitoring Instructions: [Enter details]\n\nOutcome / Follow-up: [Enter plan]'),
  ]},
  { code:'SUPERVISORY_NOTE', label:'Supervisory Note', category:'Supervision', roles:['RN','DELEGATING_NURSE','PROGRAM_MANAGER','HOUSE_MANAGER'], templates:[
    template('supervisory-visit','Supervisory Visit / Review','Observation of service delivery and plan adherence.','Purpose of Supervisory Review: [Enter purpose]\n\nStaff / Service Observed: [Enter]\n\nPlan / Order / ISP Adherence: [Enter findings]\n\nPatient / Client Status and Feedback: [Enter findings]\n\nStrengths Identified: [Enter strengths]\n\nConcerns / Variances: [Enter concerns]\n\nCoaching / Education Provided: [Enter coaching]\n\nCorrective / Follow-up Actions: [Enter actions]\n\nNext Review: [Enter timing]'),
    template('delegation-followup','Delegating Nurse Follow-up','Delegated nursing task oversight and competency follow-up.','Delegated Task / Order: [Enter]\n\nStaff Member / Qualification Reviewed: [Enter]\n\nObservation / Competency Findings: [Enter findings]\n\nProcedure / Medication Plan Adherence: [Enter findings]\n\nClient Response / Safety: [Enter findings]\n\nEducation / Remediation: [Enter]\n\nDelegation Decision / Restrictions: [Enter]\n\nFollow-up Date / Plan: [Enter]'),
    template('staff-coaching','Staff Coaching Note','Focused coaching related to service documentation or care delivery.','Reason for Coaching: [Enter]\n\nObserved / Reported Issue: [Enter objective facts]\n\nPolicy / Plan / Expectation Reviewed: [Enter]\n\nCoaching / Education Provided: [Enter]\n\nStaff Understanding / Response: [Enter]\n\nImmediate Correction: [Enter]\n\nFollow-up / Monitoring: [Enter]'),
    template('quality-review','Clinical / Service Quality Review','Focused quality review of documentation and care consistency.','Review Scope / Date Range: [Enter]\n\nRecords / Services Reviewed: [Enter]\n\nCompliant / Effective Practices: [Enter]\n\nGaps / Variances Identified: [Enter]\n\nImmediate Actions: [Enter]\n\nResponsible Person(s) / Due Dates: [Enter]\n\nRecheck / Closure Plan: [Enter]'),
  ]},
  { code:'PROVIDER_COMMUNICATION_NOTE', label:'Provider / Team Communication', category:'Communication', roles:['ALL'], templates:[
    template('provider-call','Provider Notification / Call','Clinically relevant provider communication and resulting instructions.','Reason for Contact: [Enter]\n\nProvider / Office Contacted: [Enter]\n\nDate / Time / Method: [Enter]\n\nInformation Communicated: [Enter]\n\nResponse / Instructions / Orders Received: [Enter]\n\nRead-back / Clarification as Applicable: [Enter]\n\nActions Taken: [Enter]\n\nFollow-up Required: [Enter]'),
    template('guardian-family','Guardian / Family Communication','Relevant communication with guardian, family or authorized representative.','Reason for Contact: [Enter]\n\nPerson Contacted / Relationship: [Enter]\n\nDate / Time / Method: [Enter]\n\nInformation Shared / Discussed: [Enter]\n\nQuestions / Preferences / Concerns Expressed: [Enter]\n\nActions / Decisions: [Enter]\n\nFollow-up: [Enter]'),
    template('care-conference','Care Conference Note','Interdisciplinary conference decisions and assignments.','Conference Date / Purpose: [Enter]\n\nParticipants / Roles: [Enter]\n\nCurrent Status / Key Issues Reviewed: [Enter]\n\nPatient / Client / Representative Preferences: [Enter]\n\nDecisions / Plan Changes: [Enter]\n\nAssigned Actions / Owners: [Enter]\n\nDue Dates / Follow-up Meeting: [Enter]'),
    template('pharmacy-communication','Pharmacy Communication','Medication clarification, refill or pharmacy coordination.','Reason for Contact: [Enter]\n\nPharmacy / Contact: [Enter]\n\nMedication(s) Discussed: [Enter]\n\nIssue / Clarification Requested: [Enter]\n\nResponse / Resolution: [Enter]\n\nProvider Involvement / Orders: [Enter]\n\nFollow-up: [Enter]'),
  ]},
  { code:'DISCHARGE_TRANSFER_NOTE', label:'Discharge / Transfer Note', category:'Transition of Care', roles:['RN','LPN','DELEGATING_NURSE','PROGRAM_MANAGER'], templates:[
    template('transfer-note','Transfer Note','Transfer to hospital, facility or another level of care.','Reason for Transfer: [Enter]\n\nDestination / Receiving Facility: [Enter]\n\nClinical Status at Transfer: [Enter]\n\nPertinent Diagnoses / Risks / Allergies Communicated: [Enter]\n\nMedication / Treatment Information Sent: [Enter]\n\nDocuments / Belongings Sent: [Enter]\n\nReceiving Contact / Handoff: [Enter]\n\nFamily / Guardian / Provider Notifications: [Enter]\n\nDeparture Time / Transport: [Enter]'),
    template('service-discharge','Service Discharge Summary','Summary at discharge from Sulandra service.','Reason / Effective Date of Discharge: [Enter]\n\nStatus at Discharge: [Enter]\n\nServices Provided / Goal Outcomes: [Enter]\n\nMedication / Treatment Status as Applicable: [Enter]\n\nOutstanding Needs / Risks: [Enter]\n\nEducation / Transition Instructions: [Enter]\n\nReferrals / Follow-up Providers: [Enter]\n\nRecords / Handoff Completed: [Enter]'),
    template('hospital-return','Return From Hospital / Facility','Transition back to Sulandra services after external care.','Return Date / Time / Source: [Enter]\n\nReason for Prior Transfer / Hospitalization: [Enter]\n\nDischarge Documents Reviewed: [Enter]\n\nNew Diagnoses / Orders / Restrictions: [Enter]\n\nMedication Changes / Reconciliation: [Enter]\n\nCurrent Assessment / Functional Status: [Enter]\n\nNotifications / Care Plan Updates: [Enter]\n\nFollow-up Appointments / Monitoring: [Enter]'),
  ]},
];

function visibleTypes(auth: AuthContext) {
  if (isAdmin(auth)) return NOTE_TYPES;
  const role = String(auth.role || '');
  return NOTE_TYPES.filter((type) => type.roles.includes('ALL') || type.roles.includes(role) || (nurseRoles.has(role) && /Nursing|Transition/.test(type.category)) || (dspRoles.has(role) && /DODD|Safety|Communication/.test(type.category)));
}

function deriveAuthoredBody(body: string, templateSnapshot: string) {
  if (!templateSnapshot) return body;
  const templateLines = new Set(templateSnapshot.split(/\r?\n/).map((line) => line.trimEnd()));
  const authored = body.split(/\r?\n/).filter((line) => {
    const normalized = line.trimEnd();
    const trimmed = normalized.trim();
    if (!trimmed) return false;
    if (templateLines.has(normalized)) return false;
    if (/^\[(?:Enter|Select|Document|Describe|Add|If applicable)[^\]]*\]$/i.test(trimmed)) return false;
    return true;
  });
  return authored.join('\n').trim();
}

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  if (isAdmin(auth) || String(auth.role || '') === 'AUDITOR') return true;
  const rows = await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment" a WHERE a."organizationId"=$1 AND a."userId"=$2 AND a."clientId"=$3
       UNION ALL
       SELECT 1 FROM "SpirePatientHomeAssignment" p
       JOIN "SpireEmployeeHomeAssignment" h ON h."organizationId"=p."organizationId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND h."userId"=$2 AND p."patientId"=$3 AND (p."endsAt" IS NULL OR p."endsAt">NOW())
     ) AS allowed`, auth.organizationId, auth.userId, patientId,
  );
  return rows[0]?.allowed === true;
}
async function requirePatient(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  ensureClinical(auth); selectedEntity(auth);
  if (!(await patientAllowed(prisma, auth, patientId))) throw Object.assign(new Error('This chart is outside your authorized clinical scope'), { status: 403 });
}
async function requirePatientWrite(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  ensureWrite(auth); await requirePatient(prisma, auth, patientId);
}
async function auditClinical(prisma: PrismaClient, auth: AuthContext, patientId: string, action: string, resourceId: string, afterValue: unknown) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
     VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,'NOTE',$7,$8::jsonb,$9,$10)`,
    auth.organizationId, selectedEntity(auth), auth.userId, auth.email ?? null, patientId, action, resourceId,
    JSON.stringify(afterValue ?? {}), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

function composition(req: express.Request) {
  const body = text(req.body?.body, 100000);
  const templateSnapshot = text(req.body?.templateSnapshot, 100000);
  const metadataValue = req.body?.compositionMetadata;
  const metadata = metadataValue && typeof metadataValue === 'object' && !Array.isArray(metadataValue) ? metadataValue : {};
  const pasteEventCount = count(req.body?.pasteEventCount, 10000);
  const pastedCharacterCount = count(req.body?.pastedCharacterCount, 1000000);
  return {
    body,
    templateId: text(req.body?.templateId, 160) || null,
    templateName: text(req.body?.templateName, 250) || null,
    templateVersion: text(req.body?.templateVersion, 80) || null,
    templateSource: text(req.body?.templateSource, 80) || null,
    templateSnapshot: templateSnapshot || null,
    authoredBody: deriveAuthoredBody(body, templateSnapshot) || null,
    compositionMetadata: metadata,
    pasteDetected: bool(req.body?.pasteDetected) || pasteEventCount > 0,
    pasteEventCount,
    pastedCharacterCount,
    copiedFromNoteId: text(req.body?.copiedFromNoteId, 120) || null,
  };
}

export const registerSpireNoteComposerRoutes = (app: express.Express, prisma: PrismaClient, deps: Deps) => {
  const { authOf } = deps;

  app.get('/api/spire/note-composer/catalog', async (_req, res, next) => {
    try {
      const auth = authOf(res); ensureClinical(auth); selectedEntity(auth);
      const noteTypes = visibleTypes(auth);
      const smartTexts = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
        `SELECT "id","name","body","ownerUserId",("ownerUserId"=$2) AS "ownedByCurrentUser",("ownerUserId" IS NULL) AS "organizationWide"
         FROM "SpireSmartText" WHERE "organizationId"=$1 AND "active"=TRUE AND ("ownerUserId"=$2 OR "ownerUserId" IS NULL) ORDER BY "name"`,
        auth.organizationId, auth.userId,
      ).catch(() => []);
      res.json({ data: { noteTypes, smartTexts, catalogVersion: '2026.08.15' } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/patients/:patientId/note-composer/notes', async (req, res, next) => {
    try {
      const auth = authOf(res); await requirePatient(prisma, auth, req.params.patientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
        `SELECT n."id",n."noteType",n."title",n."status",n."authorUserId",n."signedById",n."signedAt",n."createdAt",n."updatedAt",n."currentVersion",
                v."body",v."templateId",v."templateName",v."templateVersion",v."templateSource",v."templateSnapshot",v."authoredBody",
                v."compositionMetadata",v."pasteDetected",v."pasteEventCount",v."pastedCharacterCount",v."copiedFromNoteId",v."createdAt" AS "versionCreatedAt"
           FROM "SpireClinicalNote" n
           LEFT JOIN LATERAL (
             SELECT * FROM "SpireClinicalNoteVersion" x WHERE x."organizationId"=n."organizationId" AND x."noteId"=n."id" ORDER BY x."version" DESC LIMIT 1
           ) v ON TRUE
          WHERE n."organizationId"=$1 AND n."patientId"=$2
          ORDER BY n."createdAt" DESC LIMIT 500`,
        auth.organizationId, req.params.patientId,
      );
      res.json({ data: { items: rows } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/note-composer/notes', async (req, res, next) => {
    try {
      const auth = authOf(res); await requirePatientWrite(prisma, auth, req.params.patientId); const entity = selectedEntity(auth);
      const c = composition(req); if (!c.body) throw Object.assign(new Error('Note body is required'), { status: 400 });
      const noteType = text(req.body?.noteType, 80) || 'PROGRESS_NOTE';
      const title = text(req.body?.title, 250) || null;
      const encounterId = text(req.body?.encounterId, 120) || null;
      const sign = req.body?.sign === true;
      const noteId = await prisma.$transaction(async (tx) => {
        const inserted = await tx.$queryRawUnsafe<Array<{id:string}>>(
          `INSERT INTO "SpireClinicalNote"("organizationId","legalEntityId","patientId","encounterId","noteType","title","status","authorUserId","signedAt","signedById")
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9::boolean THEN NOW() ELSE NULL END,CASE WHEN $9::boolean THEN $8 ELSE NULL END) RETURNING "id"`,
          auth.organizationId, entity, req.params.patientId, encounterId, noteType, title, sign ? 'SIGNED' : 'DRAFT', auth.userId, sign,
        );
        const id = String(inserted[0]?.id || ''); if (!id) throw new Error('SPIRE did not create the note');
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalNoteVersion"("organizationId","legalEntityId","noteId","version","body","createdById","templateId","templateName","templateVersion","templateSource","templateSnapshot","authoredBody","compositionMetadata","pasteDetected","pasteEventCount","pastedCharacterCount","copiedFromNoteId")
           VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)`,
          auth.organizationId, entity, id, c.body, auth.userId, c.templateId, c.templateName, c.templateVersion, c.templateSource,
          c.templateSnapshot, c.authoredBody, JSON.stringify(c.compositionMetadata), c.pasteDetected, c.pasteEventCount, c.pastedCharacterCount, c.copiedFromNoteId,
        );
        return id;
      });
      await auditClinical(prisma, auth, req.params.patientId, sign ? 'CREATE_SIGNED_NOTE' : 'CREATE_NOTE_DRAFT', noteId, {
        noteType, title, templateId:c.templateId, templateName:c.templateName, templateVersion:c.templateVersion,
        pasteDetected:c.pasteDetected, pasteEventCount:c.pasteEventCount, pastedCharacterCount:c.pastedCharacterCount, signed:sign,
      });
      res.status(201).json({ data: { id: noteId, status: sign ? 'SIGNED' : 'DRAFT' } });
    } catch (error) { next(error); }
  });

  app.put('/api/spire/patients/:patientId/note-composer/notes/:noteId', async (req, res, next) => {
    try {
      const auth = authOf(res); await requirePatientWrite(prisma, auth, req.params.patientId); const entity = selectedEntity(auth);
      const c = composition(req); if (!c.body) throw Object.assign(new Error('Note body is required'), { status: 400 });
      const noteType = text(req.body?.noteType, 80) || 'PROGRESS_NOTE';
      const title = text(req.body?.title, 250) || null;
      const result = await prisma.$transaction(async (tx) => {
        const notes = await tx.$queryRawUnsafe<Array<{id:string;currentVersion:number}>>(
          `SELECT "id","currentVersion" FROM "SpireClinicalNote" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 AND "status"='DRAFT' FOR UPDATE`,
          auth.organizationId, entity, req.params.patientId, req.params.noteId,
        );
        if (!notes[0]) throw Object.assign(new Error('Editable draft note not found'), { status: 404 });
        const version = Number(notes[0].currentVersion || 1) + 1;
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalNoteVersion"("organizationId","legalEntityId","noteId","version","body","changeReason","createdById","templateId","templateName","templateVersion","templateSource","templateSnapshot","authoredBody","compositionMetadata","pasteDetected","pasteEventCount","pastedCharacterCount","copiedFromNoteId")
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)`,
          auth.organizationId, entity, req.params.noteId, version, c.body, text(req.body?.changeReason, 500) || 'Updated in SPIRE Note Composer', auth.userId,
          c.templateId, c.templateName, c.templateVersion, c.templateSource, c.templateSnapshot, c.authoredBody, JSON.stringify(c.compositionMetadata),
          c.pasteDetected, c.pasteEventCount, c.pastedCharacterCount, c.copiedFromNoteId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "SpireClinicalNote" SET "currentVersion"=$1,"noteType"=$2,"title"=$3,"updatedAt"=NOW() WHERE "id"=$4 AND "organizationId"=$5 AND "legalEntityId"=$6`,
          version, noteType, title, req.params.noteId, auth.organizationId, entity,
        );
        return version;
      });
      await auditClinical(prisma, auth, req.params.patientId, 'UPDATE_NOTE_COMPOSITION', req.params.noteId, {
        version: result, templateId:c.templateId, templateName:c.templateName, pasteDetected:c.pasteDetected,
        pasteEventCount:c.pasteEventCount, pastedCharacterCount:c.pastedCharacterCount,
      });
      res.json({ data: { id:req.params.noteId, version:result, status:'DRAFT' } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/note-composer/notes/:noteId/sign', async (req, res, next) => {
    try {
      const auth = authOf(res); await requirePatientWrite(prisma, auth, req.params.patientId); const entity = selectedEntity(auth);
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "SpireClinicalNote" SET "status"='SIGNED',"signedAt"=NOW(),"signedById"=$1,"updatedAt"=NOW()
          WHERE "id"=$2 AND "organizationId"=$3 AND "legalEntityId"=$4 AND "patientId"=$5 AND "status"='DRAFT'`,
        auth.userId, req.params.noteId, auth.organizationId, entity, req.params.patientId,
      );
      if (!result) throw Object.assign(new Error('Draft note not found'), { status: 404 });
      await auditClinical(prisma, auth, req.params.patientId, 'SIGN_NOTE', req.params.noteId, { source:'SPIRE_NOTE_COMPOSER_V2' });
      res.json({ data: { id:req.params.noteId, status:'SIGNED' } });
    } catch (error) { next(error); }
  });
};
