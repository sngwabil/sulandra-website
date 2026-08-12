import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(target, 'utf8');

const importMarker = "import { registerCareersRoutes } from './careers-routes.js';";
const callMarker = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';

const imports = [
  "import { registerSpireCompanyBoundaryRoutes } from './spire-company-boundary-routes.js';",
  "import { registerOperationalComplianceBoundary } from './operational-compliance-boundary.js';",
  "import { registerClientIntakeRoutes } from './client-intake-routes.js';",
  "import { registerSclsResidentialRoutes } from './scls-residential-routes.js';",
  "import { registerSclsTaskRoutes } from './scls-task-routes.js';",
  "import { registerNmtReferralRoutes } from './nmt-referral-routes.js';",
  "import { registerNmtDispatchRoutes } from './nmt-dispatch-routes.js';",
  "import { registerHomeHealthReferralRoutes } from './home-health-referral-routes.js';",
  "import { registerHomeHealthStartOfCareRoutes } from './home-health-start-of-care-routes.js';",
  "import { registerHomeHealthOperationsRoutes } from './home-health-operations-routes.js';",
  "import { registerWorkforceRoutes } from './workforce-routes.js';",
  "import { registerWorkforceAdvancedRoutes } from './workforce-advanced-routes.js';",
  "import { registerEnterpriseWorkNotificationRoutes } from './enterprise-work-notification-routes.js';",
  "import { registerCompanyComplianceRoutes } from './company-compliance-routes.js';",
  "import { registerCompanyComplianceEvidenceRoutes } from './company-compliance-evidence-routes.js';",
  "import { registerRevenueCycleRoutes } from './revenue-cycle-routes.js';",
  "import { registerEnterpriseDataQualityRoutes } from './enterprise-data-quality-routes.js';",
  "import { registerEnterpriseAnalyticsRoutes } from './enterprise-analytics-routes.js';",
  "import { registerSecurityAuditRoutes } from './security-audit-routes.js';",
  "import { registerPlatformReadinessRoutes } from './platform-readiness-routes.js';",
  "import { registerSpireTrainingRoutes } from './spire-training-routes.js';",
  "import { registerCompanyDocumentRoutes } from './company-document-routes.js';",
  "import { registerCompanySettingsRoutes } from './company-settings-routes.js';",
  "import { registerClinicalRoutes } from './clinical-routes.js';",
  "import { registerSpireNetworkHomeAccessRoutes } from './spire-network-home-access-routes.js';",
  "import { registerSpireNoteCosignerGuard } from './spire-note-cosigner-guard.js';",
  "import { registerSpireFoundationRoutes } from './spire-foundation-routes.js';",
  "import { registerSpireChartRoutes } from './spire-chart-routes.js';",
  "import { registerSpireOrderComposerRoutes } from './spire-order-composer-routes.js';",
  "import { registerSpireEmarRoutes } from './spire-emar-routes.js';",
  "import { registerSpireMedicationQualificationRoutes } from './spire-medication-qualification-routes.js';",
  "import { registerSpireCarePlanRoutes } from './spire-care-plan-routes.js';",
  "import { registerSpireCarePlanLifecycleRoutes } from './spire-care-plan-lifecycle-routes.js';",
  "import { registerSpireShiftWorkspaceRoutes } from './spire-shift-workspace-routes.js';",
  "import { registerSpireIncidentManagementRoutes } from './spire-incident-management-routes.js';",
  "import { registerSpireAssessmentsFlowsheetsRoutes } from './spire-assessments-flowsheets-routes.js';",
  "import { registerSpireFlowsheetWorkspaceRoutes } from './spire-flowsheet-workspace-routes.js';",
  "import { registerSpireSchedulingRoutes } from './spire-scheduling-routes.js';",
  "import { registerSpireAuthorizationsEvvRoutes } from './spire-authorizations-evv-routes.js';",
  "import { registerSpireDocumentsExternalRecordsRoutes } from './spire-documents-external-records-routes.js';",
  "import { registerSpireCommunicationsInBasketRoutes } from './spire-communications-inbasket-routes.js';",
  "import { registerSpireWorkspaceAssigneeGuard } from './spire-workspace-assignee-guard.js';",
  "import { registerSpireWorkspaceCompletionRoutes } from './spire-workspace-completion-routes.js';",
  "import { registerSpireFieldMobileRoutes } from './spire-field-mobile-routes.js';",
  "import { registerOfferProgressRoute } from './offer-progress-route.js';",
  "import { registerOfferSendRoute } from './offer-send-route.js';",
  "import { registerOfferAcceptancePdfRoute } from './offer-acceptance-pdf-route.js';",
  "import { registerProfessionalOfferFormsRoute } from './professional-offer-forms-route.js';",
  "import { registerOfferOnboardingRoutes } from './offer-onboarding-routes.js';",
  "import { registerW4Routes } from './w4-routes.js';"
];

