import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'IT_AGENT_GROUNDED_RESULTS_V1';

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`${label} anchor changed`);
  return source.replace(from, to);
}

function replaceAny(source, fromList, to, label) {
  if (source.includes(to)) return source;
  for (const from of fromList) {
    if (source.includes(from)) return source.replace(from, to);
  }
  throw new Error(`${label} anchor changed`);
}

// Preserve the employee-level evidence returned by the education status tool.
// The previous implementation queried employee records but collapsed the visible
// answer to counts only, so a follow-up such as "Which 2 employees?" repeated the
// same aggregate status instead of naming the assigned employees.
const campaignPath = path.join(root, 'api', 'src', 'education-campaign-routes.ts');
let campaigns = await readFile(campaignPath, 'utf8');

campaigns = replaceRequired(
  campaigns,
  '    employeeId: string;\n    email: string | null;\n    role: string;\n    status: string;\n    completedAt: Date | string | null;\n    legalEntityId: string;',
  '    employeeId: string;\n    displayName: string | null;\n    email: string | null;\n    role: string;\n    status: string;\n    completedAt: Date | string | null;\n    legalEntityId: string;',
  'education status employee row type',
);

campaigns = replaceRequired(
  campaigns,
  '    `SELECT assignment."employeeId",usr."email",usr."role"::text AS "role",assignment."status",assignment."completedAt",assignment."legalEntityId"',
  '    `SELECT assignment."employeeId",usr."displayName",usr."email",usr."role"::text AS "role",assignment."status",assignment."completedAt",assignment."legalEntityId"',
  'education status employee identity query',
);

campaigns = replaceRequired(
  campaigns,
  '  const employees = new Map<string, { employeeId: string; email: string | null; role: string; statuses: string[]; completedAt: string | null }>();',
  '  const employees = new Map<string, { employeeId: string; displayName: string | null; email: string | null; role: string; statuses: string[]; completedAt: string | null }>();',
  'education status employee map type',
);

campaigns = replaceRequired(
  campaigns,
  '      employeeId: row.employeeId,\n      email: row.email,\n      role: row.role,',
  '      employeeId: row.employeeId,\n      displayName: row.displayName,\n      email: row.email,\n      role: row.role,',
  'education status employee map identity',
);

campaigns = replaceRequired(
  campaigns,
  '    employeeId: person.employeeId,\n    email: person.email,\n    role: person.role,',
  '    employeeId: person.employeeId,\n    displayName: person.displayName,\n    email: person.email,\n    role: person.role,',
  'education status public employee identity',
);

const totalsAnchor = '  const outstanding = Math.max(0, assigned - completed);\n  return {';
const groundedTotals = `  const outstanding = Math.max(0, assigned - completed);\n  // ${marker}: keep trusted employee-level tool evidence in the visible answer.\n  const employeeLines = people.map((person, index) => {\n    const displayName = clean(person.displayName, 300) || clean(person.email, 320) || \`Employee \${index + 1}\`;\n    const email = clean(person.email, 320);\n    const identity = email && email.toLowerCase() !== displayName.toLowerCase() ? \`\${displayName} — \${email}\` : displayName;\n    const statusLabel = person.status === 'COMPLETED' ? 'completed' : 'outstanding';\n    return \`- \${identity} — \${statusLabel}\`;\n  }).join('\\n');\n  return {`;
if (!campaigns.includes(marker)) {
  if (!campaigns.includes(totalsAnchor)) throw new Error('education grounded status totals anchor changed');
  campaigns = campaigns.replace(totalsAnchor, groundedTotals);
}

