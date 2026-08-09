import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [migration, entityHelper, careers, interviews, offerSend, offerAcceptance, offerProgress, offerOnboarding, forms, w4, onboarding] = await Promise.all([
  read('prisma/migrations/20260809000000_careers_offers_onboarding_entity_conversion/migration.sql'),
  read('api/src/careers-entity.ts'),
  read('api/src/careers-routes.ts'),
  read('api/src/interview-scheduling-routes.ts'),
  read('api/src/offer-send-route.ts'),
  read('api/src/offer-acceptance-pdf-route.ts'),
  read('api/src/offer-progress-route.ts'),
  read('api/src/offer-onboarding-routes.ts'),
  read('api/src/professional-offer-forms-route.ts'),
  read('api/src/w4-routes.ts'),
  read('api/src/employee360-secure-files-routes.ts'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(migration.includes('ALTER COLUMN "legalEntityId" SET NOT NULL'), 'Converted careers tables do not require company ownership');
expect(migration.includes('Department_org_entity_id_key'), 'Company/department composite integrity is not defined');
expect(migration.includes('FOREIGN KEY ("organizationId","legalEntityId","departmentId")'), 'Hiring records can reference another company\'s department');
expect(migration.includes('PRIMARY KEY ("organizationId","legalEntityId")'), 'Company settings are not company-specific');
expect(migration.includes('JobOpening_entity_slug_key'), 'Job opening slugs are not unique within each company');
expect(migration.includes('EmployeeApplication_entity_sourceExternalId_key'), 'External application IDs are not isolated by company');
expect(migration.includes('InterviewSlot_entity_starts_key'), 'Interview times are not isolated by company');

expect(entityHelper.includes("requestedCode?.trim().toUpperCase() || 'SCLS'"), 'Public careers do not preserve the SCLS default');
expect(entityHelper.includes('"status"=\'ACTIVE\' AND "isEmployer"=true'), 'Public careers can expose a planned or non-employer company');
expect(entityHelper.includes('requireDepartmentMatch(access, department.id)'), 'Hiring department selection does not enforce department access');
expect(careers.includes('"organizationId"=$1 AND "legalEntityId"=$2'), 'Job opening listing is not company-scoped');
expect(careers.includes('"id","organizationId","legalEntityId","departmentId","jobOpeningId"'), 'Applications do not persist company and department ownership');
expect(careers.includes('access.departmentId'), 'Admin careers views do not honor the selected department');

expect(interviews.includes('ON CONFLICT ("organizationId","legalEntityId")'), 'Company settings still use organization-only conflict handling');
expect(interviews.includes('ON CONFLICT ("organizationId","legalEntityId","startsAt")'), 'Interview slot locking still conflicts across companies');
expect(interviews.includes('"id","organizationId","legalEntityId","departmentId","applicationId"'), 'Interview invitations do not persist company and department ownership');
expect(interviews.includes('s."legalEntityId"=$3'), 'Public interview slots are not tied to the invitation company');
expect(interviews.includes('settings.companyName'), 'Interview messages are not branded for the hiring company');

expect(offerSend.includes('"id","organizationId","legalEntityId","departmentId","applicationId"'), 'Employment offers do not persist company and department ownership');
expect(offerSend.includes('requireEntityManageAccess(access)'), 'Offer creation does not require company management access');
expect(offerSend.includes('companyName = hiringCompany.displayName'), 'Offer email branding does not use the hiring company');
expect(offerProgress.includes('o."legalEntityId"=$3'), 'Admin offer progress is not selected-company scoped');
expect(offerAcceptance.includes('a."legalEntityId"=o."legalEntityId"'), 'Public offer acceptance does not verify company ownership across the offer and application');
expect(offerAcceptance.includes("offer.legalEntityName || 'Sulandra Health'"), 'Signed offer PDFs do not use the hiring company');
expect(offerOnboarding.includes('entity."displayName" AS "legalEntityName"'), 'Public offer details omit the hiring company');
expect(forms.includes('entity."displayName" AS "legalEntityName"'), 'Professional offer forms omit the hiring company');
expect(w4.includes('entity."legalName" AS "employerLegalName"'), 'Form W-4 does not use the employing company legal name');
expect(w4.includes('o."legalEntityId"=$3'), 'Admin W-4 download is not selected-company scoped');

expect(onboarding.includes('"EmployeeOnboardingLink" ("id","organizationId","legalEntityId","departmentId"'), 'Onboarding links do not persist company and department ownership');
expect(onboarding.includes('"EmployeeOnboardingSnapshot" ("id","organizationId","legalEntityId","departmentId"'), 'Onboarding snapshots do not persist company and department ownership');
expect(onboarding.includes('FROM "Employment" WHERE "organizationId"=$1 AND "legalEntityId"=$2'), 'Applicant conversion does not verify employment in the selected company');
expect(onboarding.includes('requireEntityManageAccess(access)'), 'Onboarding conversion does not require company management access');

if (failures.length) {
  console.error(`Careers entity conversion verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Careers entity conversion verified: openings, applications, interviews, offers, tax forms, and onboarding are isolated and branded by company, with department-aware administration.');
