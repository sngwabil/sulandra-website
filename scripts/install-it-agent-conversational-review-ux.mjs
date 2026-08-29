import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const replaceRequired=(source,from,to,label)=>{
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`${label} anchor changed`);
  return source.replace(from,to);
};
const replaceAny=(source,fromList,to,label)=>{
  if(source.includes(to))return source;
  for(const from of fromList){if(source.includes(from))return source.replace(from,to)}
  throw new Error(`${label} anchor changed`);
};

// Keep training responses conversational. The review destination remains in the
// structured result, while the visible reply uses a normal clickable label.
const campaignPath=path.join(root,'api','src','education-campaign-routes.ts');
let campaigns=await readFile(campaignPath,'utf8');
campaigns=replaceRequired(
  campaigns,
  'message: `The existing “${existing.title}” education draft is still open for review. Review it here: ${educationCampaignReviewUrl(existing.id)}. Ask for changes, or say “send” when it is ready.`,',
  'message: `“${existing.title}” is ready for review. [Click here to review](${educationCampaignReviewUrl(existing.id)})`,',
  'existing education draft reply',
);
campaigns=replaceRequired(
  campaigns,
  'message: `I created the “${title}” education draft. Nothing has been sent yet. Review it here: ${educationCampaignReviewUrl(id)}. Tell me what to change; I will revise this same draft. When it is ready, say “send”.`,',
  'message: `Created “${title}”. [Click here to review](${educationCampaignReviewUrl(id)})`,',
  'new education draft reply',
);
campaigns=replaceRequired(
  campaigns,
  'message: `I revised the same “${revised.title}” education draft to version ${nextVersion}. Nothing has been sent. Review the updated draft here: ${educationCampaignReviewUrl(current.id)}.`,',
  'message: `Updated “${revised.title}”. [Click here to review](${educationCampaignReviewUrl(current.id)})`,',
  'education revision reply',
);
campaigns=replaceRequired(
  campaigns,
  'message: `“${current.title}” is marked ready to send. I have not distributed it yet. If you want it distributed now, say “send”.`,',
  'message: `“${current.title}” is ready to send.`,',
  'education ready reply',
);
// The email-delivery truth repair owns sent/SMTP wording once installed. Do not
// rewrite it back to the old "sent" language on a repeated/Docker build pass.
if(!campaigns.includes('IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1')){
  campaigns=replaceRequired(
    campaigns,
    'return { ...status, message: `“${campaign.title}” was already sent. I did not create duplicate assignments or resend it.` };',
    'return { ...status, message: `“${campaign.title}” was already sent. Nothing was sent twice.` };',
    'already-sent education reply',
  );
  campaigns=replaceRequired(
    campaigns,
    'message: `Sent “${campaign.title}” to ${uniqueEmployees.length} employee${uniqueEmployees.length === 1 ? \'\' : \'s\'} and created ${recipients.length} company-scoped education assignment${recipients.length === 1 ? \'\' : \'s\'}. Email delivery: ${emailSentCount} sent${emailFailedCount ? `, ${emailFailedCount} failed` : \'\'}. Completion and attestation are now being tracked in each employee’s EducationAssignment record.`,',
    'message: `Sent “${campaign.title}” to ${uniqueEmployees.length} employee${uniqueEmployees.length === 1 ? \'\' : \'s\'}. Completion and attestation tracking is active.`,',
    'education send reply',
  );
}
await writeFile(campaignPath,campaigns,'utf8');