const calls = [
  'registerSpireCompanyBoundaryRoutes(app, prisma, { authOf });',
  'registerOperationalComplianceBoundary(app, prisma, { authOf });',
  'registerClientIntakeRoutes(app, prisma, { authOf, audit });',
  'registerSclsResidentialRoutes(app, prisma, { authOf, audit });',
  'registerSclsTaskRoutes(app, prisma, { authOf, audit });',
  'registerNmtReferralRoutes(app, prisma, { authOf, audit });',
  'registerNmtDispatchRoutes(app, prisma, { authOf });',
  'registerHomeHealthReferralRoutes(app, prisma, { authOf, audit });',
  'registerHomeHealthStartOfCareRoutes(app, prisma, { authOf, audit });',
  'registerHomeHealthOperationsRoutes(app, prisma, { authOf, audit });',
  'registerWorkforceRoutes(app, prisma, { authOf, audit });',
  'registerWorkforceAdvancedRoutes(app, prisma, { authOf, audit });',
  'registerEnterpriseWorkNotificationRoutes(app, prisma, { authOf, audit });',
  'registerCompanyComplianceRoutes(app, prisma, { authOf, audit });',
  'registerCompanyComplianceEvidenceRoutes(app, prisma, { authOf, audit });',
  'registerRevenueCycleRoutes(app, prisma, { authOf, audit });',
  'registerEnterpriseDataQualityRoutes(app, prisma, { authOf, audit });',
  'registerEnterpriseAnalyticsRoutes(app, prisma, { authOf });',
  'registerSecurityAuditRoutes(app, prisma, { authOf, audit });',
  'registerPlatformReadinessRoutes(app, prisma, { authOf });',
  'registerSpireTrainingRoutes(app, prisma, { authOf });',
  'registerCompanyDocumentRoutes(app, prisma, { authOf, audit });',
  'registerCompanySettingsRoutes(app, prisma, { authOf, audit });',
  'registerClinicalRoutes(app, prisma, { authOf });',
  'registerSpireNetworkHomeAccessRoutes(app, prisma, { authOf });',
  'registerSpireNoteCosignerGuard(app, prisma, { authOf });',
  'registerSpireFoundationRoutes(app, prisma, { authOf });',
  'registerSpireChartRoutes(app, prisma, { authOf });',
  'registerSpireOrderComposerRoutes(app, prisma, { authOf });',
  'registerSpireEmarRoutes(app, prisma, { authOf });',
  'registerSpireMedicationQualificationRoutes(app, prisma, { authOf });',
  'registerSpireCarePlanRoutes(app, prisma, { authOf });',
  'registerSpireCarePlanLifecycleRoutes(app, prisma, { authOf });',
  'registerSpireShiftWorkspaceRoutes(app, prisma, { authOf });',
  'registerSpireIncidentManagementRoutes(app, prisma, { authOf });',
  'registerSpireAssessmentsFlowsheetsRoutes(app, prisma, { authOf });',
  'registerSpireFlowsheetWorkspaceRoutes(app, prisma, { authOf });',
  'registerSpireSchedulingRoutes(app, prisma, { authOf });',
  'registerSpireAuthorizationsEvvRoutes(app, prisma, { authOf });',
  'registerSpireDocumentsExternalRecordsRoutes(app, prisma, { authOf });',
  'registerSpireCommunicationsInBasketRoutes(app, prisma, { authOf });',
  'registerSpireWorkspaceAssigneeGuard(app, prisma, { authOf });',
  'registerSpireWorkspaceCompletionRoutes(app, prisma, { authOf, audit });',
  'registerSpireFieldMobileRoutes(app, prisma, { authOf });',
  'registerOfferProgressRoute(app, prisma, { authOf, requireRoles });',
  'registerOfferSendRoute(app, prisma, { authOf, requireRoles, audit });',
  'registerOfferAcceptancePdfRoute(app, prisma, { audit });',
  'registerProfessionalOfferFormsRoute(app, prisma);',
  'registerOfferOnboardingRoutes(app, prisma, { authOf, requireRoles, audit });',
  'registerW4Routes(app, prisma, { authOf, requireRoles, audit });'
];

if (!source.includes(importMarker) || !source.includes(callMarker)) {
  throw new Error(`Route injection markers not found in ${target}`);
}
for (const statement of imports) {
  if (!source.includes(statement)) source = source.replace(importMarker, `${importMarker}\n${statement}`);
}
for (const statement of calls) {
  if (!source.includes(statement)) source = source.replace(callMarker, `${statement}\n${callMarker}`);
}
await writeFile(target, source, 'utf8');
console.log(`Registered the complete SPIRE enterprise, continuous flowsheet and field-mobile route set in ${target}.`);
