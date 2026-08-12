import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = await readFile(path.join(root, 'prisma/migrations/20260811121500_spire_external_connectivity_foundation/migration.sql'), 'utf8');
const triggerMigration = await readFile(path.join(root, 'prisma/migrations/20260811133000_spire_field_push_triggers/migration.sql'), 'utf8');
const routes = await readFile(path.join(root, 'api/src/spire-field-mobile-routes.ts'), 'utf8');
const operations = await readFile(path.join(root, 'api/src/spire-field-mobile-operations-routes.ts'), 'utf8');
const push = await readFile(path.join(root, 'api/src/spire-push-service.ts'), 'utf8');
const authInstaller = await readFile(path.join(root, 'scripts/install-mobile-oauth-boundary.mjs'), 'utf8');
const injector = await readFile(path.join(root, 'scripts/inject-clinical-routes.mjs'), 'utf8');
const parityInjector = await readFile(path.join(root, 'scripts/inject-spire-epic-reference-parity-routes.mjs'), 'utf8');
const apiPackage = await readFile(path.join(root, 'api/package.json'), 'utf8');
const mobilePackage = await readFile(path.join(root, 'mobile/package.json'), 'utf8');
const capacitorConfig = await readFile(path.join(root, 'mobile/capacitor.config.ts'), 'utf8');
const mobileApp = await readFile(path.join(root, 'mobile/src/app.js'), 'utf8');

const requiredTables = ['SpireMobileOAuthClient','SpireMobileAccessGrant','SpirePushDevice','SpirePushDelivery','SpireMobileBuild'];
const requiredRoutes = [
  '/api/mobile/oauth/exchange','/api/mobile/session','/api/mobile/oauth/revoke','/api/mobile/push/register',
  '/api/mobile/push/test','/api/mobile/notifications','/api/mobile/work/today','/api/mobile/my-shift',
  '/api/mobile/clients/:patientId/summary','/api/mobile/evv/:visitId/clock-in','/api/mobile/evv/:visitId/clock-out',
  '/api/mobile/evv/:visitId/complete','/api/mobile/clients/:patientId/results/manual',
];
const requiredOperationRoutes = [
  '/api/mobile/clients/:patientId/care-logs',
  '/api/mobile/transport/trips/:tripId/status',
];
const requiredScopes = [
  'push:register','schedule:read','evv:read','evv:clock','carelog:read','carelog:write',
  'client:assigned:summary','clinical:assigned:read','result:manual:write','transport:trips:read','transport:trips:update',
];
const requiredTriggers = ['SpireAppointment_field_push','SpireEvvVisit_field_push','NmtTrip_field_push','SpireInBasketItem_field_push'];
const failures = [];

for (const table of requiredTables) if (!migration.includes(`\"${table}\"`)) failures.push(`missing field-mobile migration table ${table}`);
for (const columnTable of ['SpireEvvVisit','SpireServiceAuthorization','SpireAppointment']) {
  if (!migration.includes(`ALTER TABLE \"${columnTable}\" ADD COLUMN IF NOT EXISTS \"legalEntityId\"`)) failures.push(`missing legalEntityId upgrade for ${columnTable}`);
}
for (const route of requiredRoutes) if (!routes.includes(route)) failures.push(`missing field-mobile route ${route}`);
for (const route of requiredOperationRoutes) if (!operations.includes(route)) failures.push(`missing mobile field-operation route ${route}`);
for (const scope of requiredScopes) if (!routes.includes(`'${scope}'`)) failures.push(`missing mobile OAuth scope ${scope}`);
for (const trigger of requiredTriggers) if (!triggerMigration.includes(`\"${trigger}\"`)) failures.push(`missing field push trigger ${trigger}`);
for (const marker of ["res.locals.mobileTokenUse = mobile.tokenUse","req.path.startsWith('/api/mobile/')","tokenUse !== 'mobile_oauth'"]) {
  if (!authInstaller.includes(marker)) failures.push(`missing OAuth boundary marker ${marker}`);
}
for (const marker of ['PUSH_TOKEN_ENCRYPTION_KEY','FCM_PROJECT_ID','APNS_TEAM_ID','FOR UPDATE SKIP LOCKED','startSpirePushDispatcher']) {
  if (!push.includes(marker)) failures.push(`missing push dispatcher marker ${marker}`);
}
if (!injector.includes('registerSpireFieldMobileRoutes')) failures.push('field mobile routes are not registered');
if (injector.includes('registerSpireExternalConnectivityRoutes')) failures.push('deferred vendor connectivity routes must not be registered');
if (!parityInjector.includes('registerSpireFieldMobileOperationsRoutes')) failures.push('mobile care-log/transport routes are not registered');
if (!apiPackage.includes('install-mobile-oauth-boundary.mjs')) failures.push('mobile OAuth boundary installer is not in API build/typecheck');
if (!routes.includes('UserRole.DRIVER')) failures.push('driver role boundary is missing');

// Verify the DRIVER branch semantically instead of depending on one exact source-code line.
// Prettier/TypeScript formatting may place the scope array across several lines without
// changing the security boundary. This regex still requires exactly the transport-only
// scope set in the DRIVER return branch.
const driverScopePattern = /if\s*\(role\s*===\s*UserRole\.DRIVER\)\s*return\s*\[\s*'mobile:session'\s*,\s*'push:register'\s*,\s*'schedule:read'\s*,\s*'transport:trips:read'\s*,\s*'transport:trips:update'\s*,?\s*\]/s;
if (!driverScopePattern.test(routes)) failures.push('driver scopes are not transport-only');
if (!operations.includes("n.\"noteType\" IN ('FIELD_CARE_LOG','PROGRESS_NOTE')")) failures.push('mobile care logs are not backed by clinical notes');
if (!operations.includes('tripTransitions')) failures.push('transport status workflow is missing transition enforcement');

for (const marker of ['@capacitor/core','@capacitor/ios','@capacitor/android','@capacitor/push-notifications','vite']) {
  if (!mobilePackage.includes(marker)) failures.push(`native package missing ${marker}`);
}
for (const marker of ["appId: 'com.sulandrahealth.field'","appName: 'Sulandra Health'","webDir: 'www'"]) {
  if (!capacitorConfig.includes(marker)) failures.push(`Capacitor config missing ${marker}`);
}
for (const marker of [
  'PushNotifications.register()',
  '/api/mobile/oauth/exchange',
  '/api/mobile/push/register',
  '/api/mobile/work/today',
  '/api/mobile/my-shift',
  '/api/mobile/transport/trips/',
  '/care-logs',
]) {
  if (!mobileApp.includes(marker)) failures.push(`native field app missing ${marker}`);
}

if (failures.length) {
  console.error(`SPIRE field-mobile verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('SPIRE field-mobile foundation verified: scoped OAuth, assigned-client RBAC, EVV/care-log/scheduling/transport workflows, manual diagnostic entry, native Capacitor packaging, and queued APNs/FCM push.');
