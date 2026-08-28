import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const replaceRequired=(source,from,to,label)=>{
  if(source.includes(to))return source;
  if(!source.includes(from))throw new Error(`${label} anchor changed`);
  return source.replace(from,to);
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
await writeFile(campaignPath,campaigns,'utf8');

// The IT Agent should acknowledge the completed step and then listen. It must
// not presume that the Administrator wants a revision or a send action next.
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');
const behaviorAnchor='Saying send is the authorization; do not ask for a second approval. Use get_training_status for completion counts or employee status.';
const behaviorContract='Saying send is the authorization; do not ask for a second approval. After creating or revising a training draft, acknowledge completion, provide the review link, and wait for the Administrator. Do not ask what to change, do not suggest that a revision is expected, and do not tell the Administrator to say “send”; the Administrator decides the next step after reviewing. Use get_training_status for completion counts or employee status.';
if(!workbench.includes(behaviorContract)){
  if(!workbench.includes(behaviorAnchor))throw new Error('IT Agent education listening-behavior anchor changed');
  workbench=workbench.replace(behaviorAnchor,behaviorContract);
}
await writeFile(workbenchPath,workbench,'utf8');

const bubbleBefore="function bubble(role,text){const node=document.createElement('div');node.className='bubble '+role;node.textContent=text;agentChat.appendChild(node);agentChat.scrollTop=agentChat.scrollHeight}";
const bubbleAfter="function bubble(role,text){const node=document.createElement('div');node.className='bubble '+role;const value=String(text??'');const linkPattern=/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)|(https?:\\/\\/[^\\s]+)/g;let last=0;for(const match of value.matchAll(linkPattern)){const index=match.index??0;if(index>last)node.append(document.createTextNode(value.slice(last,index)));const href=match[2]||match[3]||'';const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener';link.textContent=match[1]||(href.includes('/education-campaign.html')?'Click here to review':'Open link');link.style.fontWeight='800';link.style.color='inherit';link.style.textDecoration='underline';node.append(link);last=index+match[0].length}if(last<value.length)node.append(document.createTextNode(value.slice(last)));agentChat.appendChild(node);agentChat.scrollTop=agentChat.scrollHeight}";
const badgeBefore='function badge(value){return `<span class="pill">${esc(value)}</span>`}';
const badgeAfter="function humanAgentLabel(value){const text=String(value??'');const labels={CREATE_TRAINING_DRAFT:'Education draft',REVISE_TRAINING_DRAFT:'Education revision',MARK_TRAINING_READY:'Ready to send',SEND_TRAINING:'Education sent',GET_TRAINING_STATUS:'Education status',EXECUTED:'Done',PROPOSED:'Needs approval',WAITING_APPROVAL:'Waiting for approval',LOW:'Routine',MEDIUM:'Moderate',HIGH:'High priority'};return labels[text]||text.replaceAll('_',' ').toLowerCase().replace(/\\b\\w/g,c=>c.toUpperCase())}function plainAgentText(value){return String(value??'').replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,'$1')}function badge(value){return `<span class=\"pill\">${esc(humanAgentLabel(value))}</span>`}";
const resultBefore='${esc(JSON.stringify(pending?payload:result,null,2))}';
const resultAfter="${esc(result.message?plainAgentText(result.message):JSON.stringify(pending?payload:result,null,2))}";

async function patchPortal(relativePath){
  const file=path.join(root,relativePath);
  try{await access(file)}catch(error){if(error?.code==='ENOENT')return;throw error}
  let portal=await readFile(file,'utf8');
  portal=replaceRequired(portal,bubbleBefore,bubbleAfter,`${relativePath} clickable chat reply`);
  portal=replaceRequired(portal,badgeBefore,badgeAfter,`${relativePath} human action labels`);
  if(!portal.includes(resultAfter)){
    if(!portal.includes(resultBefore))throw new Error(`${relativePath} human action-result anchor changed`);
    portal=portal.replace(resultBefore,resultAfter);
  }
  await writeFile(file,portal,'utf8');
}

await patchPortal('it-solutions.html');
await patchPortal(path.join('dist-web','it-solutions.html'));

console.log('IT Agent education review UX installed: natural replies, clickable review labels, human Action Center wording, and listen-first next-step behavior.');
