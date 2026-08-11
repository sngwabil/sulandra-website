import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function read(relative) {
  try {
    return await readFile(path.join(root, relative), 'utf8');
  } catch {
    failures.push(`Missing ${relative}`);
    return '';
  }
}

const files = {
  html: 'dist-web/spire.html',
  css: 'dist-web/assets/spire-app.css',
  workflowJs: 'dist-web/assets/spire-workflow.js',
  cpoeJs: 'dist-web/assets/spire-order-composer.js',
  emarJs: 'dist-web/assets/spire-emar.js',
  careJs: 'dist-web/assets/spire-care-plan.js',
  incidentJs: 'dist-web/assets/spire-incidents.js',
  assessmentJs: 'dist-web/assets/spire-assessments-flowsheets.js',
  schedulingJs: 'dist-web/assets/spire-scheduling.js',
  schedulingCss: 'dist-web/assets/spire-scheduling.css',
  authJs: 'dist-web/assets/spire-authorizations-evv.js',
  authCss: 'dist-web/assets/spire-authorizations-evv.css',
  docsJs: 'dist-web/assets/spire-documents-external-records.js',
  docsCss: 'dist-web/assets/spire-documents-external-records.css',
  commJs: 'dist-web/assets/spire-communications-inbasket.js',
  commCss: 'dist-web/assets/spire-communications-inbasket.css',
  referenceJs: 'dist-web/assets/spire-epic-reference-parity.js',
  referenceCss: 'dist-web/assets/spire-epic-reference-parity.css',
  referenceRoutes: 'api/src/spire-epic-reference-parity-routes.ts',
  referenceInjector: 'scripts/inject-spire-epic-reference-parity-routes.mjs',
  apiPackage: 'api/package.json',
  parityDoc: 'docs/SPIRE_EPIC_REFERENCE_PARITY.md',
  migration: 'prisma/migrations/20260807220000_spire_clinical_foundation/migration.sql',
  schedulingMigration: 'prisma/migrations/20260808002000_spire_scheduling_cadence/migration.sql',
  authMigration: 'prisma/migrations/20260808004000_spire_authorizations_evv/migration.sql',
  docsMigration: 'prisma/migrations/20260808005000_spire_documents_external_records/migration.sql',
  commMigration: 'prisma/migrations/20260808006000_spire_communications_inbasket/migration.sql',
  schedulingRoutes: 'api/src/spire-scheduling-routes.ts',
  authRoutes: 'api/src/spire-authorizations-evv-routes.ts',
  docsRoutes: 'api/src/spire-documents-external-records-routes.ts',
  commRoutes: 'api/src/spire-communications-inbasket-routes.ts',
  injector: 'scripts/inject-clinical-routes.mjs',
};

const data = {};
await Promise.all(Object.entries(files).map(async ([key, value]) => {
  data[key] = await read(value);
}));

const has = (key, markers, label) => {
  for (const marker of markers) {
    if (!data[key].includes(marker)) failures.push(`${label} missing ${marker}`);
  }
};

const publishedVersion = '20260808-spire-workflow-13';
const referenceVersion = '20260811-spire-epic-reference-parity-1';

has('html', [
  'spireApp',
  `/assets/spire-scheduling.css?v=${publishedVersion}`,
  `/assets/spire-authorizations-evv.css?v=${publishedVersion}`,
  `/assets/spire-documents-external-records.css?v=${publishedVersion}`,
  `/assets/spire-communications-inbasket.css?v=${publishedVersion}`,
  `/assets/spire-communications-inbasket.js?v=${publishedVersion}`,
  `/assets/spire-epic-reference-parity.css?v=${referenceVersion}`,
  `/assets/spire-epic-reference-parity.js?v=${referenceVersion}`,
], 'Spire HTML');

has('css', [
  'spire-topbar',
  'spire-patient-strip',
  'spire-left-rail',
  'spire-right-rail',
  'chart-tabs',
], 'Spire CSS');

