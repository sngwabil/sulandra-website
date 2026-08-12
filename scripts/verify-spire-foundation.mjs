import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const failures = [];

async function read(relative) {
  try {
    return await readFile(
      path.join(root, relative),
      'utf8'
    );
  } catch {
    failures.push(`Missing ${relative}`);
    return '';
  }
}

const files = {
  /*
   * Canonical SPIRE entry and standalone master.
   *
   * /spire.html is now only the public entry/redirect.
   * /spire/master.html is the actual standalone SPIRE application.
   */
  entryHtml: 'dist-web/spire.html',
  html: 'dist-web/spire/master.html',

  /*
   * Existing SPIRE assets are still verified independently because
   * backend/workflow modules may continue using them even though the
   * canonical root entry no longer loads the legacy shell.
   */
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

  referenceCategoryJs:
    'dist-web/assets/spire-epic-reference-chart-categories.js',

  referenceCategoryCss:
    'dist-web/assets/spire-epic-reference-chart-categories.css',

  smartPhraseParityJs:
    'dist-web/assets/spire-smartphrase-parity.js',

  smartPhraseParityCss:
    'dist-web/assets/spire-smartphrase-parity.css',

  smartPhraseResetJs:
    'dist-web/assets/spire-smartphrase-reset-patch.js',

  /*
   * Backend/API source verification.
   */
  referenceRoutes:
    'api/src/spire-epic-reference-parity-routes.ts',

  smartPhraseRoutes:
    'api/src/spire-smartphrase-parity-routes.ts',

  speedButtonRoutes:
    'api/src/spire-speed-button-parity-routes.ts',

  referenceInjector:
    'scripts/inject-spire-epic-reference-parity-routes.mjs',

  apiPackage:
    'api/package.json',

  parityDoc:
    'docs/SPIRE_EPIC_REFERENCE_PARITY.md',

  parityScopeMigration:
    'prisma/migrations/20260811070000_spire_epic_reference_parity_scope/migration.sql',

  migration:
    'prisma/migrations/20260807220000_spire_clinical_foundation/migration.sql',

  schedulingMigration:
    'prisma/migrations/20260808002000_spire_scheduling_cadence/migration.sql',

  authMigration:
    'prisma/migrations/20260808004000_spire_authorizations_evv/migration.sql',

  docsMigration:
    'prisma/migrations/20260808005000_spire_documents_external_records/migration.sql',

  commMigration:
    'prisma/migrations/20260808006000_spire_communications_inbasket/migration.sql',

  schedulingRoutes:
    'api/src/spire-scheduling-routes.ts',

  authRoutes:
    'api/src/spire-authorizations-evv-routes.ts',

  docsRoutes:
    'api/src/spire-documents-external-records-routes.ts',

  commRoutes:
    'api/src/spire-communications-inbasket-routes.ts',

  injector:
    'scripts/inject-clinical-routes.mjs',
};

const data = {};

await Promise.all(
  Object.entries(files).map(
    async ([key, value]) => {
      data[key] = await read(value);
    }
  )
);

const has = (key, markers, label) => {
  for (const marker of markers) {
    if (!data[key].includes(marker)) {
      failures.push(
        `${label} missing ${marker}`
      );
    }
  }
};

/*
 * ==========================================================================
 * SPIRE CANONICAL ENTRY
 * ==========================================================================
 *
 * Root /spire.html must now be only the canonical launcher.
 *
 * It must preserve:
 * - query string
 * - hash/deep-link state
 *
 * It must route to:
 * /spire/master.html
 *
 * The old SPIRE shell is intentionally not required here.
 */

has(
  'entryHtml',
  [
    '/spire/master.html',
    'window.location.search',
    'window.location.hash',
  ],
  'Spire canonical entry'
);

/*
 * Prevent the legacy shell from accidentally becoming active again.
 */
