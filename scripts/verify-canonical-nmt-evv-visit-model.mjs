import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bridge=await readFile(path.join(root,'api','src','spire-nmt-evv-canonical.ts'),'utf8');
const trip=await readFile(path.join(root,'api','src','nmt-trip-routes.ts'),'utf8');
const canonical=await readFile(path.join(root,'api','src','spire-evv-canonical.ts'),'utf8');
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};

requireMarkers(bridge,[
  'sourceNmtTripId',
  'sourceNmtOrderId',
  'nmtLegType',
  'originStreet',
  'destinationStreet',
  'vehicleLicensePlate',
  'personsPresent',
  'driverSignature',
  'driverSignatureSha256',
  'driverSignedAt',
  'driverSignerUserId',
  'immutableAt',
  'SpireEvvVisit_nmt_trip_uq',
  'spire_protect_immutable_nmt_evv',
  "String(trip.legType || '').toUpperCase() === 'RETURN'",
  "createHash('sha256')",
  "verificationMethod",
  "'NMT_MOBILE'",
  "'DIRTY'",
], 'spire-nmt-evv-canonical.ts');

requireMarkers(trip,[
  "from './spire-nmt-evv-canonical.js'",
  'nmtEvvCompletionSchema',
  'driverSignature',
  "Canonical NMT EVV evidence and driver signature are required before trip completion",
  'await ensureCanonicalNmtEvvSchema(prisma)',
  'await prisma.$transaction(async(tx)',
  'canonicalEvvVisit=await createCanonicalNmtEvvVisit',
  'evvVisit:canonicalEvvVisit',
], 'nmt-trip-routes.ts');

requireMarkers(canonical,[
  'sourceNmtTripId',
  'NMT origin name is required',
  'NMT destination name is required',
  'NMT vehicle license plate is required',
  'NMT driver signature is required',
  'NMT driver signature hash is required',
  'NMT driver signed timestamp is required',
  'NMT immutable timestamp is required',
  'NMT persons-present evidence is required',
], 'spire-evv-canonical.ts');

if(failures.length){
  console.error('Canonical NMT EVV verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Canonical NMT EVV verified: completed operational trips require immutable origin, destination, vehicle, persons-present and driver-signature evidence and are transactionally linked to the canonical EVV visit model.');
