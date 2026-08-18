import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}};
const need=(source,relative,markers)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${relative} missing ${JSON.stringify(marker)}`)};
console.log('SPIRE 1.1 Phase C Step 2 — Company Compliance QA / immutable audit packets');
const files={migration:'prisma/migrations/20260818003000_spire_1_1_company_compliance_audit_packets/migration.sql',routes:'api/src/company-compliance-qa-routes.ts',asset:'assets/company-compliance-qa.js',injector:'scripts/inject-company-compliance-qa-routes.mjs',apiPackage:'api/package.json'};
const data={};for(const[key,relative]of Object.entries(files))data[key]=await read(relative);
need(data.migration,files.migration,['CompanyComplianceAuditPacket','snapshotSha256','sourceIndex','exceptionSummary','prevent_company_compliance_audit_packet_mutation','immutable; generate a new packet instead']);
need(data.routes,files.routes,['registerCompanyComplianceQaRoutes','/api/company-compliance/qa/summary','/api/company-compliance/qa/packets','/file.json','SpireEvvTransmission','SpireEvvPrebillDecision','SpireDoddBillingValidationDecision','RevenueCycleClaimSubmission','RevenueCycleRemittance','RevenueCycleExternalWorkflow','EmployeeOhioScreeningCase','SpireIncidentRegulatoryCase','SpireIncidentRegulatoryDeadline','SpireIncidentUiMonthlyReview','CompanyComplianceItem','directElectronicSubmissionConfigured:false','liveRegistryIntegrationConfigured:false','liveOitmsIntegrationConfigured:false','createHash','snapshotSha256']);
need(data.asset,files.asset,['SPIRE_1_1_COMPANY_COMPLIANCE_QA_V1','Regulatory QA & Audit Packets','EVV','DODD Billing','Claims / 835','Workforce Screening','UI / MUI','Company Register','Generate Audit Packet','Download JSON','/api/company-compliance/qa/summary','/api/company-compliance/qa/packets']);
need(data.injector,files.injector,['registerCompanyComplianceQaRoutes','registerCareersRoutes','company-compliance.html','company-compliance-qa.js','existing Company Compliance page']);
need(data.apiPackage,files.apiPackage,['inject-company-compliance-qa-routes.mjs']);
if(failures.length){console.error(`SPIRE 1.1 Phase C Step 2 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('PASS: existing Company Compliance owns the cross-system QA command center; EVV, DODD billing, claims/remittance, Ohio workforce screening, UI/MUI and company-register evidence feed immutable SHA-256 audit packets without claiming external certification or submission.');