// The IT Agent should acknowledge the completed step and then listen. It must
// not presume that the Administrator wants a revision or a send action next.
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');
const behaviorAnchor='Saying send is the authorization; do not ask for a second approval. Use get_training_status for completion counts or employee status.';
const behaviorContract='Saying send is the authorization; do not ask for a second approval. After creating or revising a training draft, acknowledge completion, provide the review link, and wait for the Administrator. Do not ask what to change, do not suggest that a revision is expected, and do not tell the Administrator to say “send”; the Administrator decides the next step after reviewing. Use get_training_status for completion counts or employee status.';
if(!workbench.includes(behaviorContract)){
  if(workbench.includes(behaviorAnchor)){
    workbench=workbench.replace(behaviorAnchor,behaviorContract);
  }else if(workbench.includes("name:'create_training_draft'")||workbench.includes('create_training_draft -> Administrator review')){
    throw new Error('IT Agent education listening-behavior anchor changed');
  }else{
    console.log('IT Agent education listening-behavior patch skipped because this static-only build has canonical unaugmented workbench source.');
  }
}
await writeFile(workbenchPath,workbench,'utf8');

const bubbleBefore="function bubble(role,text){const node=document.createElement('div');node.className='bubble '+role;node.textContent=text;agentChat.appendChild(node);agentChat.scrollTop=agentChat.scrollHeight}";
const clickableBubble="function bubble(role,text){const node=document.createElement('div');node.className='bubble '+role;const value=String(text??'');const linkPattern=/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)|(https?:\\/\\/[^\\s]+)/g;let last=0;for(const match of value.matchAll(linkPattern)){const index=match.index??0;if(index>last)node.append(document.createTextNode(value.slice(last,index)));const href=match[2]||match[3]||'';const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener';link.textContent=match[1]||(href.includes('/education-campaign.html')?'Click here to review':'Open link');link.style.fontWeight='800';link.style.color='inherit';link.style.textDecoration='underline';node.append(link);last=index+match[0].length}if(last<value.length)node.append(document.createTextNode(value.slice(last)));agentChat.appendChild(node);agentChat.scrollTop=agentChat.scrollHeight}";
const polishedBubble=`function formatAgentMessage(value){let html=esc(String(value??'').trim());html=html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>').replace(/\\\`([^\\\`\\n]+)\\\`/g,'<code>$1</code>');return html.split(/\\r?\\n/).map(line=>{if(!line.trim())return '<div class="chat-gap"></div>';const heading=line.match(/^\\s*#{1,4}\\s+(.+)$/);if(heading)return '<div class="chat-heading">'+heading[1]+'</div>';const item=line.match(/^\\s*[-*]\\s+(.+)$/);if(item)return '<div class="chat-list-item"><span class="chat-bullet">•</span><span>'+item[1]+'</span></div>';return '<div class="chat-line">'+line+'</div>'}).join('')}function bubble(role,text){const node=document.createElement('div');node.className='bubble '+role;if(role==='agent')node.innerHTML=formatAgentMessage(text);else node.textContent=String(text??'');agentChat.appendChild(node);agentChat.scrollTop=agentChat.scrollHeight}`;
const badgeBefore='function badge(value){return `<span class="pill">${esc(value)}</span>`}';
const badgeAfter="function humanAgentLabel(value){const text=String(value??'');const labels={CREATE_TRAINING_DRAFT:'Education draft',REVISE_TRAINING_DRAFT:'Education revision',MARK_TRAINING_READY:'Ready to send',SEND_TRAINING:'Education sent',GET_TRAINING_STATUS:'Education status',EXECUTED:'Done',PROPOSED:'Needs approval',WAITING_APPROVAL:'Waiting for approval',LOW:'Routine',MEDIUM:'Moderate',HIGH:'High priority'};return labels[text]||text.replaceAll('_',' ').toLowerCase().replace(/\\b\\w/g,c=>c.toUpperCase())}function plainAgentText(value){return String(value??'').replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,'$1').replace(/\\*\\*([^*]+)\\*\\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/^\\s*#{1,4}\\s+/gm,'').replace(/^\\s*[-*]\\s+/gm,'• ')}function humanActionSummary(action,payload){const target=plainAgentText(action?.summary||'').trim();if(target)return target;const request=plainAgentText(payload?.request||payload?.title||'').trim();return request||'Status updated.'}function badge(value){return `<span class=\"pill\">${esc(humanAgentLabel(value))}</span>`}";
const resultBefore='${esc(JSON.stringify(pending?payload:result,null,2))}';
const resultExisting="${esc(result.message?plainAgentText(result.message):JSON.stringify(pending?payload:result,null,2))}";
const resultAfter="${esc(result.message?plainAgentText(result.message):humanActionSummary(a,payload))}";

