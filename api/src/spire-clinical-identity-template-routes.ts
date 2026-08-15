import type express from 'express';
import type { PrismaClient } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};

type Deps = { authOf: (response: express.Response) => AuthContext };

type IdentityRow = {
  id: string;
  email: string | null;
  role: string;
  record: unknown;
  portalDisplayName: string | null;
};

type AppointmentRow = {
  userId: string;
  appointmentKey: string;
  appointmentType: string;
  title: string;
  credentialLabel: string | null;
  credentialVerificationStatus: string | null;
};

const clinicalRoles = new Set([
  'ADMINISTRATOR', 'PROGRAM_MANAGER', 'AUDITOR', 'DSP', 'DELEGATING_NURSE',
  'LPN', 'RN', 'HOUSE_MANAGER', 'CEO', 'COO', 'DOO',
]);

const nurseRoles = new Set(['RN', 'LPN', 'DELEGATING_NURSE']);
const directCareRoles = new Set(['DSP', 'HOUSE_MANAGER']);
const text = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const owner = (auth: AuthContext) => auth.enterpriseOwner === true || text(auth.email, 300).toLowerCase() === 'admin@sulandrahealth.com';
const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(String(auth.role || '')) && !owner(auth)) {
    throw Object.assign(new Error('SPIRE clinical access is required'), { status: 403 });
  }
};

const roleCredential = (role: string) => {
  switch (String(role || '').toUpperCase()) {
    case 'RN':
    case 'DELEGATING_NURSE': return 'RN';
    case 'LPN': return 'LPN';
    case 'DSP': return 'DSP';
    case 'HOUSE_MANAGER': return 'House Manager';
    case 'CEO': return 'CEO';
    default: return '';
  }
};

async function resolveIdentities(prisma: PrismaClient, auth: AuthContext, requestedIds: string[]) {
  const ids = [...new Set(requestedIds.map((value) => text(value, 120)).filter(Boolean))].slice(0, 100);
  if (!ids.length) return [];

  const users = await prisma.$queryRawUnsafe<IdentityRow[]>(
    `SELECT u."id",u."email",u."role"::text AS "role",to_jsonb(u) AS "record",
            credential."displayName" AS "portalDisplayName"
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=u."id"
      WHERE u."organizationId"=$1 AND u."id"=ANY($2::text[])`,
    auth.organizationId,
    ids,
  );

  const appointments = await prisma.$queryRawUnsafe<AppointmentRow[]>(
    `SELECT "userId","appointmentKey","appointmentType","title","credentialLabel","credentialVerificationStatus"
       FROM "LeadershipAppointment"
      WHERE "organizationId"=$1 AND "userId"=ANY($2::text[])
        AND "status"='ACTIVE'
      ORDER BY CASE "credentialVerificationStatus" WHEN 'VERIFIED' THEN 0 WHEN 'PENDING_VERIFICATION' THEN 1 ELSE 2 END,
               CASE "appointmentType" WHEN 'EXECUTIVE_CLINICAL' THEN 0 WHEN 'ENTITY_CLINICAL' THEN 1 ELSE 2 END,
               "updatedAt" DESC`,
    auth.organizationId,
    ids,
  ).catch(() => [] as AppointmentRow[]);

  const credentialByUser = new Map<string, string>();
  const executiveSuffixesByUser = new Map<string, string[]>();
  for (const appointment of appointments) {
    const userId = String(appointment.userId);
    const label = text(appointment.credentialLabel, 80);
    if (label && !credentialByUser.has(userId)) credentialByUser.set(userId, label);

    const appointmentKey = text(appointment.appointmentKey, 120).toUpperCase();
    const title = text(appointment.title, 250);
    if (appointmentKey === 'CHIEF_EXECUTIVE_OFFICER' || /\bchief executive officer\b|\bCEO\b/i.test(title)) {
      const existing = executiveSuffixesByUser.get(userId) || [];
      if (!existing.includes('CEO')) executiveSuffixesByUser.set(userId, [...existing, 'CEO']);
    }
  }

  return users.map((row) => {
    const record = asObject(row.record);
    const firstName = text(record.firstName, 100);
    const middleName = text(record.middleName, 100);
    const lastName = text(record.lastName, 100);
    const displayName = text(row.portalDisplayName, 250)
      || text(record.displayName, 250)
      || text(record.fullName, 250)
      || text(record.name, 250)
      || [firstName, middleName, lastName].filter(Boolean).join(' ')
      || text(row.email, 300)
      || row.id;
    const baseCredential = credentialByUser.get(row.id)
      || text(record.credentials, 80)
      || text(record.credential, 80)
      || roleCredential(row.role);
    const suffixes = executiveSuffixesByUser.get(row.id) || [];
    const credentials = [...new Set([baseCredential, ...suffixes].map((value) => text(value, 80)).filter(Boolean))].join(', ');
    const role = String(row.role || '');
    const displayLabel = credentials && !displayName.toUpperCase().endsWith(`, ${credentials.toUpperCase()}`)
      ? `${displayName}, ${credentials}`
      : displayName;
    return { id: row.id, userId: row.id, email: row.email, role, displayName, credentials, displayLabel };
  });
}

