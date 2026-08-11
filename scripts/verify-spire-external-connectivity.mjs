import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migration=await readFile(path.join(root,'prisma/migrations/20260811121500_spire_external_connectivity_foundation/migration.sql'),'utf8');
const routes=await readFile(path.join(root,'api/src/spire-external-connectivity-routes.ts'),'utf8');
const injector=await readFile(path.join(root,'scripts/inject-clinical-routes.mjs'),'utf8');
const requiredTables=['SpireIntegrationEndpoint','SpireIntegrationMessage','SpireImagingStudyLink','SpireLabInterfaceRecord','SpireDeviceFeedRegistration','SpireX12Transaction','SpireErxTransaction','SpirePdmpQuery','SpireTelehealthSession','SpireSmartClient','SpireOAuthAuthorization','SpirePushDevice','SpirePushDelivery','SpireMobileBuild'];
const requiredRoutes=['/api/spire/integrations/endpoints','/api/spire/patients/:patientId/imaging/studies','/api/spire/patients/:patientId/lis/records','/api/spire/patients/:patientId/device-feeds','/api/spire/revenue/x12','/api/spire/patients/:patientId/erx','/api/spire/patients/:patientId/pdmp/query','/api/spire/telehealth/sessions','/api/spire/smart/clients','/api/spire/mobile/push/register','/api/spire/mobile/builds'];
const failures=[];
for(const table of requiredTables) if(!migration.includes(`"${table}"`)) failures.push(`missing migration table ${table}`);
for(const route of requiredRoutes) if(!routes.includes(route)) failures.push(`missing route ${route}`);
if(!injector.includes('registerSpireExternalConnectivityRoutes')) failures.push('external connectivity routes are not registered');
if(failures.length){console.error(`SPIRE external connectivity verification failed:\n- ${failures.join('\n- ')}`);process.exit(1);}
console.log('SPIRE external connectivity foundation verified: PACS/LIS/device feeds, X12, eRx/PDMP, telehealth, SMART/OAuth, push, and mobile build registry.');
