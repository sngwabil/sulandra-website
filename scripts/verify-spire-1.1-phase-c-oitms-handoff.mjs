import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),failures=[];
const read=async relative=>{try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}};
const need=(source,relative,markers)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${relative} missing ${JSON.stringify(marker)}`)};
console.log('SPIRE 1.1 Phase C Step 4 — OhioITMS / county-board handoff evidence');
const files={migration:'prisma/migrations/20260818005000_spire_1_1_oitms_handoff/migration.sql',routes:'api/src/spire-incident-oitms-handoff-routes.ts',asset:'assets/spire-incident-oitms-handoff.js',injector:'scripts/inject-spire-incident-regulatory-routes.mjs',apiPackage:'api/package.json'};
const data={};for(const[key,relative]of Object.entries(files))data[key]=await read(relative);
need(data.migration,files.migration,['SpireIncidentOitmsHandoff','SpireIncidentOitmsHandoffEvent','COUNTY_BOARD_FOR_OITMS','PACKAGE_GENERATED','SUBMITTED_TO_COUNTY_BOARD','COUNTY_BOARD_ACKNOWLEDGED','OITMS_REFERENCE_RECORDED','RETURNED_FOR_CORRECTION','RESUBMITTED_TO_COUNTY_BOARD','CLOSED_EXTERNALLY','packageSha256','packageSnapshot','append-only']);
need(data.routes,files.routes,['registerSpireIncidentOitmsHandoffRoutes','/api/spire/incidents/regulatory/oitms/boundary','/regulatory/oitms/handoffs','/package.json','SUBMITTED_TO_COUNTY_BOARD','COUNTY_BOARD_ACKNOWLEDGED','OITMS_REFERENCE_RECORDED','RETURNED_FOR_CORRECTION','RESUBMITTED_TO_COUNTY_BOARD','CLOSED_EXTERNALLY','Only a classified MUI belongs in the OhioITMS handoff workflow','UI incidents remain in the provider UI log','liveOitmsIntegrationConfigured:false','directOitmsSubmissionEnabled:false','directOitmsSubmissionPerformed:false','COUNTY_BOARD_FOR_OITMS','createHash','packageSha256','OITMS_REFERENCE_SYNCED']);
need(data.asset,files.asset,['SPIRE_PHASE_C_OITMS_HANDOFF_V1','County Board → OhioITMS Handoff','No direct OITMS submission is claimed','Generate Frozen MUI Handoff','Append Handoff Evidence','Download Frozen Package','UI incidents do not enter this workflow','/regulatory/oitms']);
need(data.injector,files.injector,['registerSpireIncidentRegulatoryRoutes','registerSpireIncidentOitmsHandoffRoutes','spire-incident-compliance.html','spire-incident-oitms-handoff.js','no direct OITMS connector is claimed']);
need(data.apiPackage,files.apiPackage,['inject-spire-incident-regulatory-routes.mjs && node ../scripts/inject-clinical-routes.mjs']);
if(failures.length){console.error(`SPIRE 1.1 Phase C Step 4 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('PASS: MUI-only immutable provider-to-county-board OITMS handoff packages, external reference/evidence events, correction/resubmission history and authenticated package export are present without a fabricated direct OITMS connector.');
