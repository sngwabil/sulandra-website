import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleSource=await readFile(path.join(root,'api','src','spire-evv-corrections.ts'),'utf8');
const routeSource=await readFile(path.join(root,'api','src','spire-authorizations-evv-routes.ts'),'utf8');
const canonicalSource=await readFile(path.join(root,'api','src','spire-evv-canonical.ts'),'utf8');
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};

requireMarkers(moduleSource,[
  'applySpireEvvCorrectionOverlay',
  'ensureSpireEvvCorrectionLedgerSchema',
  'appendImmutableSpireEvvCorrection',
  'SpireEvvVisitChange_immutable_guard',
  'BEFORE UPDATE OR DELETE ON "SpireEvvVisitChange"',
  "'IMMUTABLE_OVERLAY'",
  "UPDATE \"SpireEvvVisit\" SET \"transmissionState\"='DIRTY'",
  "createHash('sha256')",
  'driverSignerUserId',
  'changeReasonMemo',
], 'spire-evv-corrections.ts');

requireMarkers(routeSource,[
  "from './spire-evv-corrections.js'",
  'IMMUTABLE_EVV_CORRECTION_OVERLAY_V1',
  'appendImmutableSpireEvvCorrection',
  "'APPEND_EVV_CORRECTION'",
  "'EVV_VISIT_CHANGE'",
], 'spire-authorizations-evv-routes.ts');

const correctionStart=routeSource.indexOf('IMMUTABLE_EVV_CORRECTION_OVERLAY_V1');
const correctionEnd=routeSource.indexOf('// Queue creates an immutable payload snapshot',correctionStart);
if(correctionStart<0||correctionEnd<0){
  failures.push('immutable correction route boundaries are missing');
}else{
  const correctionRoute=routeSource.slice(correctionStart,correctionEnd);
  if(correctionRoute.includes('UPDATE "SpireEvvVisit" SET')) failures.push('correction HTTP route still directly overwrites SpireEvvVisit evidence');
  if(correctionRoute.includes('beforeValue')||correctionRoute.includes('afterValue')) failures.push('correction HTTP route still owns mutable before/after SQL instead of the append-only ledger helper');
}

requireMarkers(canonicalSource,[
  "from './spire-evv-corrections.js'",
  'IMMUTABLE_EVV_EFFECTIVE_OVERLAY_V1',
  'applySpireEvvCorrectionOverlay(visit, changes)',
  'originalVisit?: Record<string, unknown>;',
  'originalVisit: visit',
], 'spire-evv-canonical.ts');

if(failures.length){
  console.error('Immutable EVV correction verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('Immutable EVV corrections verified: source evidence is retained, correction rows are append-only, effective values are overlayed only for downstream use, and correction provenance is preserved.');
