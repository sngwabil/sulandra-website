import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bootstrapPath=path.join(root,'api','src','onboarding-bootstrap.ts');
const siaPath=path.join(root,'api','src','sia-routes.ts');
const supportPath=path.join(root,'api','src','employee-support-routes.ts');
const autonomyPath=path.join(root,'api','src','it-specialist-autonomy.ts');

let bootstrap=await readFile(bootstrapPath,'utf8');
const workerImport="import { registerITCodingWorkerRoutes } from './it-coding-worker.js';";
const specialistImport="import { registerITSpecialistAutonomyRoutes } from './it-specialist-autonomy.js';";
if(!bootstrap.includes(specialistImport)){
  if(!bootstrap.includes(workerImport))throw new Error('Trusted coding-worker import anchor missing for IT Specialist');
  bootstrap=bootstrap.replace(workerImport,`${workerImport}\n${specialistImport}`);
}
bootstrap=bootstrap.replace(/^\s*registerITSpecialistAutonomyRoutes\([^;]*\);\s*$/gm,'');
const workerCallMatch=bootstrap.match(/^\s*registerITCodingWorkerRoutes\([^;]*\);\s*$/m);
if(!workerCallMatch)throw new Error('Trusted coding-worker registration anchor missing for IT Specialist');
const specialistCall="registerITSpecialistAutonomyRoutes({ app, prisma, authOf, requireRoles, adminRoles: [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO, UserRole.COO, UserRole.HR_MANAGER] });";
bootstrap=bootstrap.replace(workerCallMatch[0],`${workerCallMatch[0].trim()}\n${specialistCall}`);

const healthAnchor="service: 'spire-api',\n      database: 'connected',\n      timestamp: new Date().toISOString(),";
const healthReplacement="service: 'spire-api',\n      database: 'connected',\n      timestamp: new Date().toISOString(),\n      deployment: { branch: process.env.RAILWAY_GIT_BRANCH || null, commit: process.env.RAILWAY_GIT_COMMIT_SHA || null, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || null },";
if(!bootstrap.includes('RAILWAY_GIT_COMMIT_SHA')){
  if(!bootstrap.includes(healthAnchor))throw new Error('API health deployment-identity anchor changed');
  bootstrap=bootstrap.replace(healthAnchor,healthReplacement);
}
await writeFile(bootstrapPath,bootstrap,'utf8');

let sia=await readFile(siaPath,'utf8');
const routerImport="import { classifySiaMode, type SIARoutingDecision } from './sia-mode-router.js';";
const bridgeImport="import { enqueueITSpecialistTicket, loadITSpecialistSiaContext, relaySiaMessageToITSpecialist } from './it-specialist-autonomy.js';";
if(!sia.includes(bridgeImport)){
  if(!sia.includes(routerImport))throw new Error('SIA router import anchor changed');
  sia=sia.replace(routerImport,`${routerImport}\n${bridgeImport}`);
}
// The relay depends on the final routing decision. Remove any prior installer
// placement and reinsert it only after classifySiaMode has assigned `routing`.
sia=sia.replace(/\n\s*if \(routing\.mode === 'SULANDRA'\) \{\n\s*await relaySiaMessageToITSpecialist\(prisma, \{ organizationId: auth\.organizationId, employeeId: auth\.userId, conversationId, message: safeMessage \}\);\n\s*\}\n/g,'\n');
const diagnosticAnchor='      const diagnosticTarget = detectSiaDiagnosticTarget(safeMessage, history);';
const relayAfterRouting=`      if (routing.mode === 'SULANDRA') {\n        await relaySiaMessageToITSpecialist(prisma, { organizationId: auth.organizationId, employeeId: auth.userId, conversationId, message: safeMessage });\n      }\n\n      ${diagnosticAnchor.trim()}`;
if(!sia.includes(diagnosticAnchor))throw new Error('SIA post-routing diagnostic anchor changed');
sia=sia.replace(diagnosticAnchor,relayAfterRouting);

const contextAnchor="      if (routing.mode === 'SULANDRA') {\n        if (input.context?.environment)";
const contextReplacement="      if (routing.mode === 'SULANDRA') {\n        contextLines.push(...await loadITSpecialistSiaContext(prisma, { organizationId: auth.organizationId, employeeId: auth.userId, conversationId, message: safeMessage }));\n        if (input.context?.environment)";
if(!sia.includes('loadITSpecialistSiaContext(prisma')){
  if(!sia.includes(contextAnchor))throw new Error('SIA trusted-context anchor changed');
  sia=sia.replace(contextAnchor,contextReplacement);
}
const ticketAuditAnchor="      await audit(auth, 'CREATE_IT_TICKET', 'SUCCESS', input.conversationId || null, { ticketId: id, category: input.category, priority: input.priority });\n      res.status(201).json({ data: { id, status: 'OPEN' } });";
const ticketAuditReplacement="      const specialistTicket = await enqueueITSpecialistTicket(prisma, { organizationId: auth.organizationId, ticketId: id, employeeId: auth.userId, conversationId: input.conversationId || null });\n      await audit(auth, 'CREATE_IT_TICKET', 'SUCCESS', input.conversationId || null, { ticketId: id, ticketNumber: specialistTicket.ticketNumber, category: input.category, priority: input.priority });\n      res.status(201).json({ data: { id, ticketNumber: specialistTicket.ticketNumber, status: 'OPEN', itSpecialistQueued: true } });";
if(!sia.includes('itSpecialistQueued: true')){
  if(!sia.includes(ticketAuditAnchor))throw new Error('SIA ticket response anchor changed');
  sia=sia.replace(ticketAuditAnchor,ticketAuditReplacement);
}
await writeFile(siaPath,sia,'utf8');

let support=await readFile(supportPath,'utf8');
const supportImport="import { z } from 'zod';";
const specialistSupportImport="import { enqueueITSpecialistTicket } from './it-specialist-autonomy.js';";
if(!support.includes(specialistSupportImport)){
  if(!support.includes(supportImport))throw new Error('Employee Support import anchor changed');
  support=support.replace(supportImport,`${supportImport}\n${specialistSupportImport}`);
}
const directTicketAnchor="id,auth.organizationId,auth.userId,input.category,input.subject,input.description,input.priority);res.status(201).json({data:{id,status:'OPEN'}})";
const directTicketReplacement="id,auth.organizationId,auth.userId,input.category,input.subject,input.description,input.priority);const specialistTicket=await enqueueITSpecialistTicket(prisma,{organizationId:auth.organizationId,ticketId:id,employeeId:auth.userId,conversationId:null});res.status(201).json({data:{id,ticketNumber:specialistTicket.ticketNumber,status:'OPEN',itSpecialistQueued:true}})";
if(!support.includes('itSpecialistQueued:true')){
  if(!support.includes(directTicketAnchor))throw new Error('Employee Support ticket creation anchor changed');
  support=support.replace(directTicketAnchor,directTicketReplacement);
}
await writeFile(supportPath,support,'utf8');

let autonomy=await readFile(autonomyPath,'utf8');
autonomy=autonomy.replace(
  'const message=redact(error instanceof Error?error.message:error);',
  'const message=redact(error instanceof Error?error.message:String(error));',
);
await writeFile(autonomyPath,autonomy,'utf8');

await import('./verify-it-specialist-autonomy.mjs');
console.log('Autonomous IT Specialist registered after coding worker; SIA/support ticket continuity, route-order-safe relay, build-safe error normalization, and exact deployment identity are installed.');