has('workflowJs', [
  'Start Encounter',
  'New Clinical Note',
  'Save & Sign',
  'Place Order',
  'Record Vitals',
], 'Spire workflow');

has('cpoeJs', ['Order Composer', 'Sign & Place Order', 'Check Order'], 'Spire CPOE');
has('emarJs', ['Electronic Medication Administration Record', 'Medication Management', 'PRN Effect'], 'Spire eMAR');
has('careJs', ['Care Plan / ISP', 'Person-Centered Profile', 'Goals & Outcomes'], 'Spire Care Plan');
has('incidentJs', ['Incident Management', 'New Incident', 'Investigation', 'Corrective Action', 'Close Incident'], 'Spire Incident');
has('assessmentJs', ['Clinical Assessments', 'New Assessment', 'Vitals & Flowsheets', 'flowsheets/trends'], 'Spire Assessments/Flowsheets');

has('schedulingJs', [
  'New Appointment',
  'Check In',
  'Room',
  'Start Visit',
  'Check Out',
  'Waitlist',
  'Transportation',
  'Open Chart',
  '/api/spire/scheduling/day',
], 'Spire Scheduling');

has('schedulingCss', [
  'spire-sched-toolbar',
  'spire-sched-card',
  'spire-sched-summary',
  'spire-waitlist',
  'spire-sched-modal',
], 'Spire Scheduling CSS');

has('authJs', [
  'Authorizations & EVV',
  'Start EVV Visit',
  'remainingUnits',
  'authorizations/overview',
], 'Spire Authorizations/EVV');

has('authCss', ['auth-head', 'auth-metrics', 'auth-card', 'spire-auth-modal'], 'Spire Authorizations/EVV CSS');

has('docsJs', [
  'Documents / Media',
  'Upload Clinical Document',
  'docSearch',
  'External Records',
  'New Version',
], 'Spire Documents');

has('docsCss', ['doc-head', 'doc-tools', 'spire-doc-modal', 'external-card'], 'Spire Documents CSS');

has('commJs', [
  'In Basket 2.0',
  'Clinical Message',
  'Document Communication',
  'communications/overview',
  'inbasket-v2',
], 'Spire Communications');

has('commCss', ['comm-head', 'thread-list', 'ib-metrics', 'spire-comm-modal'], 'Spire Communications CSS');

has('referenceJs', [
  'Schedule Glance',
  'In Basket Glance',
  'SPIRE Workspace Settings',
  'Apply reference tab order',
  'Type <b>.</b> for SmartPhrases',
  'press <b>F2</b>',
  'Dictate',
  'reference-review',
  'Wrap-Up / After Visit Summary',
  'GC',
  'GE',
  'GT',
  'wrap-up-reference',
], 'Spire Epic-reference parity frontend');

has('referenceCss', [
  'spire-reference-dashboard',
  'spire-reference-calendar',
  'spire-reference-note-tools',
  'spire-reference-wrap-grid',
  'spire-reference-sticky-patient',
], 'Spire Epic-reference parity CSS');

has('referenceRoutes', [
  "app.get('/api/spire/patients/:patientId/reference-review/:category'",
  "app.get('/api/spire/patients/:patientId/wrap-up-context'",
  "app.post('/api/spire/patients/:patientId/wrap-up-reference'",
  "'ATTENDING_COSIGNER'",
  '"SpirePatientInstruction"',
  '"SpireAfterVisitSummary"',
  "'GC', 'GE', 'GT'",
], 'Spire Epic-reference parity routes');

has('referenceInjector', [
  'registerSpireEpicReferenceParityRoutes',
  'spire-epic-reference-parity-routes.js',
], 'Spire Epic-reference parity injector');

has('apiPackage', [
  'inject-clinical-routes.mjs && node ../scripts/inject-spire-epic-reference-parity-routes.mjs',
], 'Spire API build');

has('parityDoc', [
  'Reference parity gate',
  'The supplied guide is not an exhaustive Epic product inventory',
  'Provider Dashboard',
  'SmartPhrase',
  'Wrap-Up',
  'Haiku',
  'Dragon Medical One',
], 'Spire parity documentation');

