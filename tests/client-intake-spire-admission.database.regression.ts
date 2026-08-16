import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { registerClientIntakeRoutes } from '../api/src/client-intake-routes.js';
import { registerHomeHealthOperationsRoutes } from '../api/src/home-health-operations-routes.js';
import { registerSclsResidentialRoutes } from '../api/src/scls-residential-routes.js';

const prisma = new PrismaClient();
const run = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const ORG_ID = `ci-intake-org-${run}`;
const USER_ID = `ci-intake-rn-${run}`;
const SCLS_ID = `ci-intake-scls-${run}`;
const HHA_ID = `ci-intake-hha-${run}`;
const PERSON = {
  firstName: 'Avery',
  middleName: 'CI',
  lastName: `Regression${run.replace(/\D/g, '').slice(-6)}`,
  preferredName: 'Avery',
  dateOfBirth: '1988-04-12',
  phone: '937-555-0142',
  email: `avery.${run.replace(/[^a-z0-9]/gi, '').toLowerCase()}@example.test`,
  mrn: `CI-MRN-${run}`,
};
const IDS = {
  medicaid: `CI-MCD-${run}`,
  medicare: `CI-MCR-${run}`,
  member: `CI-MEMBER-${run}`,
  sclsAuthorization: `CI-SCLS-AUTH-${run}`,
  hhaAuthorization: `CI-HHA-AUTH-${run}`,
};

type JsonObject = Record<string, any>;

function listen(server: http.Server) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Unable to resolve test server port'));
      resolve(address.port);
    });
  });
}

const objectStore = http.createServer((req, res) => {
  req.on('data', () => undefined);
  req.on('end', () => {
    if (req.method === 'PUT') {
      res.writeHead(200, { etag: `"ci-${run}"` });
      res.end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from('ci-object'));
      return;
    }
    res.writeHead(204);
    res.end();
  });
});

let objectStorePort = 0;
let apiServer: http.Server | null = null;

function authFor(response: express.Response) {
  const legalEntityId = String(response.locals.legalEntityId || '');
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    role: UserRole.RN,
    email: 'ci-intake-rn@sulandrahealth.test',
    legalEntityId,
    enterpriseOwner: true,
    ipAddress: '127.0.0.1',
    userAgent: 'spire-intake-db-regression',
  };
}

async function request(baseUrl: string, legalEntityId: string, method: string, path: string, body?: unknown, expected?: number | number[]) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-test-legal-entity-id': legalEntityId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: JsonObject = {};
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
  }
  const allowed = expected === undefined ? [200, 201] : Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.status)) {
    throw new Error(`${method} ${path} expected ${allowed.join('/')} but received ${response.status}: ${raw}`);
  }
  return parsed.data;
}

function fieldDefault(field: JsonObject) {
  const key = String(field?.key || '').toLowerCase();
  const type = String(field?.type || '').toLowerCase();
  if (key.includes('email') || type === 'email') return PERSON.email;
  if (key.includes('phone') || type === 'tel') return PERSON.phone;
  if (key.includes('date') || type === 'date') return '2026-08-16';
  if (type === 'checkbox' || type === 'boolean') return true;
  if (type === 'number') return 1;
  if (type === 'select') {
    const first = Array.isArray(field?.options) ? field.options[0] : null;
    if (first && typeof first === 'object') return first.value ?? first.label ?? 'yes';
    return first ?? 'yes';
  }
  return `CI ${field?.label || field?.key || 'value'}`;
}

function basePayload(section: JsonObject) {
  return Object.fromEntries((Array.isArray(section?.fields) ? section.fields : []).map((field: JsonObject) => [field.key, fieldDefault(field)]));
}

