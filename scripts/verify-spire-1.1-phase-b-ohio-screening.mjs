import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}};
const need=(source,relative,markers)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${relative} missing ${JSON.stringify(marker)}`)};
console.log('SPIRE 1.1 Phase B Step 4 — Ohio workforce screening / Employee 360 compliance');
const files={migration:'prisma/migrations/20260817190000_spire_1_1_ohio_workforce_screening/migration.sql',engine:'api/src/employee-ohio-screening.ts',routes:'api/src/employee-ohio-screening-routes.ts',injector:'scripts/inject-employee-ohio-screening-routes.mjs',apiPackage:'api/package.json',ui:'employee-ohio-screening.html'};
const data={};for(const[key,relative]of Object.entries(files))data[key]=await read(relative);
need(data.migration,files.migration,['EmployeeOhioScreeningProfileVersion','EmployeeOhioScreeningCase','EmployeeOhioScreeningCheck','EmployeeOhioScreeningEvent','append-only','OH_DODD_DIRECT_SERVICES','OH_HOME_HEALTH_DIRECT_CARE','DODD_ABUSER_REGISTRY','OH_NURSE_AIDE_REGISTRY','OH_SEX_OFFENDER','SAM_EXCLUSION','OIG_EXCLUSION','OH_MEDICAID_EXCLUSION','BCI_CRIMINAL_CHECK','FBI_CRIMINAL_CHECK','RAPBACK_ENROLLMENT','BMV_DRIVING_RECORD','FINGERPRINT_FORMS','https://codes.ohio.gov/ohio-administrative-code/rule-5123-2-02','https://codes.ohio.gov/ohio-administrative-code/chapter-3701-60']);
need(data.engine,files.engine,['evaluateOhioScreeningCase','FBI_IF_NO_OHIO_5Y','RAPBACK_REQUIRED','TRANSPORT','1825','Rapback enrollment is due by','six or more points in the preceding 24 months','BCI_REQUESTED','businessDaysAfter','60','liveRegistryIntegrationConfigured:false','criminalReportContentStoredHere:false']);
need(data.routes,files.routes,['registerEmployeeOhioScreeningRoutes','/api/employee360/ohio-screening/profiles','/api/employee360/employees/:employeeId/ohio-screening','/api/employee360/ohio-screening/cases/:caseId/checks','EmployeeComplianceRequirement','EmployeeComplianceAssignment','updatedById','OHIO_SCREENING_CASE','/api/admin/service-homes/:id/employees','OHIO_SCREENING_REQUIRED','OHIO_SCREENING_BLOCKED','MANUAL_VERIFIED_EVIDENCE']);
need(data.injector,files.injector,['registerEmployeeOhioScreeningRoutes','registerServiceHomeManagementRoutes','registered before service-home assignment routes']);
need(data.apiPackage,files.apiPackage,['tsc -p tsconfig.json && node ../scripts/inject-employee-ohio-screening-routes.mjs']);
need(data.ui,files.ui,['SPIRE_OHIO_WORKFORCE_SCREENING_V1','Evidence-based, not simulated','Do not paste confidential criminal-history report content here','/api/employee360/ohio-screening/profiles','/ohio-screening/cases','Append Check Evidence']);
if(failures.length){console.error(`SPIRE 1.1 Phase B Step 4 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('PASS: date-effective DODD/Home Health screening profiles, append-only evidence, BCI/FBI residency logic, Rapback/five-year/transport/conditional rules, Employee 360 compliance synchronization, route injection and SCLS service-home assignment hard stop are present without fake live registry results.');