for (const table of [
  'SpireScheduleResource',
  'SpireProviderAvailability',
  'SpireAppointmentStatusHistory',
  'SpireAppointmentReminder',
  'SpireAppointmentWaitlist',
  'SpireAppointmentTransportation',
  'SpireAppointmentPreparation',
]) {
  if (!data.schedulingMigration.includes(`"${table}"`)) {
    failures.push(`Spire Scheduling migration missing ${table}`);
  }
}

for (const table of [
  'SpireServiceAuthorization',
  'SpireEvvVisit',
  'SpireAuthorizationLedger',
  'SpireAuthorizationAlert',
  'SpireBillingReconciliation',
]) {
  if (!data.authMigration.includes(`"${table}"`)) {
    failures.push(`Spire Authorization migration missing ${table}`);
  }
}

for (const table of [
  'SpireDocumentAccessEvent',
  'SpireDocumentAcknowledgement',
  'SpireClinicalDocument',
  'SpireExternalRecord',
  'SpireMediaItem',
]) {
  if (!data.docsMigration.includes(`"${table}"`)) {
    failures.push(`Spire Documents migration missing ${table}`);
  }
}

for (const table of [
  'SpireMessageThread',
  'SpireRoutingPool',
  'SpireRoutingPoolMember',
  'SpireClinicalMessageAttachment',
  'SpireCommunicationContact',
  'SpireCommunicationLog',
]) {
  if (!data.commMigration.includes(`"${table}"`)) {
    failures.push(`Spire Communications migration missing ${table}`);
  }
}

has('schedulingRoutes', [
  "'/api/spire/scheduling/day'",
  "'/api/spire/scheduling/context'",
  "'/api/spire/patients/:patientId/appointments'",
], 'Spire Scheduling routes');

has('authRoutes', [
  "'/api/spire/patients/:patientId/authorizations/overview'",
  "'/api/spire/patients/:patientId/authorizations'",
  "'/api/spire/patients/:patientId/evv/visits'",
  'Delivered units exceed remaining authorization',
], 'Spire Authorization routes');

has('docsRoutes', [
  "'/api/spire/patients/:patientId/documents'",
  "'/api/spire/patients/:patientId/documents/:documentId/content'",
  "'/api/spire/patients/:patientId/external-records'",
  'scanBufferForMalware',
  'putSecureObject',
], 'Spire Document routes');

has('commRoutes', [
  "'/api/spire/inbasket-v2'",
  "'/api/spire/inbasket-v2/:itemId/action'",
  "'/api/spire/routing-pools'",
  "'/api/spire/patients/:patientId/communications/overview'",
  "'/api/spire/patients/:patientId/communications/threads'",
  'ACKNOWLEDGE',
], 'Spire Communications routes');

has('injector', [
  'registerSpireSchedulingRoutes',
  'registerSpireAuthorizationsEvvRoutes',
  'registerSpireDocumentsExternalRecordsRoutes',
  'registerSpireCommunicationsInBasketRoutes',
], 'Backend injector');

for (const table of [
  'SpirePatient',
  'SpireAppointment',
  'SpireEncounter',
  'SpireClinicalNote',
  'SpireResult',
  'SpireMedicationOrder',
  'SpireOrder',
  'SpireCarePlan',
  'SpireAssessment',
  'SpireIncident',
  'SpireClinicalMessage',
  'SpireInBasketItem',
  'SpireChartAccessEvent',
]) {
  if (!data.migration.includes(`"${table}"`)) {
    failures.push(`Spire foundation migration missing ${table}`);
  }
}

if (failures.length) {
  console.error(`Spire verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(
  'Spire verified: clinical charting, CPOE, eMAR, Care Plan/ISP, incidents, assessments/flowsheets, '
  + 'scheduling, authorizations/EVV, secure documents/external records, Communications/In Basket 2.0, '
  + 'and the supplied Epic-reference workflow parity layer are wired into the production static/backend architecture.',
);