for (const legacyAsset of [
  'spire-app-v2.js',
  'spire-canonical-bootstrap.js',
  'spire-shell-resilience.js',
  'spire-chart-ready.js',
  'spire-deep-link.js',
  'spire-home-care-redesign-loader.js',
]) {
  if (
    data.entryHtml.includes(legacyAsset)
  ) {
    failures.push(
      `Spire canonical entry still loads legacy runtime asset ${legacyAsset}`
    );
  }
}

/*
 * ==========================================================================
 * SPIRE STANDALONE MASTER
 * ==========================================================================
 */

has(
  'html',
  [
    '<html',
    '<head',
    '<body',
    '</html>',
    'S.P.I.R.E.',
  ],
  'Spire standalone master'
);

/*
 * Ensure the master page is not accidentally replaced by the legacy shell.
 */
if (
  data.html.includes(
    'id="spireApp"'
  ) &&
  data.html.includes(
    '/assets/spire-app-v2.js'
  )
) {
  failures.push(
    'Spire standalone master appears to have regressed to the legacy spireApp shell'
  );
}

/*
 * ==========================================================================
 * EXISTING SPIRE FRONTEND ASSETS
 * ==========================================================================
 *
 * These files remain part of the repository/platform contract and are
 * verified independently from the root /spire.html redirect.
 */

has(
  'css',
  [
    'spire-topbar',
    'spire-patient-strip',
    'spire-left-rail',
    'spire-right-rail',
    'chart-tabs',
  ],
  'Spire CSS'
);

has(
  'workflowJs',
  [
    'Start Encounter',
    'New Clinical Note',
    'Save & Sign',
    'Place Order',
    'Record Vitals',
  ],
  'Spire workflow'
);

has(
  'cpoeJs',
  [
    'Order Composer',
    'Sign & Place Order',
    'Check Order',
  ],
  'Spire CPOE'
);

has(
  'emarJs',
  [
    'Electronic Medication Administration Record',
    'Medication Management',
    'PRN Effect',
  ],
  'Spire eMAR'
);

has(
  'careJs',
  [
    'Care Plan / ISP',
    'Person-Centered Profile',
    'Goals & Outcomes',
  ],
  'Spire Care Plan'
);

has(
  'incidentJs',
  [
    'Incident Management',
    'New Incident',
    'Investigation',
    'Corrective Action',
    'Close Incident',
  ],
  'Spire Incident'
);

has(
  'assessmentJs',
  [
    'Clinical Assessments',
    'New Assessment',
    'Vitals & Flowsheets',
    'flowsheets/trends',
  ],
  'Spire Assessments/Flowsheets'
);

/*
 * ==========================================================================
 * SCHEDULING
 * ==========================================================================
 */

has(
  'schedulingJs',
  [
    'New Appointment',
    'Check In',
    'Room',
    'Start Visit',
    'Check Out',
    'Waitlist',
    'Transportation',
    'Open Chart',
    '/api/spire/scheduling/day',
  ],
  'Spire Scheduling'
);

has(
  'schedulingCss',
  [
    'spire-sched-toolbar',
    'spire-sched-card',
    'spire-sched-summary',
    'spire-waitlist',
    'spire-sched-modal',
  ],
  'Spire Scheduling CSS'
);

/*
 * ==========================================================================
 * AUTHORIZATIONS / EVV
 * ==========================================================================
 */

has(
  'authJs',
  [
    'Authorizations & EVV',
    'Start EVV Visit',
    'remainingUnits',
    'authorizations/overview',
  ],
  'Spire Authorizations/EVV'
);

has(
  'authCss',
  [
    'auth-head',
    'auth-metrics',
    'auth-card',
    'spire-auth-modal',
  ],
  'Spire Authorizations/EVV CSS'
);

/*
 * ==========================================================================
 * DOCUMENTS / EXTERNAL RECORDS
 * ==========================================================================
 */

has(
  'docsJs',
  [
    'Documents / Media',
    'Upload Clinical Document',
    'docSearch',
    'External Records',
    'New Version',
  ],
  'Spire Documents'
);

