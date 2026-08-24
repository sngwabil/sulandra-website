import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const bootstrapPath = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');
const source = await readFile(bootstrapPath, 'utf8');

const requiredCalls = [
  'registerSpireFoundationRoutes(app, prisma, { authOf });',
  'registerSpireChartRoutes(app, prisma, { authOf });',
  'registerSpireOrderComposerRoutes(app, prisma, { authOf });',
  'registerSpireEmarRoutes(app, prisma, { authOf });',
  'registerSpireMedicationQualificationRoutes(app, prisma, { authOf });',
  'registerSpireCarePlanRoutes(app, prisma, { authOf });',
  'registerSpireOhioIspRoutes(app, prisma, { authOf, audit });',
  'registerSpireOhioIspRepositoryRoutes(app, prisma, { authOf, audit });',
  'registerSpireIncidentManagementRoutes(app, prisma, { authOf });',
  'registerSpireAssessmentsFlowsheetsRoutes(app, prisma, { authOf });',
  'registerSpireSchedulingRoutes(app, prisma, { authOf });',
  'registerSpireEvvAdapterRoutes(app, prisma, { authOf });',
  'registerSpireAuthorizationsEvvRoutes(app, prisma, { authOf });',
  'registerSpireDoddServiceDocumentationRoutes(app, prisma, { authOf, audit });',
  'registerSpireDocumentsExternalRecordsRoutes(app, prisma, { authOf });',
  'registerSpireCommunicationsInBasketRoutes(app, prisma, { authOf });',
  'registerSpireFieldMobileRoutes(app, prisma, { authOf });',
  'registerHomeHealthReferralRoutes(app, prisma, { authOf, audit });',
  'registerHomeHealthStartOfCareRoutes(app, prisma, { authOf, audit });',
  'registerHomeHealthOperationsRoutes(app, prisma, { authOf, audit });',
  'registerRevenueCycleRoutes(app, prisma, { authOf, audit });',
  'registerSpireDoddBillingRuleRoutes(app, prisma, { authOf });',
  'registerRevenueCycleClaimExchangeRoutes(app, prisma, { authOf, audit });',
  'registerSpireIncidentRegulatoryRoutes(app, prisma, { authOf });',
  'registerSpireIncidentOitmsHandoffRoutes(app, prisma, { authOf });',
  'registerEmployeeOhioScreeningRoutes(app, prisma, { authOf });',
  'registerCompanyComplianceQaRoutes(app, prisma, { authOf, audit });',
  'registerCompanyComplianceTrendRoutes(app, prisma, { authOf, audit });',
];

const missing = requiredCalls.filter((call) => !source.includes(call));
if (missing.length > 0) {
  console.error(`[route-parity] FAIL: ${missing.length} required runtime route registrations are missing from api/dist/onboarding-bootstrap.js`);
  for (const call of missing) console.error(`[route-parity] missing: ${call}`);
  process.exitCode = 1;
} else {
  console.log(`[route-parity] PASS: ${requiredCalls.length}/${requiredCalls.length} required SPIRE/runtime route registration calls are present in the final API bootstrap artifact.`);
}