const cssBefore='.agent-shell{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.75fr);gap:16px}.agent-main{min-height:640px;display:flex;flex-direction:column}';
const cssAfter='.agent-shell{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.75fr);gap:16px;align-items:start}.agent-main{min-height:0;display:flex;flex-direction:column}';
const chatCssBefore='.agent-chat{flex:1;min-height:360px;max-height:560px;overflow:auto;border:1px solid var(--line);background:#f8fbfe;border-radius:14px;padding:14px;margin-top:14px}';
const chatCssAfter='.agent-chat{min-height:112px;border:1px solid var(--line);background:#f8fbfe;border-radius:14px;padding:14px;margin-top:14px;overflow:visible}.agent-chat:empty{min-height:112px;background:linear-gradient(180deg,#fbfdff,#f7fbfe)}';
const bubbleCssBefore='.bubble{max-width:88%;padding:11px 13px;border-radius:14px;margin:8px 0;white-space:pre-wrap;line-height:1.45}';
const bubbleCssAfter='.bubble{max-width:88%;padding:11px 13px;border-radius:14px;margin:8px 0;white-space:normal;line-height:1.5}.bubble.agent a{font-weight:750;color:#0b5f9f;text-decoration:underline;text-underline-offset:2px}.bubble.agent code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#eef4f8;border-radius:5px;padding:1px 4px;font-size:.92em}.chat-line+.chat-line{margin-top:7px}.chat-heading{font-weight:800;color:var(--navy);margin:4px 0 6px}.chat-list-item{display:grid;grid-template-columns:16px 1fr;gap:4px;margin:5px 0}.chat-bullet{font-weight:900;color:var(--blue)}.chat-gap{height:8px}';
const preCssBefore='.action pre{white-space:pre-wrap;max-height:150px;overflow:auto;background:#f7fafc;border-radius:9px;padding:8px;font-size:11px}';
const preCssAfter='.action pre{white-space:pre-wrap;max-height:150px;overflow:auto;background:#f7fafc;border-radius:9px;padding:8px;font-size:11px}.action-result{background:#f7fafc;border-radius:9px;padding:9px 10px;font-size:12px;line-height:1.45;color:#40586c}';