has(
  'docsCss',
  [
    'doc-head',
    'doc-tools',
    'spire-doc-modal',
    'external-card',
  ],
  'Spire Documents CSS'
);

/*
 * ==========================================================================
 * COMMUNICATIONS / IN BASKET
 * ==========================================================================
 */

has(
  'commJs',
  [
    'In Basket 2.0',
    'Clinical Message',
    'Document Communication',
    'communications/overview',
    'inbasket-v2',
  ],
  'Spire Communications'
);

has(
  'commCss',
  [
    'comm-head',
    'thread-list',
    'ib-metrics',
    'spire-comm-modal',
  ],
  'Spire Communications CSS'
);

/*
 * ==========================================================================
 * EPIC-REFERENCE WORKFLOW PARITY ASSETS
 * ==========================================================================
 *
 * These remain checked as repository capabilities.
 * They are no longer required to be directly injected into root /spire.html.
 */

has(
  'referenceJs',
  [
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
  ],
  'Spire Epic-reference parity frontend'
);

has(
  'referenceCss',
  [
    'spire-reference-dashboard',
    'spire-reference-calendar',
    'spire-reference-note-tools',
    'spire-reference-wrap-grid',
    'spire-reference-sticky-patient',
  ],
  'Spire Epic-reference parity CSS'
);

has(
  'referenceCategoryJs',
  [
    'All Chart Review',
    "['ecg', 'ECG']",
    "['referrals', 'Referrals']",
    "['procedures', 'Procedures']",
    "['episodes', 'Episodes']",
    "['letters', 'Letters']",
    'reference-review',
  ],
  'Spire reference Chart Review categories'
);

has(
  'referenceCategoryCss',
  [
    'spire-reference-chart-categories',
  ],
  'Spire reference Chart Review category CSS'
);

/*
 * ==========================================================================
 * SMARTPHRASE / SPEED BUTTON PARITY
 * ==========================================================================
 */

has(
  'smartPhraseParityJs',
  [
    'SmartPhrase Manager',
    'Progress-note Speed Buttons',
    'share-targets',
    'data-speed-phrase',
    'data-parity-speed-phrase',
    'speed-buttons',
  ],
  'Spire SmartPhrase parity frontend'
);

has(
  'smartPhraseParityCss',
  [
    'spire-smartphrase-dialog',
    'spire-smartphrase-speed-help',
    'spire-smartphrase-sharing',
  ],
  'Spire SmartPhrase parity CSS'
);

has(
  'smartPhraseResetJs',
  [
    'spireNewSmartPhrase',
    'spirePhraseName',
    'spireSavePhrase',
  ],
  'Spire SmartPhrase reset guard'
);

/*
 * ==========================================================================
 * EPIC-REFERENCE BACKEND ROUTES
 * ==========================================================================
 */

has(
  'referenceRoutes',
  [
    "app.get('/api/spire/patients/:patientId/reference-review/:category'",
    "app.get('/api/spire/patients/:patientId/wrap-up-context'",
    "app.post('/api/spire/patients/:patientId/wrap-up-reference'",
    "'ATTENDING_COSIGNER'",
    '"SpirePatientInstruction"',
    '"SpireAfterVisitSummary"',
    "'GC', 'GE', 'GT'",
  ],
  'Spire Epic-reference parity routes'
);

/*
 * ==========================================================================
 * SMARTPHRASE ROUTES
 * ==========================================================================
 */

has(
  'smartPhraseRoutes',
  [
    "app.get('/api/spire/tools/smartphrases/manage'",
    "app.get('/api/spire/tools/smartphrases/share-targets'",
    "app.put('/api/spire/tools/smartphrases/:smartPhraseId'",
    "app.post('/api/spire/tools/smartphrases/:smartPhraseId/share'",
    "app.delete('/api/spire/tools/smartphrases/:smartPhraseId/share/:userId'",
  ],
  'Spire SmartPhrase parity routes'
);

