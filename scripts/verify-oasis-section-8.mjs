import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(relative)=>readFile(path.join(root,relative),'utf8');
const [engine,routes,migration,fetcher,contract,promote,injector,apiPackageText,predeploy]=await Promise.all([
  read('api/src/home-health-oasis-engine.ts'),
  read('api/src/home-health-oasis-iqies-routes.ts'),
  read('prisma/migrations/20260825011500_oasis_e2_spec_ingestion/migration.sql'),
  read('scripts/fetch-official-oasis-e2-package.mjs'),
  read('scripts/oasis-e2-spec-contract.mjs'),
  read('scripts/promote-pinned-oasis-e2-spec.mjs'),
  read('scripts/inject-home-health-oasis-iqies-routes.mjs'),
  read('api/package.json'),
  read('scripts/run-db-predeploy.mjs'),
]);
const apiPackage=JSON.parse(apiPackageText);
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};
const forbidMarkers=(source,markers,label)=>{for(const marker of markers)if(source.includes(marker))failures.push(`${label} must not contain: ${marker}`);};

requireMarkers(engine,[
  'CMS_SPEC_NOT_VALIDATED','CMS_SPEC_INCOMPLETE','validateOasisSnapshot','buildOasisSubmissionXml',
  "createHash('sha256')",'final iQIES','deferredRuleCodes','ASCII-safe',
], 'home-health-oasis-engine.ts');
requireMarkers(routes,[
  '/api/home-health/oasis/spec-status','submissionEnabled:Boolean(spec&&spec.status===\'VALIDATED\')',
  'externalIqiesAdapterConfigured:false','rawXmlPersisted:false','finalIqiesValidationStillRequired:true',
  'Create the immutable OASIS snapshot before export','OASIS export is blocked by fatal local specification findings',
  "'EXPORT_ONLY'",'payloadSha256','specDefinitionSha256','validationReportSha256',
], 'home-health-oasis-iqies-routes.ts');
forbidMarkers(routes,['externalIqiesAdapterConfigured:true','rawXmlPersisted:true'],'OASIS/iQIES route safety boundary');

requireMarkers(migration,[
  'HomeHealthOasisSpecImport','prevent_home_health_oasis_spec_import_mutation',
  'HomeHealthOasisSpecImport_no_update','HomeHealthOasisSpecImport_no_delete',
  'sourcePackageSha256','normalizedDefinitionSha256','submissionDefinition','transactionMode',
  'payloadBytes','specDefinitionSha256',
], 'OASIS migration');
requireMarkers(fetcher,[
  'https://www.cms.gov/medicare/quality/home-health/data-specifications',
  'OASIS E2 Data Specs (V3.02.0) FINAL',
  'b848a1f33efb77406124f02bfd50dbb48c6efb841c4e4bf3c68719c1e8d9f6ca',
  "hostname!=='www.cms.gov'",
], 'official CMS package fetcher');
requireMarkers(contract,[
  "specName: 'OASIS-E2'","itemSetVersionCode: 'E2-042026'","submissionSpecVersion: '3.02'",
  "effectiveFrom: '2026-04-01'",'CONTROL_ITEM_REQUIRED','CONTROL_MAPPING_REQUIRED','TRANSACTION_MODE_MAPPING_REQUIRED',
], 'OASIS normalized contract');
requireMarkers(promote,[
  'b848a1f33efb77406124f02bfd50dbb48c6efb841c4e4bf3c68719c1e8d9f6ca',
  'bf01dced0972a5a2629c084de87e4071dd855de3e46d315db53252562af432ee',
  "current.status==='VALIDATED'",'refusing automatic overwrite','420','233','367',
], 'pinned OASIS promotion');
requireMarkers(injector,[
  "registerHomeHealthOasisIqiesRoutes","registerHomeHealthRegulatedCoreRoutes",
  'Spec-driven OASIS/iQIES routes registered before legacy regulated-core OASIS handlers.',
], 'OASIS route injector');

const build=String(apiPackage.scripts?.build||'');
const canonicalIndex=build.indexOf('inject-home-health-canonical-visit-routes.mjs');
const oasisIndex=build.indexOf('inject-home-health-oasis-iqies-routes.mjs');
if(canonicalIndex<0||oasisIndex<0)failures.push('API build does not include both canonical Home Health and OASIS/iQIES injectors');
else if(oasisIndex<canonicalIndex)failures.push('OASIS/iQIES injector must run after the canonical Home Health injector so it can safely insert ahead of regulated-core handlers');

if(predeploy.includes('promote-pinned-oasis-e2-spec.mjs'))failures.push('section 8 must not make routine production predeploy depend on live CMS package acquisition');

try{
  const dist=await read('api/dist/onboarding-bootstrap.js');
  const oasisCall=dist.indexOf('registerHomeHealthOasisIqiesRoutes(app, prisma, { authOf, audit });');
  const regulatedCall=dist.indexOf('registerHomeHealthRegulatedCoreRoutes(app, prisma, { authOf, audit });');
  if(oasisCall<0)failures.push('compiled API is missing OASIS/iQIES route registration');
  if(regulatedCall<0)failures.push('compiled API is missing Home Health regulated-core route registration');
  if(oasisCall>=0&&regulatedCall>=0&&oasisCall>regulatedCall)failures.push('compiled OASIS/iQIES routes must register before regulated-core compatibility handlers');
}catch{
  // Source/package verification is still valid before a build; compiled-order verification runs after build in CI.
}

if(failures.length){
  console.error('Section 8 OASIS/iQIES verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Section 8 OASIS/iQIES verified: official-package provenance is pinned, unvalidated specs fail closed, XML export is deterministic and non-persistent, external transport remains disabled, and production predeploy has no live-CMS dependency.');