async function patchPortal(relativePath){
  const file=path.join(root,relativePath);
  try{await access(file)}catch(error){if(error?.code==='ENOENT')return;throw error}
  let portal=await readFile(file,'utf8');

  if(!portal.includes('function formatAgentMessage(value)'))portal=replaceAny(portal,[bubbleBefore,clickableBubble],polishedBubble,`${relativePath} formatted chat reply`);
  portal=replaceRequired(portal,badgeBefore,badgeAfter,`${relativePath} human action labels`);
  if(!portal.includes(resultAfter)){
    if(portal.includes(resultExisting))portal=portal.replace(resultExisting,resultAfter);
    else if(portal.includes(resultBefore))portal=portal.replace(resultBefore,resultAfter);
    else throw new Error(`${relativePath} human action-result anchor changed`);
  }
  portal=portal.replace('<pre>${esc(result.message?plainAgentText(result.message):humanActionSummary(a,payload))}</pre>','<div class="action-result">${esc(result.message?plainAgentText(result.message):humanActionSummary(a,payload))}</div>');

  if(portal.includes(cssBefore))portal=portal.replace(cssBefore,cssAfter);
  if(portal.includes(chatCssBefore))portal=portal.replace(chatCssBefore,chatCssAfter);
  if(portal.includes(bubbleCssBefore))portal=portal.replace(bubbleCssBefore,bubbleCssAfter);
  if(portal.includes(preCssBefore)&&!portal.includes('.action-result{'))portal=portal.replace(preCssBefore,preCssAfter);

  portal=portal
    .replace('Enterprise IT operations, diagnostics, agent-assisted execution, controlled remediation, and compliance.','Operations, incidents, system health, and remediation.')
    .replace('<div class="banner"><strong>Support safety:</strong> SIA remains first-line employee support. This Administrator workbench can execute approved intranet and communications actions. Code/system changes use the remediation approval boundary and must never claim a commit or deployment without trusted evidence.</div>','<div class="banner">Changes are logged and verified through the existing release controls.</div>')
    .replace('Ask for a real operational action or a system change. Side effects appear as reviewable action cards before execution.','Tell the IT Agent what you need.')
    .replace('Ask for a real operational action, system repair, or major change. Routine authorized work executes immediately; only major changes pause for owner approval.','Tell the IT Agent what you need.')
    .replace('Ask for a real operational action, reviewable employee education, or a system change. Routine operations execute from your instruction; only consequential system changes pause for approval.','Tell the IT Agent what you need.')
    .replace('The agent proposes; you decide. Executed actions retain evidence.','Recent work, status, and approvals.')
    .replace('The IT Specialist executes routine authorized work and retains evidence. Major changes stop for owner approval.','Recent work, status, and approvals.')
    .replace('Routine authorized work executes immediately. Routine work executes from your instruction. Education stays in one reviewable campaign until you say “send.” Only approval-required system changes show decision buttons; only major changes pause for owner approval.','Recent work, status, and approvals.')
    .replace('<strong>Code changes:</strong> requests such as “add a button,” “change a route,” or “fix production code” are classified separately from content/communications. They require the engineering approval path and a trusted GitHub/Codex worker before any commit or deployment can be claimed.','<strong>Engineering:</strong> Code changes follow the existing approval, CI, and release gates.')
    .replace('<strong>Engineering work:</strong> code, route, UI, configuration, and deployment requests go directly to the IT Specialist. Broken already-approved behavior may be repaired automatically after required gates. Major/new/security/permission/data-meaning changes require owner approval before implementation.','<strong>Engineering:</strong> Code changes follow the existing approval, CI, and release gates.')
    .replace('<h3>Connected capabilities</h3>','<h3>Connections</h3>')
    .replaceAll('>REAL</strong>','>Ready</strong>');

  const initialBubbles=[
    '<div id="agentChat" class="agent-chat"><div class="bubble agent">I’m the Administrator IT Agent workbench. I can prepare and execute intranet cards/messages, original meme cards, employee announcements, targeted notifications, and employee emails. For code/UI/deployment changes I create a controlled engineering action and approval record rather than pretending the change happened.</div></div>',
    '<div id="agentChat" class="agent-chat"><div class="bubble agent">I’m the Sulandra IT Specialist workbench. When an authorized Admin asks me to send an email, publish an announcement, notify an employee, or post intranet content, I execute it and report the result. Engineering requests go straight into the specialist ticket workflow: established approved-work regressions can self-repair after gates; only major or materially new changes stop for owner approval.</div></div>',
  ];
  for(const initial of initialBubbles){if(portal.includes(initial))portal=portal.replace(initial,'<div id="agentChat" class="agent-chat" aria-live="polite"></div>')}

  const section='<section id="agent" class="view">';
  const policySection='<section id="agent" class="view" data-release-contract="Routine authorized work executes immediately; only major changes pause for owner approval" data-education-contract="Routine work executes from your instruction. Education stays in one reviewable campaign until you say “send.”">';
  if(portal.includes(section))portal=portal.replace(section,policySection);

  await writeFile(file,portal,'utf8');
}

await patchPortal('it-solutions.html');
await patchPortal(path.join('dist-web','it-solutions.html'));

console.log('IT Agent review UX installed: readable formatted chat, compact empty state, expanding conversation area, concise interface copy, clean action summaries, clickable review links, and listen-first behavior.');