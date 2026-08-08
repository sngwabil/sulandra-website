import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];const checks=[];
const exists=async p=>{try{await access(path.join(root,p));return true}catch{return false}};
const read=p=>readFile(path.join(root,p),'utf8');
const expect=(label,condition)=>{checks.push(label);if(!condition)failures.push(label)};

const backend='api/src/employee-documents-esign-routes.ts';
expect('document backend exists',await exists(backend));
if(await exists(backend)){
  const s=await read(backend);
  expect('templates and envelopes',s.includes('EmployeeDocumentTemplate')&&s.includes('EmployeeDocumentEnvelope'));
  expect('signature audit evidence',s.includes('signatureHash')&&s.includes('ipAddress')&&s.includes('userAgent'));
  expect('employee document dashboard',s.includes('/api/employee/me/documents'));
  expect('employee signing endpoint',s.includes('/api/employee/me/documents/:envelopeId/sign'));
  expect('admin dashboard and assignment',s.includes('/api/admin/employee-documents/dashboard')&&s.includes('/api/admin/employee-documents/envelopes'));
  expect('manager and witness signing',s.includes('/api/admin/employee-documents/envelopes/:envelopeId/sign'));
  expect('void decline cancellation',s.includes('/api/admin/employee-documents/envelopes/:envelopeId/status'));
  expect('owner protection',s.includes('The Enterprise Owner document record cannot be changed by another user'));
  expect('auditor read only',s.includes('Auditor document access is read only'));
  expect('organization isolation',s.includes('auth.organizationId')&&s.includes('"organizationId"=$1'));
  expect('document events and audit',s.includes('EmployeeDocumentEvent')&&s.includes('audit?.'));
}
const migration='prisma/migrations/20260806193000_employee_documents_esign/migration.sql';
expect('documents migration exists',await exists(migration));
if(await exists(migration)){
  const s=await read(migration);
  expect('all document tables',['EmployeeDocumentTemplate','EmployeeDocumentEnvelope','EmployeeDocumentSignature','EmployeeDocumentEvent'].every(x=>s.includes(x)));
  expect('status and signature constraints',s.includes('EmployeeDocumentEnvelope_status_check')&&s.includes('EmployeeDocumentSignature_type_check'));
  expect('signature uniqueness',s.includes('EmployeeDocumentSignature_signer_unique'));
  expect('event json constraint',s.includes('EmployeeDocumentEvent_details_object_check'));
}
const installer=await read('scripts/install-employee-management-platform.mjs');
expect('documents routes registered',installer.includes('registerEmployeeDocumentsESignRoutes'));
const bootstrap=await read('api/src/onboarding-bootstrap.ts');
const documentsAt=bootstrap.indexOf('registerEmployeeDocumentsESignRoutes({ app, prisma');
const careersAt=bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('documents routes before careers',documentsAt>=0&&careersAt>documentsAt);
const employeeAsset=await read('assets/employee-documents-self-service.js');
expect('My Documents employee frontend',employeeAsset.includes('My Documents')&&employeeAsset.includes('/api/employee/me/documents'));
expect('employee signing UI',employeeAsset.includes('Sign document')&&employeeAsset.includes('electronic signature'));
expect('employee mobile UI',employeeAsset.includes('@media(max-width:600px)'));
const adminAsset=await read('assets/admin-employee-documents.js');
expect('Admin document center',adminAsset.includes('Employee 360 Documents & E-Signatures'));
expect('template creation UI',adminAsset.includes('Create Document Template'));
expect('assignment UI',adminAsset.includes('Assign Document'));
expect('void and decline UI',adminAsset.includes('data-void')&&adminAsset.includes('data-decline'));
expect('admin mobile UI',adminAsset.includes('@media(max-width:850px)'));
const selfInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee document asset published',selfInstaller.includes('/assets/employee-documents-self-service.js'));
const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin document asset published',adminInstaller.includes('/assets/admin-employee-documents.js'));
if(failures.length){console.error(`Employee 360 documents/e-sign verification failed (${failures.length}/${checks.length}):`);failures.forEach(x=>console.error(` - ${x}`));process.exit(1)}
console.log(`Employee 360 documents/e-sign verification passed (${checks.length} checks).`);