const naturalStatus = '    message: `Yes. “${campaign.title}” was sent${campaign.sentAt ? ` on ${new Date(campaign.sentAt).toLocaleDateString(\'en-US\')}` : \'\'}. ${completed} completed, ${outstanding} outstanding, ${assigned} assigned (${assigned ? Math.round((completed / assigned) * 100) : 0}% complete).`,';
const aggregateStatus = '    message: `“${campaign.title}” status: ${completed} completed, ${outstanding} outstanding, ${assigned} assigned (${assigned ? Math.round((completed / assigned) * 100) : 0}% complete).`,';
const groundedStatus = '    message: `Yes. “${campaign.title}” was sent${campaign.sentAt ? ` on ${new Date(campaign.sentAt).toLocaleDateString(\'en-US\')}` : \'\'}. ${completed} completed, ${outstanding} outstanding, ${assigned} assigned (${assigned ? Math.round((completed / assigned) * 100) : 0}% complete).${employeeLines ? `\\n\\nAssigned employees:\\n${employeeLines}` : \'\'}`,';
if (!campaigns.includes(groundedStatus)) {
  campaigns = replaceAny(campaigns, [naturalStatus, aggregateStatus], groundedStatus, 'education grounded status reply');
}

for (const required of ['usr."displayName"', marker, 'Assigned employees:', 'displayName: person.displayName']) {
  if (!campaigns.includes(required)) throw new Error(`grounded education status missing ${required}`);
}
await writeFile(campaignPath, campaigns, 'utf8');

// Keep execution state truthful in the Administrator UI. Opening a PR is work
// started, not a completed or deployed action. Likewise, approval and retry states
// must never be rendered as generic success.
async function patchPortal(relativePath) {
  const file = path.join(root, relativePath);
  try { await access(file); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }

  let portal = await readFile(file, 'utf8');
  const executeAnchor = 'async function executeAction(id){';
  const executionHelper = `// ${marker}\nfunction executionResultMessage(data){const status=String(data?.status||'').toUpperCase();const result=data?.result&&typeof data.result==='object'?data.result:{};if(status==='PR_OPEN'){const worker=result.codingWorker&&typeof result.codingWorker==='object'?result.codingWorker:{};const pr=worker.prNumber?\`PR #\${worker.prNumber}\`:'A pull request';const commit=worker.commitSha?\` at commit \${worker.commitSha}\`:'';return \`Coding work started — \${pr} is open\${commit}. It is not deployed yet.\`}if(status==='IN_PROGRESS')return 'Work is in progress. It is not deployed yet.';if(status==='WAITING_APPROVAL'||status==='PROPOSED')return 'Waiting for approval. Nothing has been changed or deployed yet.';if(status==='FAILED')return result.message||'The action failed. Nothing was completed.';if(status==='RETRYING')return 'The operation did not complete. Try it again or review the incident details.';if(status==='EXECUTED')return result.message||(result.recipientCount?\`Completed. Recipients: \${result.recipientCount}.\`:'Completed.');return result.message||\`Current status: \${status||'unknown'}.\`}\n${executeAnchor}`;
  if (!portal.includes(marker)) {
    if (!portal.includes(executeAnchor)) throw new Error(`${relativePath} execute-action anchor changed`);
    portal = portal.replace(executeAnchor, executionHelper);
  }

  const oldExecutionBubble = "bubble('agent',data.status==='WAITING_APPROVAL'?`The code/system request is recorded and waiting in the controlled approval/engineering path. ${data.result?.message||''}`:`Action executed successfully. ${data.result?.recipientCount?`Recipients: ${data.result.recipientCount}.`:''}`);";
  const groundedExecutionBubble = "bubble('agent',executionResultMessage(data));";
  if (portal.includes(oldExecutionBubble)) portal = portal.replace(oldExecutionBubble, groundedExecutionBubble);
  else if (!portal.includes(groundedExecutionBubble)) throw new Error(`${relativePath} truthful execution-result anchor changed`);

  // Keep the conversational UX installer's canonical label map unchanged so the
  // full Section 9 installer chain remains idempotent. Unknown states already use
  // its humanizing fallback (for example PR_OPEN -> Pr Open).
  if (portal.includes('Action executed successfully.')) throw new Error(`${relativePath} still contains generic success wording`);
  if (!portal.includes('It is not deployed yet.')) throw new Error(`${relativePath} does not distinguish PR/work state from deployment`);
  await writeFile(file, portal, 'utf8');
}

await patchPortal('it-solutions.html');
await patchPortal(path.join('dist-web', 'it-solutions.html'));

console.log('IT Agent grounded results installed: education status retains employee identities and completion state, while Action Center distinguishes approval, PR-open, in-progress, executed, retry, failed, and deployed-not-yet states truthfully.');
