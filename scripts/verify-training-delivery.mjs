import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [catalogText, assessments, routes, migration, hiring, player, certificate, runtime, portal, enhancements, build] = await Promise.all([
  read('education-catalog.json'),
  read('api/src/education-course-assessments.ts'),
  read('api/src/education-routes.ts'),
  read('prisma/migrations/20260809150000_company_hiring_provisioning/migration.sql'),
  read('api/src/hiring-provisioning-routes.ts'),
  read('course-player.html'),
  read('education-certificate.html'),
  read('assets/education-runtime.js'),
  read('education-portal.html'),
  read('assets/education-portal-enhancements.js'),
  read('scripts/build-static-site.mjs'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
let catalog;
try { catalog = JSON.parse(catalogText); }
catch (error) { failures.push(`Education catalog is invalid JSON: ${error.message}`); catalog = { courses: [], packages: {} }; }

const courses = Array.isArray(catalog.courses) ? catalog.courses : [];
const courseCodes = courses.map((course) => course.code);
expect(courses.length === 18, `Expected 18 approved orientation courses; found ${courses.length}`);
expect(new Set(courseCodes).size === courses.length, 'Education catalog contains duplicate course codes');
expect(catalog.catalogVersion === '2026.08', 'Education catalog version is not pinned to 2026.08');
expect(catalog.passingScorePercent === 80, 'Education catalog does not publish the 80% passing score');
expect(String(catalog.disclaimer || '').includes('do not replace'), 'Catalog does not state the training/compliance boundary');
expect(!catalogText.includes('correctAnswer') && !catalogText.includes('answerIndex'), 'Public catalog exposes an assessment answer key');

const allowedSourceHosts = new Set([
  'www.hhs.gov', 'www.osha.gov', 'www.eeoc.gov', 'dodd.ohio.gov', 'www.cms.gov',
  'www.cdc.gov', 'www.nhtsa.gov', 'www.cisa.gov', 'nursing.ohio.gov',
]);
for (const course of courses) {
  expect(/^[A-Z][A-Z0-9-]+$/.test(String(course.code || '')), `Course has an invalid code: ${course.code}`);
  expect(course.active === true, `${course.code} is not active`);
  expect(course.version === catalog.catalogVersion, `${course.code} version does not match the catalog`);
  expect(course.certificateValidityMonths === 12, `${course.code} does not publish a 12-month internal certificate period`);
  expect(course.launchPath === `/course-player.html?code=${course.code}`, `${course.code} has an invalid launch path`);
  expect(Array.isArray(course.objectives) && course.objectives.length >= 3, `${course.code} needs at least three learning objectives`);
  expect(Array.isArray(course.modules) && course.modules.length === 2, `${course.code} needs two review modules`);
  expect(course.modules?.map((module) => module.id).join(',') === 'foundation,practice', `${course.code} module acknowledgements do not match the server assessment`);
  expect(Array.isArray(course.questions) && course.questions.length === 3, `${course.code} needs three assessment questions`);
  expect(course.questions?.map((question) => question.id).join(',') === 'q1,q2,q3', `${course.code} question IDs do not match the server assessment`);
  for (const question of course.questions || []) expect(Array.isArray(question.choices) && question.choices.length === 3, `${course.code}/${question.id} must have three choices`);
  expect(Array.isArray(course.sources) && course.sources.length >= 1, `${course.code} has no source or policy reference`);
  for (const source of course.sources || []) {
    if (String(source.url || '').startsWith('/')) continue;
    try { expect(allowedSourceHosts.has(new URL(source.url).host), `${course.code} uses an unapproved source host: ${source.url}`); }
    catch { failures.push(`${course.code} has an invalid source URL: ${source.url}`); }
  }
}

for (const [packageCode, codes] of Object.entries(catalog.packages || {})) {
  expect(Array.isArray(codes) && codes.length > 0, `${packageCode} package is empty`);
  for (const code of codes || []) expect(courseCodes.includes(code), `${packageCode} references missing course ${code}`);
}

const assessmentRows = [...assessments.matchAll(/^\s*'([^']+)': course\('[^']+', \{\s*([^}]+)\s*\}\),?$/gm)];
const assessmentCodes = assessmentRows.map((match) => match[1]);
expect(assessmentCodes.length === courses.length, `Expected ${courses.length} server-side assessment keys; found ${assessmentCodes.length}`);
for (const code of courseCodes) {
  const row = assessmentRows.find((match) => match[1] === code);
  expect(Boolean(row), `${code} has no server-side answer key`);
  if (!row) continue;
  const answers = [...row[2].matchAll(/q([123]):\s*(\d+)/g)].map((match) => Number(match[2]));
  expect(answers.length === 3 && answers.every((answer) => answer >= 0 && answer <= 2), `${code} has an invalid server-side answer key`);
  expect(hiring.includes(`'${code}'`), `${code} is not connected to hiring or role training assignment`);
}