function sclsOverrides() {
  return {
    demographics_identity: {
      firstName: PERSON.firstName,
      middleName: PERSON.middleName,
      lastName: PERSON.lastName,
      preferredName: PERSON.preferredName,
      dateOfBirth: PERSON.dateOfBirth,
      medicalRecordNumber: PERSON.mrn,
      sexAtBirth: 'Female',
      genderIdentity: 'Woman',
      preferredLanguage: 'English',
    },
    contact_residence: {
      phone: PERSON.phone,
      email: PERSON.email,
      addressLine1: '101 CI Regression Way',
      city: 'Dayton',
      state: 'OH',
      zipCode: '45402',
    },
    emergency_contacts: {
      primaryContactName: 'Morgan Regression',
      primaryRelationship: 'Sibling',
      primaryPhone: '937-555-0199',
    },
    insurance_medicaid: {
      medicaidId: IDS.medicaid,
      medicareId: IDS.medicare,
      payerName: 'CI Ohio Medicaid Plan',
      memberId: IDS.member,
      eligibilityStatus: 'ACTIVE',
      waiverType: 'Individual Options',
      primaryInsurance: 'CI Ohio Medicaid Plan',
      coverageNotes: 'Database regression evidence',
    },
    legal_decision_maker: {
      hasGuardian: 'yes',
      guardianName: 'Jordan Guardian',
      guardianRelationship: 'Court-appointed guardian',
      guardianEmail: 'guardian@example.test',
      guardianPhone: '937-555-0166',
    },
    medications_reconciliation: {
      noCurrentMedications: false,
      medications: 'Acetaminophen 500 mg | 500 mg | PO | BID | 08:00,20:00 | Dr CI Test | 2026-08-01 | 2026-12-31',
      prnMedications: 'Albuterol HFA | 2 puffs | INH | PRN | | Dr CI Test | 2026-08-01 | 2026-12-31 | wheeze',
      pharmacy: 'CI Test Pharmacy',
      administrationSupport: 'Medication-certified staff / nurse as applicable',
    },
    service_authorization: {
      authorizationNumber: IDS.sclsAuthorization,
      serviceCode: 'HPC',
      authorizedService: 'Homemaker/Personal Care',
      authorizationStart: '2026-08-01',
      authorizationEnd: '2026-12-31',
      authorizedUnits: 120,
    },
    evv_setup: { evvRequired: 'yes', evvMethod: 'mobile app' },
    allergies: { noKnownAllergies: false, allergyList: 'Penicillin | Rash | Moderate' },
    diagnoses_history: { diagnoses: 'Essential hypertension' },
    safety_emergency: {
      emergencyPlan: 'Call 911 for life-threatening emergency and notify guardian.',
      elopementRisk: 'No known elopement history; follow ISP supervision.',
      chokingRisk: 'Use ordered diet texture and aspiration precautions if indicated.',
    },
  } as Record<string, JsonObject>;
}

function hhaOverrides() {
  return {
    demographics_identity: {
      firstName: PERSON.firstName,
      middleName: PERSON.middleName,
      lastName: PERSON.lastName,
      preferredName: PERSON.preferredName,
      dateOfBirth: PERSON.dateOfBirth,
      medicalRecordNumber: PERSON.mrn,
      sexAtBirth: 'Female',
      preferredLanguage: 'English',
    },
    contact_residence: {
      phone: PERSON.phone,
      email: PERSON.email,
      addressLine1: '101 CI Regression Way',
      city: 'Dayton',
      state: 'OH',
      zipCode: '45402',
    },
    emergency_contacts: {
      primaryContactName: 'Morgan Regression',
      primaryRelationship: 'Sibling',
      primaryPhone: '937-555-0199',
    },
    insurance_medicaid: {
      medicaidId: IDS.medicaid,
      medicareId: IDS.medicare,
      payerName: 'CI Ohio Medicaid Plan',
      memberId: IDS.member,
      eligibilityStatus: 'ACTIVE',
      primaryInsurance: 'CI Ohio Medicaid Plan',
      coverageNotes: 'Home Health intake regression evidence',
    },
    legal_decision_maker: { hasGuardian: 'no' },
    medications_reconciliation: { noCurrentMedications: true, medicationNotes: 'No current medications documented for this Home Health fixture.' },
    service_authorization: {
      authorizationNumber: IDS.hhaAuthorization,
      serviceCode: 'SN',
      authorizedService: 'Skilled Nursing',
      authorizationStart: '2026-08-01',
      authorizationEnd: '2026-12-31',
      authorizedUnits: 20,
    },
    allergies: { noKnownAllergies: true },
    diagnoses_history: { diagnoses: 'Essential hypertension' },
    safety_emergency: { emergencyPlan: 'Call 911 for emergency and notify the Home Health office.' },
  } as Record<string, JsonObject>;
}

