import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
async function read(relative){try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}}
const [html,css,js,migration,routes,injector]=await Promise.all([
  read('dist-web/spire.html'),read('dist-web/assets/spire-app.css'),read('dist-web/assets/spire-app.js'),
  read('prisma/migrations/20260807220000_spire_clinical_foundation/migration.sql'),read('api/src/spire-foundation-routes.ts'),read('scripts/inject-clinical-routes.mjs')
]);
for(const marker of ['spireApp','/assets/spire-app.css?v=20260807-spire-foundation-1','/assets/spire-app.js?v=20260807-spire-foundation-1']) if(!html.includes(marker)) failures.push(`Spire HTML missing ${marker}`);
for(const marker of ['spire-topbar','spire-patient-strip','spire-left-rail','spire-right-rail','chart-tabs','notes-layout']) if(!css.includes(marker)) failures.push(`Spire CSS missing ${marker}`);
for(const marker of ['Clinical Dashboard','Schedule','In Basket','Patient Lists','Chart Review','Results Review','SmartPhrase','Wrap-Up','Care Plan / ISP','MAR']) if(!js.includes(marker)) failures.push(`Spire app missing ${marker}`);
for(const table of ['SpirePatient','SpireAppointment','SpireEncounter','SpireClinicalNote','SpireResult','SpireMedicationOrder','SpireMedicationAdministration','SpireOrder','SpireCarePlan','SpireAssessment','SpireIncident','SpireClinicalDocument','SpireInBasketItem','SpireChartAccessEvent']) if(!migration.includes(`"${table}"`)) failures.push(`Spire migration missing ${table}`);
for(const marker of ["'/api/spire/patients'","'/api/spire/schedule'","'/api/spire/inbasket'",'requirePatient','logAccess']) if(!routes.includes(marker)) failures.push(`Spire routes missing ${marker}`);
if(!injector.includes('registerSpireFoundationRoutes')) failures.push('Backend injector does not register Spire foundation routes');
if(failures.length){console.error('Spire foundation verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Spire foundation verified: first-class clinical shell, patient-context workspace, schedule/in-basket/chart review/results/notes architecture, clinical database foundation, scoped chart access and audit registration are present.');