has(
  'speedButtonRoutes',
  [
    "app.put('/api/spire/tools/smartphrases/speed-buttons'",
    "workspace\"='PROGRESS_NOTE'",
    'SpireSpeedButton',
  ],
  'Spire speed-button parity route'
);

/*
 * ==========================================================================
 * ROUTE INJECTORS
 * ==========================================================================
 */

has(
  'referenceInjector',
  [
    'registerSpireEpicReferenceParityRoutes',
    'registerSpireSpeedButtonParityRoutes',
    'registerSpireSmartPhraseParityRoutes',
    'spire-epic-reference-parity-routes.js',
    'spire-speed-button-parity-routes.js',
    'spire-smartphrase-parity-routes.js',
  ],
  'Spire Epic-reference parity injector'
);

has(
  'apiPackage',
  [
    'inject-clinical-routes.mjs && node ../scripts/inject-spire-epic-reference-parity-routes.mjs',
  ],
  'Spire API build'
);

/*
 * ==========================================================================
 * PARITY DOCUMENTATION
 * ==========================================================================
 */

has(
  'parityDoc',
  [
    'Reference parity gate',
    'The supplied guide is not an exhaustive Epic product inventory',
    'Provider Dashboard',
    'SmartPhrase',
    'Wrap-Up',
    'Haiku',
    'Dragon Medical One',
    'Current official Epic product-scope inventory',
    'Enterprise parity ledger',
    'Emergency / urgent care',
    'Perioperative / surgery / anesthesia',
    'Patient portal / digital front door',
  ],
  'Spire parity documentation'
);

/*
 * ==========================================================================
 * COMPANY-SCOPE MIGRATION
 * ==========================================================================
 */

has(
  'parityScopeMigration',
  [
    'ALTER TABLE "SpireEncounterParticipant" ADD COLUMN IF NOT EXISTS "legalEntityId" text',
    'ALTER TABLE "SpireEncounterStatusHistory" ADD COLUMN IF NOT EXISTS "legalEntityId" text',
    'ALTER TABLE "SpireVisitFollowUp" ADD COLUMN IF NOT EXISTS "legalEntityId" text',
    'ALTER TABLE "SpirePatientInstruction" ADD COLUMN IF NOT EXISTS "legalEntityId" text',
    'ALTER TABLE "SpireAfterVisitSummary" ADD COLUMN IF NOT EXISTS "legalEntityId" text',
    'SpireAfterVisitSummary_entity_patient_idx',
  ],
  'Spire Epic-reference company-scope migration'
);

/*
 * ==========================================================================
 * SCHEDULING MIGRATION
 * ==========================================================================
 */

for (const table of [
  'SpireScheduleResource',
  'SpireProviderAvailability',
  'SpireAppointmentStatusHistory',
  'SpireAppointmentReminder',
  'SpireAppointmentWaitlist',
  'SpireAppointmentTransportation',
  'SpireAppointmentPreparation',
]) {
  if (
    !data.schedulingMigration.includes(
      `"${table}"`
    )
  ) {
    failures.push(
      `Spire Scheduling migration missing ${table}`
    );
  }
}

/*
 * ==========================================================================
 * AUTHORIZATION / EVV MIGRATION
 * ==========================================================================
 */

for (const table of [
  'SpireServiceAuthorization',
  'SpireEvvVisit',
  'SpireAuthorizationLedger',
  'SpireAuthorizationAlert',
  'SpireBillingReconciliation',
]) {
  if (
    !data.authMigration.includes(
      `"${table}"`
    )
  ) {
    failures.push(
      `Spire Authorization migration missing ${table}`
    );
  }
}

/*
 * ==========================================================================
 * DOCUMENTS MIGRATION
 * ==========================================================================
 */

for (const table of [
  'SpireDocumentAccessEvent',
  'SpireDocumentAcknowledgement',
  'SpireClinicalDocument',
  'SpireExternalRecord',
  'SpireMediaItem',
]) {
  if (
    !data.docsMigration.includes(
      `"${table}"`
    )
  ) {
    failures.push(
      `Spire Documents migration missing ${table}`
    );
  }
}

