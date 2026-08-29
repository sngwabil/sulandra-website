/* Sulandra IT Agent conversational workspace.
   Shows live request/system activity without exposing private model reasoning. */
(()=>{
  if(window.__SULANDRA_IT_CONVERSATIONAL_UI__)return;
  window.__SULANDRA_IT_CONVERSATIONAL_UI__=true;

  const ready=()=>{
    document.body?.classList.add('it-conversational-ui');

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
  let current=null;

  function scrollToWork(node){
    try{node?.scrollIntoView({block:'nearest',behavior:'smooth'})}catch{}
    const container=chat();if(container)container.scrollTop=container.scrollHeight;
  }

  function createActivity(kind){
    finishActivity(current,'Replaced by a newer request',true);
    const container=chat();
    if(!container)return null;
    const isExecute=kind==='execute';
    const node=document.createElement('div');
    node.className='sulandra-live-activity';
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
    node.innerHTML=`<div class="sulandra-live-card"><div class="sulandra-live-head"><span class="sulandra-live-dot"></span><span class="sulandra-live-label">${isExecute?'Executing approved action':'Sulandra IT Agent is working'}</span><span class="sulandra-live-dots"><i></i><i></i><i></i></span><span class="sulandra-live-time">0s</span></div><div class="sulandra-live-copy">${isExecute?'The approved action is running. Execution evidence will appear when it completes.':'Request sent. Live system activity stays visible until the agent returns a result.'}</div></div>`;
    container.appendChild(node);
    if(!isExecute){const quick=suggestions();if(quick)quick.style.display='none'}
    const started=Date.now();
    const timer=setInterval(()=>{
      if(!node.isConnected)return;
      const seconds=Math.floor((Date.now()-started)/1000);
      const time=node.querySelector('.sulandra-live-time');
      const copy=node.querySelector('.sulandra-live-copy');
      if(time)time.textContent=`${seconds}s`;
      if(copy&&!isExecute){
        if(seconds>=20)copy.textContent='This request is still active. The agent is continuing to work; it has not been dropped.';
        else if(seconds>=9)copy.textContent='Still processing. The conversation remains active while the result is being prepared.';
        else if(seconds>=3)copy.textContent='The agent request is still running. I’ll show the result here as soon as it returns.';
      }else if(copy&&isExecute&&seconds>=8)copy.textContent='The action is still running. Sulandra will keep this request active until trusted execution returns.';
      scrollToWork(node);
    },1000);

    const observer=new MutationObserver(records=>{
      if(!current||current.node!==node||!current.responseReturned)return;
      const hasReply=records.some(record=>[...record.addedNodes].some(added=>{
        if(!(added instanceof HTMLElement)||added===node||added.classList.contains('sulandra-live-activity'))return false;
        return added.matches?.('.bubble.agent,.chat-bubble.agent,.chat-bubble.assistant')||added.querySelector?.('.bubble.agent,.chat-bubble.agent,.chat-bubble.assistant');
      }));
      if(hasReply)finishActivity(current,isExecute?'Action complete':'Response ready');
    });
    observer.observe(container,{childList:true,subtree:true});
    current={node,timer,observer,started,kind,responseReturned:false,finished:false};
    scrollToWork(node);
    return current;
  }

  function finishActivity(activity,label='Response ready',silent=false,failed=false){
    if(!activity||activity.finished)return;
    activity.finished=true;
    clearInterval(activity.timer);
    try{activity.observer?.disconnect()}catch{}
    const node=activity.node;
    if(node?.isConnected){
      const dots=node.querySelector('.sulandra-live-dots');
      const dot=node.querySelector('.sulandra-live-dot');
      const title=node.querySelector('.sulandra-live-label');
      const copy=node.querySelector('.sulandra-live-copy');
      const time=node.querySelector('.sulandra-live-time');
      if(dots)dots.remove();
      if(dot){dot.style.animation='none';dot.style.background=failed?'#a22b2b':'#176b43'}
      if(title)title.textContent=label;
      if(copy)copy.textContent=failed?'The request stopped before a result was returned.':'Live system activity complete.';
      if(time)time.textContent=`${Math.max(1,Math.floor((Date.now()-activity.started)/1000))}s`;
      setTimeout(()=>{try{node.remove()}catch{}},silent?0:850);
    }
    if(current===activity)current=null;
  }

  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const chatRequest=url.includes('/api/it-solutions/agent/chat');
    const executeRequest=/\/api\/it-solutions\/agent\/actions\/[^/]+\/execute(?:\?|$)/.test(url);
    if(!chatRequest&&!executeRequest)return originalFetch(input,init);

    const activity=createActivity(executeRequest?'execute':'chat');
    try{
      const response=await originalFetch(input,init);
      if(activity){
        activity.responseReturned=true;
        if(!response.ok){finishActivity(activity,`Request stopped (${response.status})`,false,true)}
        else setTimeout(()=>{if(activity&&!activity.finished)finishActivity(activity,executeRequest?'Action result received':'Response received')},1400);
      }
      return response;
    }catch(error){
      finishActivity(activity,'Request stopped',false,true);
      throw error;
    }
  };
})();
