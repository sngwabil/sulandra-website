import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const siaRoutesTarget = path.join(root, 'api', 'src', 'sia-routes.ts');
const importLine = "import { registerSIARoutes } from './sia-routes.js';";
const profileImportLine = "import { registerSIACopilotProfileRoutes } from './sia-copilot-profile.js';";
const registerLine = 'registerSIARoutes({ app, prisma, authOf, requireRoles });';
const profileRegisterLine = 'registerSIACopilotProfileRoutes({ app, prisma, authOf, requireRoles });';
const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';

let source = await readFile(target, 'utf8');
if (!source.includes(importLine)) {
  if (!source.includes(careersImport)) throw new Error('Unable to locate Careers import anchor for SIA routes');
  source = source.replace(careersImport, `${careersImport}\n${importLine}`);
}
if (!source.includes(profileImportLine)) {
  if (!source.includes(importLine)) throw new Error('Unable to locate SIA route import anchor for SIA copilot profile');
  source = source.replace(importLine, `${importLine}\n${profileImportLine}`);
}
source = source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n');
source = source.replace(new RegExp(`\\n?${profileRegisterLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n');
if (!source.includes(careersRegister)) throw new Error('Unable to locate Careers registration anchor for SIA routes');
source = source.replace(careersRegister, `${profileRegisterLine}\n${registerLine}\n\n${careersRegister}`);
await writeFile(target, source, 'utf8');

let siaRoutes = await readFile(siaRoutesTarget, 'utf8');
const diagnosticImport = "import { affectedPageClarificationReply, collectSiaLiveDiagnostics, detectSiaDiagnosticTarget, isPageLoadingIntent, serializeSiaLiveDiagnostics, siaNeedsAffectedPageClarification } from './sia-live-diagnostics.js';";
const profileHelperImport = "import { ensureSIACopilotProfile, serializeSIACopilotProfile } from './sia-copilot-profile.js';";
const systemMapImport = "import { SULANDRA_CANONICAL_SYSTEM_MAP } from './sia-system-map.js';";
if (!siaRoutes.includes(diagnosticImport)) {
  if (!siaRoutes.includes(systemMapImport)) throw new Error('Unable to locate SIA system-map import anchor');
  siaRoutes = siaRoutes.replace(systemMapImport, `${systemMapImport}\n${diagnosticImport}`);
}
if (!siaRoutes.includes(profileHelperImport)) {
  if (!siaRoutes.includes(systemMapImport)) throw new Error('Unable to locate SIA system-map import anchor for copilot profile helper');
  siaRoutes = siaRoutes.replace(systemMapImport, `${systemMapImport}\n${profileHelperImport}`);
}

if (!siaRoutes.includes('supportWorkspacePage: z.string()')) {
  const pageField = "    page: z.string().trim().max(240).optional(),";
  if (!siaRoutes.includes(pageField)) throw new Error('Unable to locate SIA context page schema anchor');
  siaRoutes = siaRoutes.replace(pageField, `${pageField}\n    supportWorkspacePage: z.string().trim().max(240).optional(),`);
}

const promptAnchor = '\n\nWhen answering, use Sulandra product names exactly when known:';
const liveRules = `
24. The technical-context field supportWorkspacePage (and legacy field page) identifies where the employee is chatting with SIA. It is NOT the affected application. Never assume /sia.html is the page that is stuck merely because the support conversation is open in SIA.
25. For a generic report such as "a page is stuck loading", "black screen", "blank page", "frozen", or "still spinning", establish which Sulandra application/page is affected before troubleshooting. If no target is named and there is no screenshot that identifies it, ask the employee for the page name or non-sensitive URL and wait for the answer.
26. Treat serverDiagnostic*, serverGitHubReleaseEvidence, serverRailwayBackedApiHealth, serverStaticPageProbe, and serverRailwayRuntimeEvidence fields as trusted live/read-only diagnostic evidence. Use them before blaming the browser. If the API and page probes are healthy and current GitHub release/CI evidence is healthy, say that the available platform evidence is healthy and then investigate session, permissions, JavaScript/rendering, cache, or device-specific causes. If a probe or current CI is failing, prioritize that platform-side evidence.
27. For a black/blank screenshot, inspect what actually rendered: browser chrome/URL, Sulandra header, navigation, shell, text, controls, loaders, overlays, and the missing content region. A deliberately dark SIA/SPIRE theme is not itself a black-screen failure. Describe what is present and what is missing, then ask only the next useful question if the image does not prove the cause.
28. GitHub release/CI evidence may be available to SIA as a live read-only check. Railway runtime/service-health evidence may also be available. If serverRailwayRuntimeEvidence says managementReadAuthorized=true, SIA may use the supplied deployment status and sanitized log highlights as trusted read-only evidence. Never expose secrets, raw credentials, or claim a Railway/GitHub mutation occurred unless a separate approved action result explicitly proves it. If Railway management access is not connected, say that service-health probes are available but deployment/log management is not yet connected.
29. For an identified stuck page, guide the employee one step at a time: confirm the target and current live evidence → identify the likely layer (platform, authentication/authorization, client session, rendering, or network) → give one exact test → interpret the result → give a workaround when possible → escalate with a ticket/screenshot only if needed.
30. serverConfirmedSIACopilot* fields come from the authenticated employee's persistent SIA profile. Use the preferred name, response style, and recent non-sensitive Sulandra application context to keep the assistant consistent across portals. This profile is continuity and personalization only: it never grants permissions, never overrides current server authorization, and must never be used to store or infer patient/client clinical information, passwords, MFA codes, API keys, secrets, or form values.
31. When SIA is opened from the global Ask SIA drawer, behave as a second eye for that employee: understand the current Sulandra application and safe section metadata, explain what the employee is looking at, guide the next step, and notice likely technical problems. Do not pretend to see page content that was not supplied, and do not infer clinical facts from being inside SPIRE.`;
if (!siaRoutes.includes('supportWorkspacePage (and legacy field page) identifies')) {
  if (!siaRoutes.includes(promptAnchor)) throw new Error('Unable to locate SIA prompt rules anchor');
  siaRoutes = siaRoutes.replace(promptAnchor, `${liveRules}${promptAnchor}`);
} else if (!siaRoutes.includes('serverConfirmedSIACopilot* fields come from')) {
  if (!siaRoutes.includes(promptAnchor)) throw new Error('Unable to locate SIA prompt rules anchor for copilot profile');
  siaRoutes = siaRoutes.replace(promptAnchor, `\n30. serverConfirmedSIACopilot* fields come from the authenticated employee's persistent SIA profile. Use the preferred name, response style, and recent non-sensitive Sulandra application context to keep the assistant consistent across portals. This profile is continuity and personalization only: it never grants permissions, never overrides current server authorization, and must never be used to store or infer patient/client clinical information, passwords, MFA codes, API keys, secrets, or form values.\n31. When SIA is opened from the global Ask SIA drawer, behave as a second eye for that employee: understand the current Sulandra application and safe section metadata, explain what the employee is looking at, guide the next step, and notice likely technical problems. Do not pretend to see page content that was not supplied, and do not infer clinical facts from being inside SPIRE.${promptAnchor}`);
}

const historyAnchor = "      const history = prior.reverse().map((message) => ({ role: message.role, content: message.content }));";
if (!siaRoutes.includes('GUIDED_AFFECTED_PAGE_CLARIFICATION')) {
  if (!siaRoutes.includes(historyAnchor)) throw new Error('Unable to locate SIA conversation-history anchor');
  const guidedPreflight = `${historyAnchor}
      const diagnosticTarget = detectSiaDiagnosticTarget(safeMessage, history);
      const pageLoadingIntent = isPageLoadingIntent(safeMessage, history);
      if (siaNeedsAffectedPageClarification(safeMessage, history, Boolean(input.attachment))) {
        const answer = affectedPageClarificationReply();
        await prisma.$executeRawUnsafe(
          \`INSERT INTO "SIAMessage" ("id","organizationId","conversationId","userId","role","content") VALUES ($1,$2,$3,$4,'user',$5)\`,
          randomUUID(), auth.organizationId, conversationId, auth.userId, storedUserMessage,
        );
        await prisma.$executeRawUnsafe(
          \`INSERT INTO "SIAMessage" ("id","organizationId","conversationId","userId","role","content","model") VALUES ($1,$2,$3,$4,'assistant',$5,$6)\`,
          randomUUID(), auth.organizationId, conversationId, auth.userId, answer, 'sia-guided-router',
        );
        await prisma.$executeRawUnsafe(\`UPDATE "SIAConversation" SET "updatedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2\`, auth.organizationId, conversationId);
        await audit(auth, 'GUIDED_AFFECTED_PAGE_CLARIFICATION', 'SUCCESS', conversationId, { supportWorkspacePage: input.context?.supportWorkspacePage || input.context?.page || null });
        return void res.json({ data: { conversationId, answer, model: 'sia-guided-router' } });
      }`;
  siaRoutes = siaRoutes.replace(historyAnchor, guidedPreflight);
}

const workEmailLookupAnchor = `      const [employeeUsername, confirmedWorkEmail] = await Promise.all([
        loadEmployeeUsername(auth),
        loadEmployeeWorkEmail(auth),
      ]);`;
if (!siaRoutes.includes('const copilotProfile = await ensureSIACopilotProfile')) {
  if (!siaRoutes.includes(workEmailLookupAnchor)) throw new Error('Unable to locate SIA employee identity lookup anchor for copilot profile');
  siaRoutes = siaRoutes.replace(workEmailLookupAnchor, `${workEmailLookupAnchor}
      const copilotProfile = await ensureSIACopilotProfile(prisma, auth, {
        page: input.context?.supportWorkspacePage || input.context?.page || null,
        application: input.context?.application || null,
      });`);
}

const scheduleAnchor = '      const publishedSchedule = scheduleIntent ? await loadPublishedSchedule(auth) : null;';
if (!siaRoutes.includes('const liveDiagnostics =')) {
  if (!siaRoutes.includes(scheduleAnchor)) throw new Error('Unable to locate SIA schedule/live-diagnostics anchor');
  siaRoutes = siaRoutes.replace(scheduleAnchor, `${scheduleAnchor}\n      const liveDiagnostics = (pageLoadingIntent || Boolean(input.attachment)) ? await collectSiaLiveDiagnostics(diagnosticTarget, { allowRailwayManagement: adminAccessFor(auth) }) : null;`);
} else {
  siaRoutes = siaRoutes.replace(
    'collectSiaLiveDiagnostics(diagnosticTarget)',
    'collectSiaLiveDiagnostics(diagnosticTarget, { allowRailwayManagement: adminAccessFor(auth) })',
  );
}

const usernameContextAnchor = "      contextLines.push(`serverConfirmedEmployeePortalUsername: ${employeeUsername || 'NOT_FOUND'}`);";
if (!siaRoutes.includes('serializeSIACopilotProfile(copilotProfile)')) {
  if (!siaRoutes.includes(usernameContextAnchor)) throw new Error('Unable to locate SIA trusted-context anchor for copilot profile');
  siaRoutes = siaRoutes.replace(usernameContextAnchor, `${usernameContextAnchor}\n      contextLines.push(...serializeSIACopilotProfile(copilotProfile));`);
}
if (!siaRoutes.includes('serializeSiaLiveDiagnostics(liveDiagnostics)')) {
  if (!siaRoutes.includes(usernameContextAnchor)) throw new Error('Unable to locate SIA trusted-context anchor');
  const profileAwareAnchor = siaRoutes.includes('contextLines.push(...serializeSIACopilotProfile(copilotProfile));')
    ? '      contextLines.push(...serializeSIACopilotProfile(copilotProfile));'
    : usernameContextAnchor;
  siaRoutes = siaRoutes.replace(profileAwareAnchor, `${profileAwareAnchor}\n      if (liveDiagnostics) contextLines.push(...serializeSiaLiveDiagnostics(liveDiagnostics));`);
}

siaRoutes = siaRoutes.replace(
  "        page: input.context?.page || null,",
  "        page: input.context?.supportWorkspacePage || input.context?.page || null,",
);
if (!siaRoutes.includes('copilotProfileId: copilotProfile.id')) {
  const auditAnchor = '        workEmailConfirmed: Boolean(confirmedWorkEmail),';
  if (!siaRoutes.includes(auditAnchor)) throw new Error('Unable to locate SIA chat audit anchor for copilot profile');
  siaRoutes = siaRoutes.replace(auditAnchor, `${auditAnchor}\n        copilotProfileId: copilotProfile.id,`);
}

await writeFile(siaRoutesTarget, siaRoutes, 'utf8');

await import('./verify-sia-system-map.mjs');
await import('./verify-sia-guided-diagnostics.mjs');
await import('./verify-sia-copilot-profile.mjs');
console.log('SIA routes registered with persistent employee copilot profiles, global-drawer context continuity, affected-page clarification, screenshot-aware guided troubleshooting, GitHub release/CI evidence, Railway-backed live service probes, and Admin-gated Railway deployment/log reads when configured.');