async function completeCatalog(baseUrl: string, entityId: string, caseId: string, overrides: Record<string, JsonObject>) {
  const catalog = await request(baseUrl, entityId, 'GET', '/api/admin/client-intakes/catalog', undefined, 200);
  assert.equal(catalog.intakeMode, 'OPERATIONAL', `Expected ${entityId} intake to be operational`);
  for (const section of catalog.sections as JsonObject[]) {
    const payload = { ...basePayload(section), ...(overrides[section.key] || {}) };
    await request(baseUrl, entityId, 'PUT', `/api/admin/client-intakes/${caseId}/sections/${section.key}`, { status: 'COMPLETE', payload }, 200);
  }
}

async function addSignatures(baseUrl: string, entityId: string, caseId: string) {
  for (const signatureType of ['CONSENT_TO_SERVICES', 'PRIVACY_ACKNOWLEDGMENT', 'CLIENT_OR_LEGAL_REP_ACKNOWLEDGMENT']) {
    await request(baseUrl, entityId, 'POST', `/api/admin/client-intakes/${caseId}/signatures`, {
      signatureType,
      signerName: 'Jordan Guardian',
      signerRelationship: 'Authorized representative',
      signerEmail: 'guardian@example.test',
      signatureMethod: 'ELECTRONIC_CONSENT',
      attestation: `CI regression attestation for ${signatureType}.`,
    }, 201);
  }
}