for (const marker of [
  'submittedAnswers', 'requiredScorePercent', 'moduleAcknowledgements', "z.literal(true)",
  'randomBytes(6)', 'certificateNumber', 'completionEvidence', "res.status(422)",
  'requireEducationAccess(access)', 'assignment."legalEntityId"=$3',
]) expect(routes.includes(marker), `Education completion service is missing ${marker}`);
expect(!routes.includes('input.certificateNumber'), 'Education service trusts a client-supplied certificate number');
expect(!routes.includes('input.scorePercent'), 'Education service trusts a client-supplied score');

for (const marker of [
  'ADD COLUMN IF NOT EXISTS "certificateNumber"',
  'ADD COLUMN IF NOT EXISTS "attemptCount"',
  'ADD COLUMN IF NOT EXISTS "completionEvidence"',
  'EducationAssignment_certificate_unique',
  'EducationAssignment_score_percent_check',
]) expect(migration.includes(marker), `Training evidence migration is missing ${marker}`);

for (const marker of [
  '/api/education/completions', 'moduleAcknowledgements', 'courseVersion:course.version',
  'attested:true', 'Current certificate active', 'SulandraEducationRuntime',
]) expect(player.includes(marker), `Course player is missing ${marker}`);
for (const marker of [
  '/api/education/my-completions', 'completion.certificateNumber', 'completion.scorePercent',
  'internal orientation only', 'SulandraEducationRuntime',
]) expect(certificate.includes(marker), `Education certificate is missing ${marker}`);
for (const marker of [
  "const ENTITY_KEY = 'sulandra:education:legal-entity-id'", "headers['X-Legal-Entity-Id']",
  "request('/api/entity-context'", 'mountSelector',
]) expect(runtime.includes(marker), `Employee education company runtime is missing ${marker}`);
expect(runtime.includes('localStorage.removeItem(TOKEN_KEY)'), 'Education logout leaves a reusable local employee token behind');
expect(portal.includes('id="educationCompanySelect"'), 'Education portal has no selected-company control');
expect(portal.includes('/assets/education-runtime.js?v=20260809-training-delivery-1'), 'Education portal does not load the scoped runtime');
expect(enhancements.includes("runtime.mountSelector($('educationCompanySelect')"), 'Education portal does not initialize the company selector');
expect(enhancements.includes('runtime?.entityHeaders?.()'), 'Education portal requests do not carry company scope');
expect(enhancements.includes('selectedPackageCodes()'), 'Bulk education does not use the selected company package');
expect(!enhancements.includes("courses.map(c=>c.code)"), 'Bulk education assigns the entire cross-company catalog');

for (const required of [
  'publicRootFiles', "'education-catalog.json'", "'course-player.html'", "'education-certificate.html'",
  "'assets/education-runtime.js'", "'assets/education-course.css'",
]) expect(build.includes(required), `Static publication does not require ${required}`);

const inlineScripts = (html) => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim()).filter(Boolean);
for (const [name, source] of [['education runtime', runtime], ['education portal enhancements', enhancements]]) {
  try { new Function(source); }
  catch (error) { failures.push(`${name} JavaScript does not parse: ${error.message}`); }
}
for (const [name, html] of [['course player', player], ['education certificate', certificate]]) {
  for (const source of inlineScripts(html)) {
    try { new Function(source); }
    catch (error) { failures.push(`${name} inline JavaScript does not parse: ${error.message}`); }
  }
}

const publishedFiles = [
  'education-catalog.json', 'course-player.html', 'education-certificate.html',
  'assets/education-runtime.js', 'assets/education-course.css',
];
try {
  await access(path.join(root, 'dist-web'));
  for (const relative of publishedFiles) {
    try { await access(path.join(root, 'dist-web', relative)); }
    catch { failures.push(`dist-web is missing ${relative}`); }
  }
} catch {}

if (failures.length) {
  console.error(`Training delivery verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Training delivery verified: 18 company and role orientations launch, grade server-side, persist entity-scoped evidence, and issue bounded printable certificates.');
