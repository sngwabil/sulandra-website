import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/onboarding-bootstrap.ts');
const importLine="import { registerEmployeeSupportRoutes } from './employee-support-routes.js';";
const registerLine='registerEmployeeSupportRoutes({ app, prisma, authOf, requireRoles });';
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
let source=await readFile(target,'utf8');
if(!source.includes(importLine)){
  if(!source.includes(careersImport))throw new Error('Unable to locate Careers import anchor for employee support routes');
  source=source.replace(careersImport,`${careersImport}\n${importLine}`);
}
source=source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!source.includes(careersRegister))throw new Error('Unable to locate Careers registration anchor for employee support routes');
source=source.replace(careersRegister,`${registerLine}\n\n${careersRegister}`);
await writeFile(target,source,'utf8');
console.log('Employee support request routes are registered before Careers.');

// SIA is part of the same authenticated employee-support surface. Chaining its
// idempotent installer here keeps API typecheck/build flows aligned without
// duplicating route registration commands across package scripts.
await import('./install-sia-routes.mjs');

// IT Solutions extends the canonical SIA support surface. Keep the richer 1.0
// SIA implementation intact, then register the section-9 IT routes immediately
// after SIA so every support workflow keeps the SIA-first diagnosis boundary.
await import('./install-it-solutions-powerhouse.mjs');

// The privileged owner/admin IT Agent workbench sits behind IT Solutions. It may
// execute only its allowlisted operational tools after explicit Admin review;
// code/system changes remain controlled engineering handoffs.
await import('./install-it-agent-workbench.mjs');

// Section 9C resolves approved code-change handoffs into a dedicated, exact-repo
// Codex worker. It is fail-closed unless explicitly enabled and remains PR-only.
await import('./install-it-coding-worker.mjs');

// Section 9D turns the same support chain into a durable IT Specialist: ticket
// continuity with SIA, current repository/approved-work knowledge, autonomous
// established-operation repair after gates, and owner approval for major work.
await import('./install-it-specialist-autonomy.mjs');

// Employee education is an operational IT workflow, not a code-change request.
// Keep one campaign through draft -> review -> revision -> explicit send, then
// store completion/attestation in the canonical EducationAssignment record.
await import('./install-it-agent-training-workflow.mjs');

// Status questions are read-only conversations, not work orders. Answer draft/
// sent state directly, avoid unnecessary assignment joins before distribution,
// and keep read-only status checks out of the Action Center.
await import('./fix-it-agent-readonly-training-status.mjs');

// Keep the Administrator-facing reply natural: create/update, provide a real
// clickable review label, then wait for the Administrator to choose revise/send.
await import('./install-it-agent-conversational-review-ux.mjs');

// The review/attestation page is a required production artifact. The canonical
// static builder must fail instead of silently omitting it.
await import('./install-it-agent-training-publication.mjs');

// Preserve the reasoning/coding safety boundary while extending the Administrator
// workbench with explicit external email, secure file/image uploads, multimodal
// attachment reasoning, PDF creation, and standalone image generation.
await import('./install-it-agent-artifact-capabilities.mjs');

// The root build invokes this support chain more than once in a shared workspace.
// Normalize repeated capability flags and resolve the explicit Administrator route
// allowlist before TypeScript compilation so every build remains deterministic.
await import('./fix-it-agent-artifact-build-idempotency.mjs');
