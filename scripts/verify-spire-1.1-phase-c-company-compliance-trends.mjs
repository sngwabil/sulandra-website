import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}};
const need=(source,relative,markers)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${relative} missing ${JSON.stringify(marker)}`)};
console.log('SPIRE 1.1 Phase C Step 3 — Company Compliance annual trends / audit-ready exports');
const files={migration:'prisma/migrations/20260818004000_spire_1_1_company_compliance_annual_analysis/migration.sql',routes:'api/src/company-compliance-trend-routes.ts',asset:'assets/company-compliance-trends.js',injector:'scripts/inject-company-compliance-qa-routes.mjs',apiPackage:'api/package.json'};
const data={};for(const[key,relative]of Object.entries(files))data[key]=await read(relative);
need(data.migration,files.migration,['CompanyComplianceAnnualQaAnalysis','monthlyMetrics','yearTotals','priorYearComparison','trendSignals','sourcePacketIds','snapshotSha256','prevent_company_compliance_annual_qa_mutation','immutable; create a new version instead']);
need(data.routes,files.routes,['registerCompanyComplianceTrendRoutes','/api/company-compliance/qa/trends','/api/company-compliance/qa/trends.csv','/exceptions.csv','/api/company-compliance/qa/annual-analyses','/file.json','SpireEvvPrebillDecision','SpireDoddBillingValidationDecision','RevenueCycleClaimExchangeEvent','RevenueCycleRemittance','EmployeeOhioScreeningEvent','SpireIncidentRegulatoryCase','CompanyComplianceAuditPacket','RECORDED_ACTIVITY_COUNTS','noCausalInference:true','noExternalCertificationClaim:true','noExternalSubmissionAttestation:true','snapshotSha256']);
need(data.asset,files.asset,['SPIRE_1_1_COMPANY_COMPLIANCE_TRENDS_V1','Annual Quality Trends & Exports','Monthly CSV','Latest Packet Exceptions CSV','Generate Annual Analysis','Immutable Annual Analysis History','/api/company-compliance/qa/trends','/api/company-compliance/qa/annual-analyses']);
need(data.injector,files.injector,['registerCompanyComplianceQaRoutes','registerCompanyComplianceTrendRoutes','company-compliance.html','company-compliance-qa.js','company-compliance-trends.js','annual trend/export panels attached to the existing Company Compliance page']);
need(data.apiPackage,files.apiPackage,['inject-company-compliance-qa-routes.mjs']);
if(failures.length){console.error(`SPIRE 1.1 Phase C Step 3 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('PASS: annual recorded-activity trends, prior-year comparisons, versioned immutable SHA-256 annual analyses and authenticated CSV/JSON exports are wired into existing Company Compliance without causal or external certification/submission claims.');
