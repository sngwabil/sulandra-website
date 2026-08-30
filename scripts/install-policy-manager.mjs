import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function patch(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  const before = await readFile(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) await writeFile(filePath, after, 'utf8');
  return after !== before;
}

const bootstrapChanged = await patch('api/src/onboarding-bootstrap.ts', (source) => {
  const importLine = "import { registerPolicyRoutes } from './policy-routes.js';";
  if (!source.includes(importLine)) {
    const anchor = "import { getUserEntityContext, registerMultiCompanyRoutes } from './multi-company-routes.js';";
    if (!source.includes(anchor)) throw new Error('Policy Manager installer could not find the bootstrap import anchor.');
    source = source.replace(anchor, `${anchor}\n${importLine}`);
  }
  const registration = 'registerPolicyRoutes({ app, prisma, authOf, requireRoles, audit });';
  if (!source.includes(registration)) {
    const anchor = 'registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });';
    if (!source.includes(anchor)) throw new Error('Policy Manager installer could not find the bootstrap route-registration anchor.');
    source = source.replace(anchor, `${registration}\n${anchor}`);
  }
  return source;
});

const routerChanged = await patch('api/src/sia-mode-router.ts', (source) => {
  if (!source.includes('SULANDRA_POLICY_PATTERN')) {
    const anchor = 'const GENERAL_EXPLICIT_PATTERN =';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('Policy Manager installer could not find the SIA mode pattern anchor.');
    const policyPattern = "const SULANDRA_POLICY_PATTERN = /\\b(?:policy|policies|procedure|procedures|protocol|protocols|guideline|guidelines|policy library|policy center|policy manager)\\b/i;\n";
    source = `${source.slice(0, index)}${policyPattern}${source.slice(index)}`;
  }
  const oldDecision = "if (SULANDRA_TOPIC_PATTERN.test(text)) return 'SULANDRA';";
  const newDecision = "if (SULANDRA_TOPIC_PATTERN.test(text) || SULANDRA_POLICY_PATTERN.test(text)) return 'SULANDRA';";
  if (!source.includes(newDecision)) {
    if (!source.includes(oldDecision)) throw new Error('Policy Manager installer could not find the SIA Sulandra routing decision.');
    source = source.replace(oldDecision, newDecision);
  }
  return source;
});

const siaChanged = await patch('api/src/sia-routes.ts', (source) => {
  const importLine = "import { searchPublishedPoliciesForSia, serializePolicyKnowledgeForSia } from './policy-routes.js';";
  if (!source.includes(importLine)) {
    const anchor = "import { classifySiaMode, type SIARoutingDecision } from './sia-mode-router.js';";
    if (!source.includes(anchor)) throw new Error('Policy Manager installer could not find the SIA import anchor.');
    source = source.replace(anchor, `${anchor}\n${importLine}`);
  }

  if (!source.includes('const policyIntent = routing.mode !== \'GENERAL\'')) {
    const anchor = '      const [publishedSchedule, myWorkSummary, liveDiagnostics] = await Promise.all([';
    if (!source.includes(anchor)) throw new Error('Policy Manager installer could not find the SIA trusted-context lookup anchor.');
    const block = `      const policyIntent = routing.mode !== 'GENERAL' && /\\b(policy|policies|procedure|procedures|protocol|protocols|guideline|guidelines)\\b/i.test(safeMessage);\n      const policyKnowledge = policyIntent\n        ? await searchPublishedPoliciesForSia(prisma, auth, safeMessage, 6)\n        : [];\n\n`;
    source = source.replace(anchor, `${block}${anchor}`);
  }

  if (!source.includes('serverPolicyKnowledge is authoritative')) {
    const anchor = 'Interactive support rules:';
    if (!source.includes(anchor)) throw new Error('Policy Manager installer could not find the SIA system-instruction anchor.');
    const rules = `Policy grounding rules:\n- When trusted context contains serverPolicyKnowledge, treat it as authoritative published Sulandra policy evidence.\n- Answer policy questions from those published records only; never invent a requirement that is absent from the supplied policy evidence.\n- State whether the policy is enterprise-wide or company-specific, include policy code/version/effective date when available, and provide the exact clickable policy PDF link supplied in trusted context.\n- If serverPolicyKnowledge is NO_MATCH, say no matching published policy was found and offer to refine the search; do not substitute an internet policy.\n- Draft and review-stage policies are never authoritative employee guidance.\n\n`;
    source = source.replace(anchor, `${rules}${anchor}`);
  }

  if (!source.includes('contextLines.push(...serializePolicyKnowledgeForSia(policyKnowledge))')) {
    const anchor = "      if (routing.mode === 'SULANDRA') {\n        if (input.context?.environment)";
    if (!source.includes(anchor)) throw new Error('Policy Manager installer could not find the SIA context serialization anchor.');
    const block = `      if (policyIntent) {\n        contextLines.push(...serializePolicyKnowledgeForSia(policyKnowledge));\n      }\n\n`;
    source = source.replace(anchor, `${block}${anchor}`);
  }
  return source;
});

console.log(`Policy Manager installed: bootstrap=${bootstrapChanged ? 'updated' : 'ready'}, SIA router=${routerChanged ? 'updated' : 'ready'}, SIA grounding=${siaChanged ? 'updated' : 'ready'}.`);