/*
 * ==========================================================================
 * COMMUNICATIONS MIGRATION
 * ==========================================================================
 */

for (const table of [
  'SpireMessageThread',
  'SpireRoutingPool',
  'SpireRoutingPoolMember',
  'SpireClinicalMessageAttachment',
  'SpireCommunicationContact',
  'SpireCommunicationLog',
]) {
  if (
    !data.commMigration.includes(
      `"${table}"`
    )
  ) {
    failures.push(
      `Spire Communications migration missing ${table}`
    );
  }
}

/*
 * ==========================================================================
 * SCHEDULING ROUTES
 * ==========================================================================
 */

has(
  'schedulingRoutes',
  [
    "'/api/spire/scheduling/day'",
    "'/api/spire/scheduling/context'",
    "'/api/spire/patients/:patientId/appointments'",
  ],
  'Spire Scheduling routes'
);

/*
 * ==========================================================================
 * AUTHORIZATION ROUTES
 * ==========================================================================
 */

has(
  'authRoutes',
  [
    "'/api/spire/patients/:patientId/authorizations/overview'",
    "'/api/spire/patients/:patientId/authorizations'",
    "'/api/spire/patients/:patientId/evv/visits'",
    'Delivered units exceed remaining authorization',
  ],
  'Spire Authorization routes'
);

/*
 * ==========================================================================
 * DOCUMENT ROUTES
 * ==========================================================================
 */

has(
  'docsRoutes',
  [
    "'/api/spire/patients/:patientId/documents'",
    "'/api/spire/patients/:patientId/documents/:documentId/content'",
    "'/api/spire/patients/:patientId/external-records'",
    'scanBufferForMalware',
    'putSecureObject',
  ],
  'Spire Document routes'
);

/*
 * ==========================================================================
 * COMMUNICATION ROUTES
 * ==========================================================================
 */

has(
  'commRoutes',
  [
    "'/api/spire/inbasket-v2'",
    "'/api/spire/inbasket-v2/:itemId/action'",
    "'/api/spire/routing-pools'",
    "'/api/spire/patients/:patientId/communications/overview'",
    "'/api/spire/patients/:patientId/communications/threads'",
    'ACKNOWLEDGE',
  ],
  'Spire Communications routes'
);

/*
 * ==========================================================================
 * BACKEND CLINICAL ROUTE INJECTOR
 * ==========================================================================
 */

has(
  'injector',
  [
    'registerSpireSchedulingRoutes',
    'registerSpireAuthorizationsEvvRoutes',
    'registerSpireDocumentsExternalRecordsRoutes',
    'registerSpireCommunicationsInBasketRoutes',
  ],
  'Backend injector'
);

/*
 * ==========================================================================
 * CORE SPIRE FOUNDATION DATABASE TABLES
 * ==========================================================================
 */

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
  if (
    !data.migration.includes(
      `"${table}"`
    )
  ) {
    failures.push(
      `Spire foundation migration missing ${table}`
    );
  }
}

/*
 * ==========================================================================
 * FINAL RESULT
 * ==========================================================================
 */

if (failures.length) {
  console.error(
    `Spire verification failed:\n- ${failures.join('\n- ')}`
  );

  process.exit(1);
}

console.log(
  [
    'Spire verified:',
    'the canonical /spire.html entry routes to the standalone /spire/master.html workstation;',
    'clinical charting, CPOE, eMAR, Care Plan/ISP, incidents, assessments/flowsheets,',
    'scheduling, authorizations/EVV, secure documents/external records, Communications/In Basket 2.0,',
    'Epic-reference workflow capabilities, Chart Review reference categories, SmartPhrase sharing,',
    'personal note speed buttons, company-scoped Wrap-Up/AVS, database migrations,',
    'and backend route registrations remain wired into the production static/backend architecture.',
  ].join(' ')
);