async function addSclsEvidence(baseUrl: string, caseId: string) {
  for (const documentType of ['OHIO_ISP', 'INSURANCE_CARD', 'ACTIVE_MAR', 'EVV_SETUP', 'INDIVIDUAL_SPECIFIC_TRAINING', 'GUARDIANSHIP']) {
    await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${caseId}/attachments`, {
      documentType,
      title: `CI ${documentType}`,
      originalFileName: `${documentType.toLowerCase()}.txt`,
      mimeType: 'text/plain',
      contentBase64: Buffer.from(`CI database-backed evidence ${documentType} ${run}`).toString('base64'),
      notes: 'Disposable CI evidence fixture',
    }, 201);
  }
}

async function count(sql: string, ...params: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(sql, ...params);
  return Number(rows[0]?.count || 0);
}

async function promotionCounts(patientId: string, intakeCaseId: string) {
  return {
    admissionNotes: await count('SELECT count(*)::int AS count FROM "SpireClinicalNote" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "noteType"=\'ADMISSION_INTAKE\'', ORG_ID, SCLS_ID, patientId),
    carePlans: await count('SELECT count(*)::int AS count FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "sourceIntakeCaseId"=$4', ORG_ID, SCLS_ID, patientId, intakeCaseId),
    medReconciliations: await count('SELECT count(*)::int AS count FROM "SpireMedicationReconciliation" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3', ORG_ID, SCLS_ID, patientId),
    medicationOrders: await count('SELECT count(*)::int AS count FROM "SpireMedicationOrder" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3', ORG_ID, SCLS_ID, patientId),
    medicationSchedules: await count('SELECT count(*)::int AS count FROM "SpireMedicationSchedule" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3', ORG_ID, SCLS_ID, patientId),
    authorizations: await count('SELECT count(*)::int AS count FROM "SpireServiceAuthorization" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "authorizationNumber"=$4', ORG_ID, SCLS_ID, patientId, IDS.sclsAuthorization),
  };
}

async function seed() {
  await prisma.$executeRawUnsafe('INSERT INTO "Organization"("id","name","slug") VALUES($1,$2,$3)', ORG_ID, 'Sulandra CI Intake E2E', `ci-intake-${run}`);
  await prisma.$executeRawUnsafe('INSERT INTO "User"("id","organizationId","email","firstName","lastName","role","active") VALUES($1,$2,$3,$4,$5,\'RN\',TRUE)', USER_ID, ORG_ID, 'ci-intake-rn@sulandrahealth.test', 'CI', 'Reviewer');
  await prisma.$executeRawUnsafe(
    'INSERT INTO "LegalEntity"("id","organizationId","code","legalName","displayName","entityType","status","isEmployer","isProvider","metadata") VALUES($1,$2,\'SCLS\',$3,$4,\'OPERATING\',\'ACTIVE\',TRUE,TRUE,$5::jsonb),($6,$2,\'HOME_HEALTH\',$7,$8,\'OPERATING\',\'ACTIVE\',TRUE,TRUE,$9::jsonb)',
    SCLS_ID, ORG_ID, 'Sulandra Community Living Services CI', 'SCLS CI', JSON.stringify({ serviceOperationsStatus: 'ACTIVE', referralStatus: 'ACTIVE' }),
    HHA_ID, 'Sulandra Home Health Care Services CI', 'Home Health CI', JSON.stringify({ serviceOperationsStatus: 'ACTIVE', referralStatus: 'ACTIVE', licensingStatus: 'ACTIVE' }),
  );
}

async function main() {
  objectStorePort = await listen(objectStore);
  process.env.EMPLOYEE_OBJECT_STORAGE_ENDPOINT = `http://127.0.0.1:${objectStorePort}`;
  process.env.EMPLOYEE_OBJECT_STORAGE_REGION = 'us-east-1';
  process.env.EMPLOYEE_OBJECT_STORAGE_BUCKET = 'ci-spire-intake';
  process.env.EMPLOYEE_OBJECT_STORAGE_ACCESS_KEY_ID = 'ci-access';
  process.env.EMPLOYEE_OBJECT_STORAGE_SECRET_ACCESS_KEY = 'ci-secret';
  process.env.EMPLOYEE_OBJECT_STORAGE_FORCE_PATH_STYLE = 'true';

  await seed();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, res, next) => {
    res.locals.legalEntityId = req.header('x-test-legal-entity-id') || '';
    next();
  });
  const deps = { authOf: authFor, audit: async () => undefined };
  registerClientIntakeRoutes(app, prisma, deps);
  registerHomeHealthOperationsRoutes(app, prisma, deps);
  registerSclsResidentialRoutes(app, prisma, deps);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = Number(error?.status || 500);
    res.status(Number.isFinite(status) ? status : 500).json({ error: error?.message || String(error), details: error?.details ?? error?.issues ?? null });
  });
  apiServer = http.createServer(app);
  const apiPort = await listen(apiServer);
  const baseUrl = `http://127.0.0.1:${apiPort}`;

  const sclsCase = await request(baseUrl, SCLS_ID, 'POST', '/api/admin/client-intakes', {
    serviceType: 'HPC',
    programCode: 'DODD_HPC',
    referralSource: 'CI database regression',
    referralDate: '2026-08-16',
    firstName: PERSON.firstName,
    middleName: PERSON.middleName,
    lastName: PERSON.lastName,
    preferredName: PERSON.preferredName,
    dateOfBirth: PERSON.dateOfBirth,
    phone: PERSON.phone,
    email: PERSON.email,
    metadata: { regression: 'issue-145', company: 'SCLS' },
  }, 201);
  await completeCatalog(baseUrl, SCLS_ID, sclsCase.id, sclsOverrides());
  await addSclsEvidence(baseUrl, sclsCase.id);
  await addSignatures(baseUrl, SCLS_ID, sclsCase.id);
  const sclsBeforeSubmit = await request(baseUrl, SCLS_ID, 'GET', `/api/admin/client-intakes/${sclsCase.id}`, undefined, 200);
  assert.equal(sclsBeforeSubmit.readiness.ready, true, JSON.stringify(sclsBeforeSubmit.readiness));
  await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${sclsCase.id}/submit`, {}, 200);
  const sclsApproved = await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${sclsCase.id}/review`, { action: 'APPROVE', reviewNotes: 'CI database-backed approval' }, 200);
  assert.equal(sclsApproved.status, 'APPROVED');
  assert.ok(sclsApproved.patientId);
  assert.ok(sclsApproved.promotion?.admissionNoteId, 'Approval must return native SPIRE promotion result');
  const patientId = String(sclsApproved.patientId);

  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatient" WHERE "organizationId"=$1 AND "id"=$2', ORG_ID, patientId), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "ClientEnrollment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3 AND "source"=\'CLIENT_INTAKE\'', ORG_ID, SCLS_ID, patientId), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatientContact" WHERE "organizationId"=$1 AND "patientId"=$2 AND "type" IN (\'PHONE\',\'EMAIL\')', ORG_ID, patientId), 2);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpireEmergencyContact" WHERE "organizationId"=$1 AND "patientId"=$2 AND lower("name")=lower($3)', ORG_ID, patientId, 'Morgan Regression'), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatientIdentifier" WHERE "organizationId"=$1 AND "patientId"=$2 AND "type" IN (\'MEDICAID_ID\',\'MEDICARE_ID\',\'PAYER_MEMBER_ID\')', ORG_ID, patientId), 3);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePayerMemberCoverage" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3', ORG_ID, SCLS_ID, patientId), 3);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatientProxyRelationship" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "status"=\'ACTIVE\'', ORG_ID, SCLS_ID, patientId), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpireConsentDirective" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "source"=\'CLIENT_INTAKE_SIGNATURE\' AND "status"=\'ACTIVE\'', ORG_ID, SCLS_ID, patientId), 3);

  const firstPromotionCounts = await promotionCounts(patientId, sclsCase.id);
  assert.equal(firstPromotionCounts.admissionNotes, 1);
  assert.equal(firstPromotionCounts.carePlans, 1);
  assert.equal(firstPromotionCounts.medReconciliations, 1);
  assert.equal(firstPromotionCounts.medicationOrders, 2);
  assert.equal(firstPromotionCounts.medicationSchedules, 2);
  assert.equal(firstPromotionCounts.authorizations, 1);

  const home = await request(baseUrl, SCLS_ID, 'POST', '/api/scls/residential/homes', {
    name: `CI Regression Home ${run}`,
    address: '202 CI Residential Way, Dayton, OH 45402',
    homeType: 'GROUP_HOME',
    capacity: 4,
    timezone: 'America/New_York',
    emergencyInstructions: 'Follow ISP emergency plan.',
  }, 201);
  const placement = await request(baseUrl, SCLS_ID, 'POST', `/api/scls/residential/homes/${home.id}/residents`, {
    patientId,
    roomLabel: 'CI Room 1',
    bedLabel: 'A',
    placementNotes: 'Issue #145 explicit SCLS home handoff',
    primary: true,
  }, 201);
  assert.equal(String(placement.patientId), patientId);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatientHomeAssignment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "homeId"=$3 AND "patientId"=$4 AND ("endsAt" IS NULL OR "endsAt">NOW())', ORG_ID, SCLS_ID, home.id, patientId), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpireServiceAuthorization" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "authorizationNumber"=$4 AND "status"=\'ACTIVE\'', ORG_ID, SCLS_ID, patientId, IDS.sclsAuthorization), 1);

  await request(baseUrl, SCLS_ID, 'PATCH', `/api/admin/client-intakes/${sclsCase.id}`, { metadata: { regression: 'issue-145', correctionCycle: true } }, 200);
  const reopened = await request(baseUrl, SCLS_ID, 'GET', `/api/admin/client-intakes/${sclsCase.id}`, undefined, 200);
  assert.equal(reopened.case.status, 'REVIEW_REQUIRED');
  await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${sclsCase.id}/submit`, {}, 200);
  const reapproved = await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${sclsCase.id}/review`, { action: 'APPROVE', reviewNotes: 'CI correction-cycle reapproval' }, 200);
  assert.equal(String(reapproved.patientId), patientId);
  await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${sclsCase.id}/promote-to-spire`, {}, 200);
  await request(baseUrl, SCLS_ID, 'POST', `/api/admin/client-intakes/${sclsCase.id}/promote-to-spire`, {}, 200);
  assert.deepEqual(await promotionCounts(patientId, sclsCase.id), firstPromotionCounts, 'Reapproval and repeated promotion must be idempotent');
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatient" WHERE "organizationId"=$1 AND "id"=$2', ORG_ID, patientId), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatientIdentifier" WHERE "organizationId"=$1 AND "patientId"=$2 AND "type" IN (\'MEDICAID_ID\',\'MEDICARE_ID\',\'PAYER_MEMBER_ID\')', ORG_ID, patientId), 3);

  const hhaCase = await request(baseUrl, HHA_ID, 'POST', '/api/admin/client-intakes', {
    serviceType: 'SKILLED_HOME_HEALTH',
    programCode: 'HHA_SOC',
    referralSource: 'CI database regression',
    referralDate: '2026-08-16',
    firstName: PERSON.firstName,
    middleName: PERSON.middleName,
    lastName: PERSON.lastName,
    preferredName: PERSON.preferredName,
    dateOfBirth: PERSON.dateOfBirth,
    phone: PERSON.phone,
    email: PERSON.email,
    metadata: { regression: 'issue-145', company: 'HOME_HEALTH' },
  }, 201);
  await completeCatalog(baseUrl, HHA_ID, hhaCase.id, hhaOverrides());
  await addSignatures(baseUrl, HHA_ID, hhaCase.id);
  const hhaBeforeSubmit = await request(baseUrl, HHA_ID, 'GET', `/api/admin/client-intakes/${hhaCase.id}`, undefined, 200);
  assert.equal(hhaBeforeSubmit.readiness.ready, true, JSON.stringify(hhaBeforeSubmit.readiness));
  await request(baseUrl, HHA_ID, 'POST', `/api/admin/client-intakes/${hhaCase.id}/submit`, {}, 200);
  const hhaApproved = await request(baseUrl, HHA_ID, 'POST', `/api/admin/client-intakes/${hhaCase.id}/review`, { action: 'APPROVE', existingPatientId: patientId, reviewNotes: 'CI Home Health approval to existing shared SPIRE chart' }, 200);
  assert.equal(String(hhaApproved.patientId), patientId);
  assert.ok(hhaApproved.promotion?.admissionNoteId);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatient" WHERE "organizationId"=$1', ORG_ID), 1, 'SCLS and Home Health admissions must share one durable patient identity');
  assert.equal(await count('SELECT count(*)::int AS count FROM "ClientEnrollment" WHERE "organizationId"=$1 AND "clientId"=$2 AND "status"=\'ACTIVE\'', ORG_ID, patientId), 2);
  assert.equal(await count('SELECT count(*)::int AS count FROM "ClientEnrollment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3 AND "source"=\'CLIENT_INTAKE\'', ORG_ID, HHA_ID, patientId), 1);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePayerMemberCoverage" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3', ORG_ID, HHA_ID, patientId), 3);
  assert.equal(await count('SELECT count(*)::int AS count FROM "SpirePatientIdentifier" WHERE "organizationId"=$1 AND "patientId"=$2 AND "type" IN (\'MEDICAID_ID\',\'MEDICARE_ID\',\'PAYER_MEMBER_ID\')', ORG_ID, patientId), 3, 'Shared identifiers must not duplicate across company admissions');

  const episode = await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/from-intake/${hhaCase.id}`, { requestedStartOfCareDate: '2026-08-17' }, 201);
  const episodeAgain = await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/from-intake/${hhaCase.id}`, { requestedStartOfCareDate: '2026-08-17' }, 200);
  assert.equal(String(episodeAgain.id), String(episode.id));
  assert.equal(episodeAgain.existing, true);
  await request(baseUrl, HHA_ID, 'PATCH', `/api/home-health/episodes/${episode.id}`, {
    requestedStartOfCareDate: '2026-08-17',
    primaryDiagnosis: 'Essential hypertension',
    referringProviderName: 'Dr CI Referral',
    certifyingProviderName: 'Dr CI Certifier',
    faceToFaceDate: '2026-08-15',
    faceToFaceStatus: 'COMPLETE',
    homeboundStatus: 'MEETS',
    homeboundRationale: 'Leaving home requires considerable and taxing effort for this CI fixture.',
    skilledNeed: 'Skilled nursing assessment, medication teaching, and cardiopulmonary monitoring.',
    payerName: 'CI Ohio Medicaid Plan',
    memberId: IDS.member,
    authorizationNumber: IDS.hhaAuthorization,
  }, 200);
  const plan = await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/${episode.id}/plan-of-care`, {
    effectiveDate: '2026-08-17',
    endDate: '2026-10-15',
    ordersSummary: 'SN assessment and education per physician-approved plan.',
    goals: 'Patient/caregiver will demonstrate safe medication management and report worsening symptoms.',
    frequencyDurationSummary: 'SN 2w2 then 1w4.',
    physicianName: 'Dr CI Certifier',
    physicianNpi: '1234567890',
    physicianOrderDate: '2026-08-16',
    physicianSignedAt: '2026-08-16T18:00:00.000Z',
    physicianSignatureMethod: 'Electronic signature',
  }, 200);
  await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/${episode.id}/plan-of-care/${plan.id}/status`, { action: 'SUBMIT_REVIEW' }, 200);
  await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/${episode.id}/plan-of-care/${plan.id}/status`, { action: 'ACTIVATE' }, 200);
  await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/${episode.id}/discipline-orders`, {
    planOfCareId: plan.id,
    discipline: 'SN',
    serviceType: 'Skilled Nursing',
    frequency: '2w2 then 1w4',
    duration: '6 weeks',
    visitLimit: 8,
    startDate: '2026-08-17',
    endDate: '2026-09-27',
    goals: 'Assess cardiopulmonary status and reinforce medication safety.',
    interventions: 'Skilled assessment, education, care coordination.',
    orderedByProvider: 'Dr CI Certifier',
  }, 201);
  const episodeReady = await request(baseUrl, HHA_ID, 'GET', `/api/home-health/episodes/${episode.id}`, undefined, 200);
  assert.equal(episodeReady.readiness.ready, true, JSON.stringify(episodeReady.readiness));
  const activated = await request(baseUrl, HHA_ID, 'POST', `/api/home-health/episodes/${episode.id}/activate`, {
    startOfCareDate: '2026-08-17',
    certificationPeriodStart: '2026-08-17',
    certificationPeriodEnd: '2026-10-15',
  }, 200);
  assert.equal(activated.status, 'ACTIVE');
  const episodeRows = await prisma.$queryRawUnsafe<Array<{ patientId: string; status: string }>>('SELECT "patientId","status" FROM "HomeHealthEpisode" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3', ORG_ID, HHA_ID, episode.id);
  assert.equal(String(episodeRows[0]?.patientId), patientId);
  assert.equal(String(episodeRows[0]?.status), 'ACTIVE');

  console.log(JSON.stringify({
    regression: 'ISSUE_145_DATABASE_BACKED_INTAKE_TO_SPIRE',
    patientId,
    sclsIntakeCaseId: sclsCase.id,
    hhaIntakeCaseId: hhaCase.id,
    sclsHomeId: home.id,
    homeHealthEpisodeId: episode.id,
    durablePatientCount: await count('SELECT count(*)::int AS count FROM "SpirePatient" WHERE "organizationId"=$1', ORG_ID),
    activeEnrollmentCount: await count('SELECT count(*)::int AS count FROM "ClientEnrollment" WHERE "organizationId"=$1 AND "clientId"=$2 AND "status"=\'ACTIVE\'', ORG_ID, patientId),
    status: 'PASS',
  }, null, 2));
}

try {
  await main();
} finally {
  if (apiServer) await new Promise<void>(resolve => apiServer!.close(() => resolve()));
  if (objectStore.listening) await new Promise<void>(resolve => objectStore.close(() => resolve()));
  await prisma.$disconnect();
}