type NoteTemplate = {
  id: string;
  name: string;
  description: string;
  body: string;
};

type NoteType = {
  code: string;
  label: string;
  category: string;
  roles: string[];
  templates: NoteTemplate[];
};

const template = (id: string, name: string, description: string, body: string): NoteTemplate => ({ id, name, description, body });

const NOTE_TYPES: NoteType[] = [
  {
    code: 'PROGRESS_NOTE', label: 'Progress Note', category: 'General Clinical', roles: ['ALL'], templates: [
      template('progress-standard', 'Standard Progress Note', 'General clinical or service progress documentation.', 'Focus / Reason for Note:\n\nAssessment / Observation:\n\nInterventions / Supports Provided:\n\nResponse / Outcome:\n\nCommunication / Coordination:\n\nPlan / Follow-up:\n'),
      template('progress-care-coordination', 'Care Coordination Note', 'Communication, coordination and follow-up with the care team.', 'Reason for Coordination:\n\nPerson(s) Contacted / Method:\n\nInformation Reviewed or Shared:\n\nActions / Decisions:\n\nPatient / Client Impact:\n\nFollow-up Needed:\n'),
    ],
  },
  {
    code: 'NURSING_PROGRESS_NOTE', label: 'Nursing Progress Note', category: 'Nursing', roles: ['RN', 'LPN', 'DELEGATING_NURSE'], templates: [
      template('nursing-progress', 'Standard Nursing Progress Note', 'Focused nursing assessment, interventions, response and plan.', 'Reason / Focus:\n\nAssessment / Clinical Observations:\n\nInterventions / Skilled Nursing Services:\n\nPatient Response / Outcome:\n\nEducation / Care Coordination:\n\nPlan / Follow-up:\n'),
      template('nursing-change-condition', 'Change of Condition', 'Structured documentation for a clinically meaningful change from baseline.', 'Change From Baseline / Time Identified:\n\nFocused Assessment / Vital Signs:\n\nSymptoms / Clinical Findings:\n\nImmediate Nursing Actions:\n\nProvider / Guardian / Team Notification:\n\nOrders / Instructions Received:\n\nResponse / Disposition:\n\nMonitoring / Follow-up Plan:\n'),
    ],
  },
  {
    code: 'SKILLED_NURSING_VISIT', label: 'Skilled Nursing Visit', category: 'Home Health Nursing', roles: ['RN', 'LPN', 'DELEGATING_NURSE'], templates: [
      template('skilled-routine', 'Routine Skilled Nursing Visit', 'Home-health skilled visit narrative with assessment, treatment, teaching and plan.', 'Visit Purpose / Skilled Need:\n\nHomebound / Functional Status as Applicable:\n\nFocused Systems Assessment:\n\nMedication Review / Reconciliation:\n\nSkilled Interventions / Treatments:\n\nPatient / Caregiver Education and Understanding:\n\nResponse to Care / Progress Toward Goals:\n\nCare Coordination / Provider Communication:\n\nNext Visit / Plan:\n'),
      template('skilled-recert-roc', 'Recertification / Resumption Follow-up', 'Focused narrative for recertification or resumption-of-care follow-up.', 'Visit Context:\n\nInterval Changes / Hospitalization or New Orders:\n\nCurrent Clinical Status:\n\nSkilled Needs Requiring Continued Service:\n\nMedication / Treatment Changes:\n\nEducation / Safety Reinforcement:\n\nGoals / Progress / Barriers:\n\nUpdated Plan and Follow-up:\n'),
    ],
  },
  {
    code: 'WOUND_CARE_NOTE', label: 'Wound Care Note', category: 'Nursing', roles: ['RN', 'LPN', 'DELEGATING_NURSE'], templates: [
      template('wound-standard', 'Wound Assessment & Treatment', 'Narrative companion to the structured wound module.', 'Wound Location / Type:\n\nAssessment Findings (size, tissue, drainage, odor, periwound as applicable):\n\nPain / Tolerance:\n\nTreatment Performed Per Order:\n\nResponse / Complications:\n\nEducation / Offloading / Infection Precautions:\n\nProvider Notification / New Orders:\n\nPlan / Next Assessment:\n'),
    ],
  },
  {
    code: 'MEDICATION_MANAGEMENT_NOTE', label: 'Medication Management Note', category: 'Nursing / Medication', roles: ['RN', 'LPN', 'DELEGATING_NURSE'], templates: [
      template('med-management', 'Medication Review / Management', 'Medication reconciliation, teaching, response and provider coordination.', 'Reason for Medication Review:\n\nMedication(s) / Order(s) Reviewed:\n\nAdherence / Administration Findings:\n\nEffectiveness / Side Effects / Concerns:\n\nEducation Provided:\n\nProvider / Pharmacy Communication:\n\nOrders / Changes Received:\n\nFollow-up / Monitoring:\n'),
    ],
  },
  {
    code: 'DSP_SERVICE_NOTE', label: 'DSP / ISP Service Note', category: 'DODD / Waiver Services', roles: ['DSP', 'HOUSE_MANAGER'], templates: [
      template('dsp-isp-progress', 'ISP Outcome Progress Note', 'Person-centered progress toward active ISP outcomes.', 'ISP Outcome / Service Focus:\n\nChoice / Preference Expressed:\n\nSupports / Prompts Provided:\n\nWhat the Individual Did / Response:\n\nMeasurable Progress / Barrier:\n\nHealth & Safety Observation as Applicable:\n\nImportant To / Important For Observation:\n\nFollow-up for Next Shift / Team:\n'),
      template('dsp-daily-service', 'Daily Service Narrative', 'Concise service narrative supporting the structured daily flowsheet.', 'Activities / Services Provided:\n\nADL / Personal Support Highlights:\n\nCommunity / Skill-Building Participation:\n\nMood / Behavior / Safety Observations:\n\nMeals / Hydration / Elimination Highlights as Applicable:\n\nIndividual Choices / Response:\n\nExceptions / Follow-up Needed:\n'),
    ],
  },
  {
    code: 'INCIDENT_FOLLOWUP_NOTE', label: 'Incident Follow-up Note', category: 'Safety / Quality', roles: ['ALL'], templates: [
      template('incident-followup', 'Incident / Event Follow-up', 'Clinical or service follow-up without replacing the formal incident report.', 'Incident / Event Referenced:\n\nCurrent Status / Follow-up Assessment:\n\nImmediate and Ongoing Actions:\n\nNotifications / Communication:\n\nOrders / Recommendations:\n\nPatient / Client Response:\n\nPrevention / Monitoring Plan:\n'),
    ],
  },
  {
    code: 'SUPERVISORY_NOTE', label: 'Supervisory Note', category: 'Supervision', roles: ['RN', 'DELEGATING_NURSE', 'PROGRAM_MANAGER', 'HOUSE_MANAGER'], templates: [
      template('supervisory-visit', 'Supervisory Visit / Review', 'Supervisory observation, staff performance, plan adherence and follow-up.', 'Purpose of Supervisory Review:\n\nStaff / Service Observed:\n\nPlan / Order / ISP Adherence:\n\nPatient / Client Status and Feedback:\n\nStrengths / Concerns Identified:\n\nCoaching / Education Provided:\n\nCorrective / Follow-up Actions:\n\nNext Review:\n'),
    ],
  },
  {
    code: 'PROVIDER_COMMUNICATION_NOTE', label: 'Provider / Team Communication', category: 'Communication', roles: ['ALL'], templates: [
      template('provider-communication', 'Provider Notification / Communication', 'Documents clinically relevant communication and resulting instructions.', 'Reason for Contact:\n\nPerson / Organization Contacted:\n\nDate / Time / Method:\n\nInformation Communicated:\n\nResponse / Instructions / Orders Received:\n\nRead-back / Clarification as Applicable:\n\nActions Taken:\n\nFollow-up Required:\n'),
    ],
  },
];

