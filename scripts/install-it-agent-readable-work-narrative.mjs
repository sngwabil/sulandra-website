import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'api','src','it-agent-workbench-routes.ts');
const marker='IT_AGENT_READABLE_WORK_NARRATIVE_V1';
let source=await readFile(file,'utf8');
const must=(ok,label)=>{if(!ok)throw new Error(`IT Agent readable work narrative anchor changed: ${label}`)};

if(!source.includes(marker)){
  const helperAnchor="const normalizeRisk=(value:unknown)=>{const risk=clean(value,20).toUpperCase();return ['LOW','MEDIUM','HIGH'].includes(risk)?risk:'HIGH'};";
  must(source.includes(helperAnchor),'observable narrative helpers');
  const helpers=`\n/* ${marker}: expose concise, truthful work summaries to Status Board without exposing private chain-of-thought. */\nconst observableRequestPlan=(value:unknown)=>{\n  const text=redact(clean(value,900)).toLowerCase();\n  if(/\\b(fall prevention|education|training|course|assignment|assigned|completion|complete)\\b/.test(text)&&/\\b(email|remind|reminder|send|assign|status|who|outstanding)\\b/.test(text))return 'Identify the referenced education campaign, check the current assignments/completion state and intended recipients, then perform only the requested authorized education or reminder step and record the verified result.';\n  if(/\\b(education|training|course|lesson|campaign)\\b/.test(text))return 'Identify the relevant education campaign, review its current draft/distribution/assignment state, and use the education workflow needed for this request.';\n  if(/\\b(code|bug|fix|regression|button|route|ui|interface|layout|deploy|deployment|production|github|pull request|\\bpr\\b)\\b/.test(text))return 'Inspect the trusted repository and release evidence, identify the affected area, classify the request as an established repair or a new/material change, then follow the PR, gate, merge and deployment boundaries that actually apply.';\n  if(/\\b(branch|repository|repo|html|file|files|source|commit)\\b/.test(text))return 'Inspect the active repository/release context and the matching files or evidence needed to answer the repository question.';\n  if(/\\b(railway|build|building|deploying|deployment|service|services|health)\\b/.test(text))return 'Check the trusted service/release context first; report a live Railway, build or deployment state only if that verification is actually performed.';\n  if(/\\b(image|picture|poster|graphic|illustration|meme)\\b/.test(text)&&/\\b(create|generate|make|design|render)\\b/.test(text))return 'Confirm the requested visual and destination, run the image-generation path, then surface the resulting artifact in this conversation.';\n  if(/\\b(pdf|document|checklist)\\b/.test(text)&&/\\b(create|generate|make|download)\\b/.test(text))return 'Confirm the requested document content, generate the artifact, and return the verified document result in this conversation.';\n  if(/\\b(email|mail|announcement|notify|notification|message)\\b/.test(text))return 'Identify the requested communication, verify its audience/destination and execution boundary, then perform only the authorized send/publish action and record the result.';\n  return 'Load the relevant chat, repository and Sulandra system context, compare the available evidence with the request, then answer directly or use the smallest authorized action required.';\n};\nconst observableToolLabel=(name:unknown)=>{\n  const key=clean(name,120);\n  const labels:Record<string,string>={\n    publish_intranet_content:'Publishing intranet content',post_intranet_meme:'Generating an intranet image/card',send_employee_announcement:'Preparing an employee announcement',send_employee_notification:'Preparing an employee notification',send_employee_email:'Preparing an employee email',request_code_change:'Preparing engineering work',create_training_draft:'Creating an education draft',revise_training_draft:'Revising the education draft',mark_training_ready:'Preparing education for distribution',send_training:'Assigning education and preparing delivery',get_training_status:'Checking education assignments and completion',generate_image:'Generating an image',create_pdf:'Creating a PDF',send_external_email:'Preparing an external email',analyze_attachment:'Analyzing the attached file or image'\n  };\n  return labels[key]||('Using '+key.replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase()));\n};\nconst observableToolDetail=(name:unknown,args:Record<string,unknown>)=>{\n  const key=clean(name,120);\n  const title=redact(clean(args.title||args.subject||args.summary||args.request||args.campaignTitle||args.trainingTitle,260));\n  const audience=redact(clean(args.audience,100));\n  const recipientCount=Array.isArray(args.recipientUserIds)?args.recipientUserIds.length:0;\n  if(key==='request_code_change')return [title?('Target: '+title):'',args.target?('Area: '+redact(clean(args.target,180))):'',args.changeClass?('Requested class: '+clean(args.changeClass,80)):''].filter(Boolean).join(' · ')||'Preparing the requested engineering change for the governed repair/change workflow.';\n  if(key==='send_employee_email'||key==='send_external_email')return [title?('Subject: '+title):'',audience?('Audience: '+audience):'',recipientCount?(`${recipientCount} selected recipient${recipientCount===1?'':'s'}`):''].filter(Boolean).join(' · ')||'Resolving the intended recipients and communication details.';\n  if(key==='send_training'||key==='get_training_status'||key==='create_training_draft'||key==='revise_training_draft'||key==='mark_training_ready')return title?('Education: '+title):'Resolving the referenced education campaign and its current state.';\n  if(key==='generate_image'||key==='post_intranet_meme')return title?('Visual: '+title):'Preparing the requested original visual artifact.';\n  if(key==='create_pdf')return title?('Document: '+title):'Preparing the requested PDF artifact.';\n  if(key==='publish_intranet_content'||key==='send_employee_announcement'||key==='send_employee_notification')return title?('Item: '+title):'Preparing the requested communication/content action.';\n  return title||'Using the selected Sulandra tool for this request.';\n};\n`;
  source=source.replace(helperAnchor,helperAnchor+helpers);
}

