import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routePath=path.join(root,'api','src','spire-authorizations-evv-routes.ts');
const canonicalPath=path.join(root,'api','src','spire-evv-canonical.ts');

let route=await readFile(routePath,'utf8');
const correctionImport="import { appendImmutableSpireEvvCorrection } from './spire-evv-corrections.js';";
if(!route.includes(correctionImport)){
  const anchor='type A = {';
  if(!route.includes(anchor))throw new Error('Immutable EVV correction installer could not find route import anchor');
  route=route.replace(anchor,`${correctionImport}\n\n${anchor}`);
}

if(!route.includes('IMMUTABLE_EVV_CORRECTION_OVERLAY_V1')){
  const start='  // Manual changes never overwrite original clock evidence.';
  const end='  // Queue creates an immutable payload snapshot';
  const startIndex=route.indexOf(start);
  const endIndex=route.indexOf(end,startIndex);
  if(startIndex<0||endIndex<0)throw new Error('Immutable EVV correction installer could not locate the legacy correction route');
  const replacement=`  // IMMUTABLE_EVV_CORRECTION_OVERLAY_V1\n  // Corrections append a reason-99 overlay and never overwrite original EVV/NMT evidence.\n  app.post('/api/spire/patients/:patientId/evv/visits/:visitId/corrections', async (req, res, next) => {\n    try {\n      const a = authOf(res), pid = req.params.patientId;\n      await scope(p, a, pid, true);\n      if (!a.email) throw evvHttpError(409, 'A signed-in user email is required for EVV correction provenance');\n      const result = await appendImmutableSpireEvvCorrection(p, {\n        organizationId: a.organizationId,\n        legalEntityId: a.legalEntityId ?? null,\n        patientId: pid,\n        visitId: req.params.visitId,\n        actorUserId: a.userId,\n        actorEmail: a.email,\n        body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>,\n      });\n      await audit(p, a, pid, 'APPEND_EVV_CORRECTION', 'EVV_VISIT_CHANGE',\n        String((result.correction as Record<string, unknown>)?.id || req.params.visitId), {\n          visitId: req.params.visitId,\n          changedKeys: result.changedKeys,\n          reasonCode: result.reasonCode,\n          changeReasonMemo: result.changeReasonMemo,\n        });\n      res.status(201).json({ data: result });\n    } catch (e) { next(e); }\n  });\n\n`;
  route=route.slice(0,startIndex)+replacement+route.slice(endIndex);
}
await writeFile(routePath,route,'utf8');

let canonical=await readFile(canonicalPath,'utf8');
const overlayImport="import { applySpireEvvCorrectionOverlay } from './spire-evv-corrections.js';";
if(!canonical.includes(overlayImport)){
  const importAnchor="import type { PrismaClient } from '@prisma/client';";
  if(!canonical.includes(importAnchor))throw new Error('Immutable EVV correction installer could not find canonical import anchor');
  canonical=canonical.replace(importAnchor,`${importAnchor}\n${overlayImport}`);
}
if(!canonical.includes('originalVisit?: Record<string, unknown>;')){
  const typeAnchor='export type CanonicalEvvSnapshot = {\n  visit: Record<string, unknown>;';
  if(!canonical.includes(typeAnchor))throw new Error('Immutable EVV correction installer could not find canonical snapshot type');
  canonical=canonical.replace(typeAnchor,`${typeAnchor}\n  originalVisit?: Record<string, unknown>;`);
}
if(!canonical.includes('IMMUTABLE_EVV_EFFECTIVE_OVERLAY_V1')){
  const returnAnchor='  return { visit, calls, changes };';
  if(!canonical.includes(returnAnchor))throw new Error('Immutable EVV correction installer could not find canonical snapshot return');
  canonical=canonical.replace(returnAnchor,`  // IMMUTABLE_EVV_EFFECTIVE_OVERLAY_V1\n  const effectiveVisit = applySpireEvvCorrectionOverlay(visit, changes);\n  return { visit: effectiveVisit, originalVisit: visit, calls, changes };`);
}
await writeFile(canonicalPath,canonical,'utf8');

console.log('Immutable EVV corrections installed: original visit/NMT evidence remains unchanged, corrections are append-only overlays, and downstream canonical payloads use the effective overlay.');