function visibleNoteTypes(auth: AuthContext) {
  if (owner(auth) || ['ADMINISTRATOR', 'PROGRAM_MANAGER', 'CEO', 'COO', 'DOO'].includes(String(auth.role || ''))) return NOTE_TYPES;
  const role = String(auth.role || '');
  return NOTE_TYPES.filter((type) =>
    type.roles.includes('ALL')
    || type.roles.includes(role)
    || (nurseRoles.has(role) && type.category.includes('Nursing'))
    || (directCareRoles.has(role) && type.category.includes('DODD')),
  );
}

export const registerSpireClinicalIdentityTemplateRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/spire/clinical-identity', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const identities = await resolveIdentities(prisma, auth, [auth.userId]);
      const identity = identities[0] || {
        id: auth.userId,
        userId: auth.userId,
        email: auth.email || null,
        role: String(auth.role || ''),
        displayName: auth.email || 'Current user',
        credentials: roleCredential(String(auth.role || '')),
        displayLabel: auth.email || 'Current user',
      };
      res.json({ data: identity });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/clinical-users', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const ids = text(req.query.ids, 12000).split(',').map((value) => value.trim()).filter(Boolean);
      const identities = await resolveIdentities(prisma, auth, ids);
      res.json({ data: { items: identities } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/note-types', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const noteTypes = visibleNoteTypes(auth);
      res.json({ data: { noteTypes, items: noteTypes } });
    } catch (error) { next(error); }
  });
};
