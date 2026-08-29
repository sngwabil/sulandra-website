/* Sulandra IT Agent conversational workspace.
   Shows truthful live request/action activity without exposing private model reasoning. */
(()=>{
  if(window.__SULANDRA_IT_CONVERSATIONAL_UI__)return;
  window.__SULANDRA_IT_CONVERSATIONAL_UI__=true;

  const LIVE_STYLE_ID='sulandra-it-live-activity-style-v2';
  const installLiveStyles=()=>{
    if(document.getElementById(LIVE_STYLE_ID))return;
    const style=document.createElement('style');
    style.id=LIVE_STYLE_ID;
    style.textContent=`
      .sulandra-live-activity{width:min(820px,100%)!important;margin:0 auto 24px!important;position:relative!important;padding:4px 8px 4px 46px!important;color:#34495c!important;font-size:13px!important;line-height:1.45!important}
      .sulandra-live-activity::before{content:'IT'!important;position:absolute!important;left:4px!important;top:1px!important;width:30px!important;height:30px!important;border-radius:50%!important;display:grid!important;place-items:center!important;background:linear-gradient(145deg,#082f5b,#1685d1)!important;color:#fff!important;font-size:10px!important;font-weight:850!important;box-shadow:0 4px 10px rgba(11,95,158,.16)!important}
      .sulandra-live-card{display:block!important;width:min(690px,100%)!important;max-width:690px!important;background:transparent!important;border:0!important;border-radius:0!important;padding:2px 0!important}
      .sulandra-live-head{display:flex!important;align-items:center!important;gap:7px!important;min-height:25px!important;font-weight:720!important;color:#31465a!important}
      .sulandra-live-title-icon{display:inline-grid!important;place-items:center!important;width:18px!important;height:18px!important;border-radius:5px!important;border:1px solid #d8dee4!important;background:#fff!important;color:#536474!important;font-size:10px!important;flex:0 0 auto!important}
      .sulandra-live-label{font-size:13px!important;font-weight:700!important}
      .sulandra-live-time{margin-left:auto!important;color:#8a96a1!important;font-size:11px!important;font-variant-numeric:tabular-nums!important}
      .sulandra-live-steps{display:grid!important;gap:2px!important;margin-top:5px!important}
      .sulandra-live-step{display:grid!important;grid-template-columns:22px minmax(0,1fr)!important;gap:7px!important;align-items:start!important;padding:5px 0!important;color:#5e6c79!important}
      .sulandra-live-step-icon{width:18px!important;height:18px!important;border-radius:50%!important;border:1px solid #d9e0e5!important;background:#fff!important;display:grid!important;place-items:center!important;margin-top:1px!important;color:#65727d!important;font-size:10px!important;font-weight:800!important;position:relative!important}
      .sulandra-live-step.running .sulandra-live-step-icon{font-size:0!important;border-color:#b8cfdf!important}
      .sulandra-live-step.running .sulandra-live-step-icon::after{content:''!important;width:8px!important;height:8px!important;border:2px solid #d5e2eb!important;border-top-color:#1685d1!important;border-radius:50%!important;animation:sulandraLiveSpin .75s linear infinite!important}
      .sulandra-live-step.done .sulandra-live-step-icon{background:#eef8f2!important;border-color:#cde7d7!important;color:#176b43!important}
      .sulandra-live-step.waiting .sulandra-live-step-icon{background:#fff9ec!important;border-color:#eedca9!important;color:#8a6410!important}
      .sulandra-live-step.error .sulandra-live-step-icon{background:#fff0f0!important;border-color:#eccaca!important;color:#a22b2b!important}
      .sulandra-live-step-label{display:block!important;color:#3d4d5c!important;font-size:12px!important;font-weight:650!important;line-height:1.35!important}
      .sulandra-live-step-detail{display:block!important;color:#89949e!important;font-size:10.5px!important;line-height:1.35!important;margin-top:1px!important;overflow-wrap:anywhere!important}
      .sulandra-live-foot{margin-top:5px!important;color:#98a1aa!important;font-size:9.5px!important}
      .sulandra-live-activity.finished .sulandra-live-head{color:#536474!important}
      .sulandra-live-activity.failed .sulandra-live-head{color:#8b3e3e!important}
      @keyframes sulandraLiveSpin{to{transform:rotate(360deg)}}
      @media(max-width:700px){.sulandra-live-activity{padding-left:42px!important;padding-right:2px!important}.sulandra-live-card{width:100%!important}.sulandra-live-step{grid-template-columns:20px minmax(0,1fr)!important;gap:6px!important}}
    `;
    document.head.appendChild(style);
  };

  const ready=()=>{
    document.body?.classList.add('it-conversational-ui');
    installLiveStyles();
    const prompt=document.getElementById('agentPrompt');
    const sendButton=document.getElementById('agentSend')||document.getElementById('askAgentBtn');
    if(prompt){
      const grow=()=>{if(prompt.tagName==='TEXTAREA'){prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,150)+'px'}};
      prompt.addEventListener('input',grow);
      prompt.addEventListener('keydown',event=>{
        if(event.key==='Enter'&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey){
          event.preventDefault();
          (document.getElementById('agentSend')||document.getElementById('askAgentBtn'))?.click();
        }
      },true);
      grow();
    }
    if(sendButton&&!sendButton.getAttribute('aria-label'))sendButton.setAttribute('aria-label','Ask IT Agent');
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();

  const chat=()=>document.getElementById('agentChat')||document.querySelector('.chat-log')||document.querySelector('.agent-chat');
  const suggestions=()=>document.getElementById('agentQuickActions')||document.querySelector('.examples');
  const originalFetch=window.fetch.bind(window);
  let current=null;

  const clean=(value,max=600)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const actionName=type=>({
    REQUEST_CODE_CHANGE:'code change',
    PUBLISH_INTRAnet_CONTENT:'intranet content',
    GENERATE_INTRAnet_MEME:'original intranet image/card',
    SEND_ANNOUNCEMENT:'employee announcement',
    SEND_NOTIFICATION:'employee notification',
    SEND_EMAIL:'employee email',
  }[String(type||'')]||'IT action');
  const actionIdFromUrl=url=>{const match=String(url||'').match(/\/api\/it-solutions\/agent\/actions\/([^/]+)\/execute(?:\?|$)/);return match?decodeURIComponent(match[1]):''};
  const apiOrigin=url=>{try{return new URL(String(url),window.location.href).origin}catch{return''}};
  const requestHeaders=(input,init)=>{
    try{
      if(init?.headers)return new Headers(init.headers);
      if(input instanceof Request)return new Headers(input.headers);
    }catch{}
    return new Headers();
  };

  function scrollToWork(node){
    try{node?.scrollIntoView({block:'nearest',behavior:'smooth'})}catch{}
    const container=chat();if(container)container.scrollTop=container.scrollHeight;
  }

  function stepIcon(status){
    if(status==='done')return'✓';
    if(status==='waiting')return'!';
    if(status==='error')return'×';
    return'';
  }

  function upsertStep(activity,key,label,status='running',detail=''){
    if(!activity||activity.finished)return;
    let row=activity.steps.get(key);
    if(!row){
      row=document.createElement('div');
      row.className='sulandra-live-step';
      row.innerHTML='<span class="sulandra-live-step-icon"></span><span><span class="sulandra-live-step-label"></span><span class="sulandra-live-step-detail"></span></span>';
      activity.steps.set(key,row);
      activity.stepsRoot.appendChild(row);
    }
    row.className=`sulandra-live-step ${status}`;
    const icon=row.querySelector('.sulandra-live-step-icon');
    const labelNode=row.querySelector('.sulandra-live-step-label');
    const detailNode=row.querySelector('.sulandra-live-step-detail');
    if(icon)icon.textContent=stepIcon(status);
    if(labelNode)labelNode.textContent=clean(label,260);
    if(detailNode){detailNode.textContent=clean(detail,700);detailNode.style.display=detail?'block':'none'}
    scrollToWork(activity.node);
  }

  function createActivity(kind,url){
    if(current&&!current.finished)finishActivity(current,'Activity superseded by a newer request',false,true);
    const container=chat();if(!container)return null;
    const isExecute=kind==='execute';
    const node=document.createElement('div');
    node.className='sulandra-live-activity';
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
    node.innerHTML='<div class="sulandra-live-card"><div class="sulandra-live-head"><span class="sulandra-live-title-icon">↻</span><span class="sulandra-live-label"></span><span class="sulandra-live-time">0s</span></div><div class="sulandra-live-steps"></div><div class="sulandra-live-foot">Live operational activity only — private model reasoning is never displayed.</div></div>';
    container.appendChild(node);
    if(!isExecute){const quick=suggestions();if(quick)quick.style.display='none'}
    const activity={node,kind,url,started:Date.now(),steps:new Map(),stepsRoot:node.querySelector('.sulandra-live-steps'),timer:null,pollTimer:null,observer:null,responseReturned:false,finished:false,failed:false,baselineIds:new Set(),actionsById:new Map(),watchedActionId:isExecute?actionIdFromUrl(url):''};
    node.querySelector('.sulandra-live-label').textContent=isExecute?'Executing approved IT action':'Sulandra IT Agent is working';
    upsertStep(activity,'request',isExecute?'Execution request sent':'Request sent to Sulandra IT Agent','done',isExecute?'The selected Action Center item is being executed through its existing safety boundary.':'The authenticated administrator request entered the IT Agent workbench.');
    upsertStep(activity,'processing',isExecute?'Loading the selected action':'Loading conversation and trusted system context','running',isExecute?'Waiting for current action state and execution evidence.':'The request remains active while Sulandra prepares a grounded response or executable action.');
    activity.timer=setInterval(()=>{
      if(!node.isConnected||activity.finished)return;
      const seconds=Math.floor((Date.now()-activity.started)/1000);
      const time=node.querySelector('.sulandra-live-time');if(time)time.textContent=`${seconds}s`;
      if(seconds>=20&&!activity.actionsById.size)upsertStep(activity,'processing',isExecute?'Execution is still active':'Sulandra IT Agent is still working','running','The server request is active; no completion result has been returned yet.');
    },1000);
    if(!isExecute){
      activity.observer=new MutationObserver(records=>{
        if(activity.finished||!activity.responseReturned)return;
        const hasReply=records.some(record=>[...record.addedNodes].some(added=>{
          if(!(added instanceof HTMLElement)||added===node||added.classList.contains('sulandra-live-activity'))return false;
          return added.matches?.('.bubble.agent,.chat-bubble.agent,.chat-bubble.assistant')||added.querySelector?.('.bubble.agent,.chat-bubble.agent,.chat-bubble.assistant');
        }));
        if(hasReply)finishActivity(activity,'Sulandra IT Agent finished');
      });
      activity.observer.observe(container,{childList:true,subtree:true});
    }
    current=activity;scrollToWork(node);return activity;
  }

  function resultDetail(action){
    const result=action?.result&&typeof action.result==='object'?action.result:{};
    const worker=result.codingWorker&&typeof result.codingWorker==='object'?result.codingWorker:{};
    if(worker.prNumber){
      const branch=clean(worker.branch,180),commit=clean(worker.commitSha,80);
      return `PR #${worker.prNumber}${branch?` · ${branch}`:''}${commit?` · commit ${commit.slice(0,12)}`:''}`;
    }
    if(result.recipientCount!=null)return `${Number(result.recipientCount)||0} recipient${Number(result.recipientCount)===1?'':'s'}`;
    if(result.resourceType)return `${clean(result.resourceType,100)}${result.resourceId?` · ${clean(result.resourceId,90)}`:''}`;
    if(result.message)return clean(result.message,600);
    return'';
  }

  function processAction(activity,action){
    if(!activity||!action?.id)return;
    activity.actionsById.set(String(action.id),action);
    const id=String(action.id),type=String(action.actionType||''),status=String(action.status||'').toUpperCase();
    const summary=clean(action.summary,300)||`Prepared ${actionName(type)}`;
    upsertStep(activity,`prepared:${id}`,`Prepared ${actionName(type)}`,'done',summary);
    if(type==='REQUEST_CODE_CHANGE'){
      const payload=action.payload&&typeof action.payload==='object'?action.payload:{};
      const serverPolicy=payload?.serverPolicy&&typeof payload.serverPolicy==='object'?payload.serverPolicy:null;
      const evidence=Number(serverPolicy?.evidenceCount||0);
      if(serverPolicy)upsertStep(activity,`evidence:${id}`,'Checked trusted release and repository evidence','done',evidence?`${evidence} approved evidence match${evidence===1?'':'es'} were available to the server policy.`:'No sufficient established-repair evidence was recorded; the safety boundary stays conservative.');
      if(action.changeClass==='ESTABLISHED_OPERATION_REPAIR'&&action.approvalRequired===false){
        upsertStep(activity,`policy:${id}`,'Established-operation repair boundary verified','done',evidence?`${evidence} trusted release evidence match${evidence===1?'':'es'} supported automatic PR-only dispatch.`:'The server classified this as a bounded repair eligible for PR-only dispatch.');
      }else if(action.approvalRequired===true){
        upsertStep(activity,`policy:${id}`,'Owner approval is required before code execution','waiting','This is a new/material or insufficiently-proven code change. Execute from Action Center only if you approve it.');
      }
    }
    if(status==='IN_PROGRESS'){
      upsertStep(activity,`state:${id}`,type==='REQUEST_CODE_CHANGE'?'Trusted coding worker is running':`Executing ${actionName(type)}`,'running',type==='REQUEST_CODE_CHANGE'?'The approved PR-only worker is operating against release/sulandra-1.0.':'Sulandra has not returned final execution evidence yet.');
    }else if(status==='PR_OPEN'){
      upsertStep(activity,`state:${id}`,'Trusted coding worker opened a pull request','done',resultDetail(action)||'PR evidence was returned by the coding worker.');
    }else if(status==='EXECUTED'||status==='DONE'){
      upsertStep(activity,`state:${id}`,`${actionName(type)} execution completed`,'done',resultDetail(action)||'The action record contains completed execution evidence.');
    }else if(status==='FAILED'){
      upsertStep(activity,`state:${id}`,`${actionName(type)} execution failed`,'error',resultDetail(action)||'The action record reports a failed execution.');
    }else if(status==='REJECTED'){
      upsertStep(activity,`state:${id}`,'Action rejected','error',resultDetail(action)||'The administrator rejected this action.');
    }else if(status==='PROPOSED'){
      upsertStep(activity,`state:${id}`,action.approvalRequired?'Waiting for owner approval':'Action is ready in Action Center','waiting',action.approvalRequired?'No code execution starts until the administrator approves and presses Execute.':'The proposal is prepared; execution has not happened yet.');
    }
    upsertStep(activity,'processing',activity.kind==='execute'?'Action state received':'Agent action state received','done','Live status is grounded in the current IT Agent action record.');
  }

  async function readActions(url,input,init){
    const origin=apiOrigin(url);if(!origin)return[];
    const headers=requestHeaders(input,init);headers.set('Accept','application/json');
    const response=await originalFetch(`${origin}/api/it-solutions/agent/actions`,{method:'GET',headers,credentials:init?.credentials});
    if(!response.ok)return[];
    const payload=await response.json().catch(()=>({}));
    const data=payload?.data??payload;
    return Array.isArray(data?.actions)?data.actions:[];
  }

  function relevantActions(activity,actions){
    if(activity.watchedActionId)return actions.filter(row=>String(row?.id||'')===activity.watchedActionId);
    return actions.filter(row=>!activity.baselineIds.has(String(row?.id||'')));
  }

  async function pollActions(activity,input,init){
    if(!activity||activity.finished)return;
    try{
      const actions=await readActions(activity.url,input,init);
      relevantActions(activity,actions).forEach(action=>processAction(activity,action));
    }catch{}
  }

  async function primeActivity(activity,input,init){
    if(!activity)return;
    if(activity.watchedActionId){
      await pollActions(activity,input,init);
    }else{
      try{const actions=await readActions(activity.url,input,init);actions.forEach(row=>activity.baselineIds.add(String(row?.id||'')))}catch{}
    }
    activity.pollTimer=setInterval(()=>pollActions(activity,input,init),750);
  }

  function processResponse(activity,payload){
    if(!activity)return;
    const data=payload?.data??payload??{};
    if(Array.isArray(data.proposals)&&data.proposals.length)data.proposals.forEach(proposal=>processAction(activity,proposal));
    if(data.id&&data.status){
      const prior=activity.actionsById.get(String(data.id))||{};
      processAction(activity,{...prior,id:data.id,status:data.status,result:data.result??prior.result});
    }
    if(!activity.actionsById.size){
      upsertStep(activity,'processing',activity.kind==='execute'?'Execution result received':'Agent response prepared','done',activity.kind==='execute'?'The server returned the execution result.':'No executable action was created; the final conversational response is ready.');
    }
    upsertStep(activity,'result','Final result returned by Sulandra','done',activity.kind==='execute'?'Action Center received the execution result.':'The completed response is being added to the conversation.');
  }

  function finishActivity(activity,label='Sulandra IT Agent finished',failed=false,superseded=false){
    if(!activity||activity.finished)return;
    activity.finished=true;activity.failed=failed;
    clearInterval(activity.timer);clearInterval(activity.pollTimer);
    try{activity.observer?.disconnect()}catch{}
    if(activity.node?.isConnected){
      activity.node.classList.add('finished');if(failed)activity.node.classList.add('failed');
      const title=activity.node.querySelector('.sulandra-live-label');if(title)title.textContent=label;
      const titleIcon=activity.node.querySelector('.sulandra-live-title-icon');if(titleIcon)titleIcon.textContent=failed?'×':'✓';
      const time=activity.node.querySelector('.sulandra-live-time');if(time)time.textContent=`${Math.max(1,Math.floor((Date.now()-activity.started)/1000))}s`;
      if(failed)upsertFinishedStep(activity,'terminal','Request stopped before completion','error','Sulandra did not receive trusted completion evidence for this request.');
      else if(superseded)upsertFinishedStep(activity,'terminal','A newer request took over the live activity stream','waiting','This earlier request is no longer the active trace.');
    }
    if(current===activity)current=null;
  }

  function upsertFinishedStep(activity,key,label,status,detail){
    const wasFinished=activity.finished;activity.finished=false;upsertStep(activity,key,label,status,detail);activity.finished=wasFinished;
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const chatRequest=url.includes('/api/it-solutions/agent/chat');
    const executeRequest=/\/api\/it-solutions\/agent\/actions\/[^/]+\/execute(?:\?|$)/.test(url);
    if(!chatRequest&&!executeRequest)return originalFetch(input,init);

    const activity=createActivity(executeRequest?'execute':'chat',url);
    await primeActivity(activity,input,init);
    try{
      const response=await originalFetch(input,init);
      let payload={};try{payload=await response.clone().json()}catch{}
      if(activity){
        activity.responseReturned=true;
        await pollActions(activity,input,init);
        if(!response.ok){
          const data=payload?.data??payload??{};
          const message=clean(data?.error||data?.message,500)||`Request returned HTTP ${response.status}.`;
          upsertStep(activity,'error',`Request stopped (${response.status})`,'error',message);
          finishActivity(activity,`Request stopped (${response.status})`,true);
        }else{
          processResponse(activity,payload);
          if(executeRequest)finishActivity(activity,'Execution activity complete');
          else setTimeout(()=>{if(activity&&!activity.finished)finishActivity(activity,'Sulandra IT Agent finished')},4000);
        }
      }
      return response;
    }catch(error){
      if(activity){upsertStep(activity,'error','Network request stopped','error',clean(error?.message||error,500));finishActivity(activity,'Request stopped',true)}
      throw error;
    }
  };
})();
