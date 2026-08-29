import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist-web');
await mkdir(output,{recursive:true});
const payload={
  service:'sulandra-static-website',
  branch:process.env.RAILWAY_GIT_BRANCH||null,
  commit:process.env.RAILWAY_GIT_COMMIT_SHA||null,
  deploymentId:process.env.RAILWAY_DEPLOYMENT_ID||null,
  generatedAt:new Date().toISOString(),
};
await writeFile(path.join(output,'deployment-meta.json'),`${JSON.stringify(payload,null,2)}\n`,'utf8');

const itSolutionsPath=path.join(output,'it-solutions.html');
try{
  let html=await readFile(itSolutionsPath,'utf8');
  html=html
    .replace('Ask for a real operational action or a system change. Side effects appear as reviewable action cards before execution.','Ask for a real operational action, system repair, or major change. Routine authorized work executes immediately; only major changes pause for owner approval.')
    .replace('The agent proposes; you decide. Executed actions retain evidence.','The IT Specialist executes routine authorized work and retains evidence. Major changes stop for owner approval.')
    .replace('I’m the Administrator IT Agent workbench. I can prepare and execute intranet cards/messages, original meme cards, employee announcements, targeted notifications, and employee emails. For code/UI/deployment changes I create a controlled engineering action and approval record rather than pretending the change happened.','I’m the Sulandra IT Specialist workbench. When an authorized Admin asks me to send an email, publish an announcement, notify an employee, or post intranet content, I execute it and report the result. Engineering requests go straight into the specialist ticket workflow: established approved-work regressions can self-repair after gates; only major or materially new changes stop for owner approval.')
    .replace('<strong>Code changes:</strong> requests such as “add a button,” “change a route,” or “fix production code” are classified separately from content/communications. They require the engineering approval path and a trusted GitHub/Codex worker before any commit or deployment can be claimed.','<strong>Engineering work:</strong> code, route, UI, configuration, and deployment requests go directly to the IT Specialist. Broken already-approved behavior may be repaired automatically after required gates. Major/new/security/permission/data-meaning changes require owner approval before implementation.');
  const marker='/assets/it-specialist-ui.js?v=20260828-specialist-1';
  if(!html.includes(marker)){
    if(!html.includes('</body>'))throw new Error('IT Solutions published page is missing closing body tag');
    html=html.replace('</body>',`<script src="${marker}"></script></body>`);
  }
  await writeFile(itSolutionsPath,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error}

// Final published IT Agent polish runs after dist-web exists. The frontend
// image intentionally retains the canonical unaugmented workbench source, so
// only frontend UX assertions apply in this static-only publication context.
await import('./install-it-agent-conversational-review-ux.mjs');
await import('./fix-it-agent-status-board-api-origin.mjs');

console.log(`Static deployment identity and immediate-execution IT Specialist UI published for ${payload.branch||'unknown-branch'} @ ${(payload.commit||'unknown-commit').slice(0,12)}.`);