if(!source.includes("'understanding','done','Understanding your request'")){
  const anchor="await progress(auth,requestId,conversationId,'request','done','Request received',`User request: ${clean(input.message,320)}`);";
  must(source.includes(anchor),'understanding event');
  source=source.replace(anchor,`${anchor}await progress(auth,requestId,conversationId,'understanding','done','Understanding your request',\`You asked: \${redact(clean(input.message,360))}\`);await progress(auth,requestId,conversationId,'plan','done','Choosing what to check',observableRequestPlan(input.message));`);
}

if(!source.includes("'decision','done',observableCalls.length?'Next step selected':'Preparing the answer'")){
  const anchor="await progress(auth,requestId,conversationId,'agent','done','Evidence evaluation completed','The model returned a response plan and any requested tool actions. Private chain-of-thought is not exposed.');";
  must(source.includes(anchor),'decision event');
  const decision=`${anchor}const observableCalls=(payload.output||[]).filter(item=>item.type==='function_call'&&item.name).map(item=>String(item.name));await progress(auth,requestId,conversationId,'decision','done',observableCalls.length?'Next step selected':'Preparing the answer',observableCalls.length?\`Sulandra selected: \${observableCalls.map(observableToolLabel).join(' → ')}.\`:'No side-effect action is needed; the agent is preparing a grounded answer from the retrieved evidence.');`;
  source=source.replace(anchor,decision);
}

if(!source.includes("'tool','running',observableToolLabel(item.name)")){
  const chatStart=source.indexOf("app.post('/api/it-solutions/agent/chat'");
  must(chatStart>=0,'chat route for tool narrative');
  const needle="try{args=JSON.parse(item.arguments||'{}')}catch{continue}";
  const at=source.indexOf(needle,chatStart);
  must(at>=chatStart,'tool argument loop');
  source=source.slice(0,at+needle.length)+"await progress(auth,requestId,conversationId,'tool','running',observableToolLabel(item.name),observableToolDetail(item.name,args));"+source.slice(at+needle.length);
}

if(!source.includes("'tool','done','Tool state recorded'")){
  const responseNeedles=[
    "await progress(auth,requestId,conversationId,'response',deferFinal?'waiting':'done'",
    "await progress(auth,requestId,conversationId,'response','done','Answer ready'"
  ];
  let at=-1;for(const needle of responseNeedles){const found=source.indexOf(needle);if(found>=0){at=found;break}}
  must(at>=0,'tool completion handoff');
  source=source.slice(0,at)+"if(observableCalls.length)await progress(auth,requestId,conversationId,'tool','done','Tool state recorded','The selected tool path returned its current verified state. Any continuing approval, GitHub-gate, merge or Railway work remains visible as separate status events when it actually occurs.');"+source.slice(at);
}

await writeFile(file,source,'utf8');
console.log('IT Agent readable Status Board narrative installed: request understanding, work plan, evidence checks, selected tools and verified handoff state are visible without exposing private chain-of-thought.');
