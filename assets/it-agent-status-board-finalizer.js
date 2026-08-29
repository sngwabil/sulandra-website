/* IT_AGENT_STATUS_BOARD_FINALIZER_V4
   Dedicated per-chat Status Board for observable work progress.
   Main-chat working/countdown cards stay in the conversation; this rail shows
   authenticated request/repository/system/tool/action progress, not private reasoning. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__)return;
  window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__=true;

  const qs=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const OPEN_KEY='sulandra:it-agent:status-board-open';
  const REQUEST_KEY_PREFIX='sulandra:it-agent:status-request:';
  const previousFetch=window.fetch.bind(window);
  let drawer=null,button=null,backdrop=null,feed=null;
  let activeRequestId='',activeConversationId='',activePollToken=0,pollTimer=null;
  let activeHeaders=null,activeCredentials='same-origin';
  let latestProgressEvents=[],latestActionEvents=[];

  const compact=()=>window.matchMedia('(max-width:699px)').matches;
  const readOpen=()=>{try{return sessionStorage.getItem(OPEN_KEY)==='1'}catch{return false}};
  const writeOpen=open=>{try{sessionStorage.setItem(OPEN_KEY,open?'1':'0')}catch{}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
  const clean=(value,max=1400)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const requestStorageKey=conversationId=>REQUEST_KEY_PREFIX+String(conversationId||'');
  const storeRequest=(conversationId,requestId)=>{if(!conversationId||!requestId)return;try{sessionStorage.setItem(requestStorageKey(conversationId),requestId)}catch{}};
  const storedRequest=conversationId=>{try{return sessionStorage.getItem(requestStorageKey(conversationId))||''}catch{return''}};
  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

  function setOpen(open,{manual=false}={}){
    if(!drawer||!button)return;
    const next=Boolean(open);
    drawer.classList.toggle('itws-open',next);
    document.body.classList.toggle('itws-status-board-open',next);
    backdrop?.classList.toggle('open',next&&compact());
    button.setAttribute('aria-expanded',next?'true':'false');
    button.setAttribute('aria-label',next?'Close status board':'Open status board');
    if(manual||next)writeOpen(next);
  }

  function statusClass(value){
    const status=clean(value,40).toLowerCase();
    if(['done','success','completed'].includes(status))return'done';
    if(['error','failed','failure'].includes(status))return'error';
    if(['waiting','pending','approval'].includes(status))return'waiting';
    return'running';
  }
  function statusIcon(status){const kind=statusClass(status);return kind==='done'?'✓':kind==='error'?'×':kind==='waiting'?'!':''}

  function renderEmpty(title='No active work in this chat.',detail='When Sulandra starts checking, searching, creating, executing, building, or deploying something, the verified work steps will appear here.'){
    if(!feed)return;
    feed.innerHTML=`<div class="itws-status-board-empty"><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`;
  }
  function renderWaiting(message){
    latestProgressEvents=[];latestActionEvents=[];
    if(!feed)return;
    const text=clean(message,320);
    feed.innerHTML=`<div class="itws-status-event running itws-status-event-local"><span class="itws-status-event-icon"></span><span class="itws-status-event-body"><strong>Request sent</strong><span>${esc(text?`Waiting for the first verified work event for: ${text}`:'Waiting for the first verified work event from Sulandra IT.')}</span></span></div>`;
  }

  function renderCombined(){
    if(!feed)return;
    const events=[...latestProgressEvents,...latestActionEvents];
    if(!events.length)return;
    feed.innerHTML='';
    events.forEach(event=>{
      const kind=statusClass(event?.status);
      const row=document.createElement('div');row.className=`itws-status-event ${kind}`;
      const icon=document.createElement('span');icon.className='itws-status-event-icon';icon.textContent=statusIcon(event?.status);
      const body=document.createElement('span');body.className='itws-status-event-body';
      const label=document.createElement('strong');label.textContent=clean(event?.label,240)||'Working';
      const detail=document.createElement('span');detail.textContent=clean(event?.detail,1400);if(!detail.textContent)detail.style.display='none';
      const meta=document.createElement('small');const time=event?.createdAt?new Date(event.createdAt):null;meta.textContent=time&&!Number.isNaN(time.getTime())?time.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'}):'';
      body.append(label,detail,meta);row.append(icon,body);feed.appendChild(row);
    });
    drawer?.scrollTo({top:drawer.scrollHeight,behavior:'smooth'});
  }

  function actionEvents(actions){
    if(!activeConversationId||!Array.isArray(actions))return{events:[],active:false,terminal:false};
    const rows=actions.filter(action=>String(action?.conversationId||'')===String(activeConversationId)).slice(0,8).reverse();
    let active=false,terminal=false;
    const events=[];
    rows.forEach(action=>{
      const status=String(action?.status||'').toUpperCase();
      const result=asObject(action?.result);const release=asObject(result.release);const worker=asObject(result.codingWorker);
      const summary=clean(action?.summary,420)||clean(action?.actionType,120)||'IT action';
      let event=null;
      if(status==='WAITING_CI'){
        active=true;event={status:'running',label:'Checking required GitHub release gates',detail:clean(release.message||release.gateReason||`PR #${release.prNumber||worker.prNumber||''} is waiting for required checks.`,1200),createdAt:action.updatedAt||action.createdAt};
      }else if(status==='DEPLOYING'){
        active=true;const production=asObject(release.productionEvidence);const state=clean(production.state,100);event={status:'running',label:'Checking Railway production deployment',detail:clean(`${release.message||'Railway production verification is active.'}${state?` Current verification: ${state}.`:''}`,1200),createdAt:action.updatedAt||action.createdAt};
      }else if(status==='IN_PROGRESS'||status==='RETRYING'||status==='QUEUED'){
        active=true;event={status:'running',label:status==='RETRYING'?'Retrying IT action':'Executing IT action',detail:summary,createdAt:action.updatedAt||action.createdAt};
      }else if(status==='PROPOSED'){
        event={status:action.approvalRequired?'waiting':'done',label:action.approvalRequired?'Waiting for owner approval':'Action prepared',detail:summary,createdAt:action.updatedAt||action.createdAt};
        if(action.approvalRequired)active=true;
      }else if(status==='PR_OPEN'){
        event={status:'done',label:'Coding worker opened a pull request',detail:clean(result.message||`PR #${worker.prNumber||''} · ${worker.branch||''}`,1200),createdAt:action.updatedAt||action.createdAt};terminal=true;
      }else if(status==='EXECUTED'||status==='DONE'){
        event={status:'done',label:String(release.phase||'').toUpperCase()==='PRODUCTION_GREEN'?'Railway production verification completed':'IT action completed',detail:clean(release.message||result.message||summary,1200),createdAt:action.updatedAt||action.createdAt};terminal=true;
      }else if(status==='FAILED'||status==='REJECTED'){
        event={status:'error',label:status==='REJECTED'?'Action rejected':'IT action failed',detail:clean(release.error||result.message||summary,1200),createdAt:action.updatedAt||action.createdAt};terminal=true;
      }
      if(event)events.push(event);
    });
    return{events,active,terminal};
  }

  function stopPolling(){activePollToken+=1;if(pollTimer){clearTimeout(pollTimer);pollTimer=null}}
  function cloneHeaders(input,init){try{if(init?.headers)return new Headers(init.headers);if(input instanceof Request)return new Headers(input.headers)}catch{}return new Headers()}
  function requestCredentials(input,init){if(init?.credentials)return init.credentials;if(input instanceof Request&&input.credentials)return input.credentials;return'same-origin'}

  async function readActionState(headers){
    if(!activeConversationId)return{events:[],active:false,terminal:false};
    try{
      const response=await previousFetch('/api/it-solutions/agent/actions',{method:'GET',headers,credentials:activeCredentials,cache:'no-store'});
      if(!response.ok)return{events:latestActionEvents,active:false,terminal:false};
      const payload=await response.json().catch(()=>({}));
      return actionEvents(payload?.data?.actions||payload?.actions||[]);
    }catch{return{events:latestActionEvents,active:false,terminal:false}}
  }

  async function pollOnce(requestId,token,{continuePolling=true}={}){
    if(!requestId||token!==activePollToken)return;
    let responseTerminal=false;let actionState={events:latestActionEvents,active:false,terminal:false};
    try{
      const headers=new Headers(activeHeaders||{});headers.set('Accept','application/json');
      const response=await previousFetch(`/api/it-solutions/agent/progress/${encodeURIComponent(requestId)}`,{method:'GET',headers,credentials:activeCredentials,cache:'no-store'});
      if(response.ok){
        const payload=await response.json().catch(()=>({}));const events=payload?.data?.events||payload?.events||[];
        if(token!==activePollToken)return;
        if(events.length)latestProgressEvents=events;
        responseTerminal=events.some(event=>String(event?.phase||'').toLowerCase()==='response'&&['done','error','failed'].includes(String(event?.status||'').toLowerCase()));
      }
      actionState=await readActionState(headers);
      if(token!==activePollToken)return;
      latestActionEvents=actionState.events;renderCombined();
    }catch{}
    const done=(responseTerminal&&!actionState.active)||actionState.terminal;
    if(!done&&continuePolling&&token===activePollToken)pollTimer=setTimeout(()=>void pollOnce(requestId,token),800);
  }

  function beginRequest(requestId,message,input,init,conversationId=''){
    stopPolling();activeRequestId=requestId;activeConversationId=conversationId||'';activeHeaders=cloneHeaders(input,init);activeCredentials=requestCredentials(input,init);const token=activePollToken;
    renderWaiting(message);setOpen(true);void pollOnce(requestId,token);
  }
  function showClientError(message){if(!feed)return;const row=document.createElement('div');row.className='itws-status-event error';row.innerHTML='<span class="itws-status-event-icon">×</span><span class="itws-status-event-body"><strong>Request did not complete</strong><span></span></span>';const detail=qs('.itws-status-event-body span',row);if(detail)detail.textContent=clean(message,900)||'The chat request failed before a completed progress event was returned.';feed.appendChild(row);drawer?.scrollTo({top:drawer.scrollHeight,behavior:'smooth'})}

  function installFetchProgress(){
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:String(input?.url||'');const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
      if(method!=='POST'||!url.includes('/api/it-solutions/agent/chat'))return previousFetch(input,init);
      const nextInit=init?{...init}:{};let body=null;if(typeof nextInit.body==='string'){try{body=JSON.parse(nextInit.body)}catch{}}
      if(!body||typeof body!=='object')return previousFetch(input,init);
      const requestId=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`);body.requestId=requestId;nextInit.body=JSON.stringify(body);
      beginRequest(requestId,clean(body.message,320),input,nextInit,clean(body.conversationId,120));
      try{
        const response=await previousFetch(input,nextInit);const token=activePollToken;
        response.clone().json().then(payload=>{const conversationId=payload?.data?.conversationId||payload?.conversationId||'';if(conversationId){activeConversationId=conversationId;storeRequest(conversationId,requestId);setTimeout(()=>void pollOnce(requestId,token,{continuePolling:false}),25)}}).catch(()=>{});
        if(!response.ok){showClientError(`Server returned HTTP ${response.status}.`);stopPolling()}
        return response;
      }catch(error){showClientError(error instanceof Error?error.message:String(error||'Request failed'));stopPolling();throw error}
    };
  }

  function loadConversationProgress(conversationId){
    stopPolling();activeRequestId='';activeConversationId=conversationId;latestProgressEvents=[];latestActionEvents=[];
    const requestId=storedRequest(conversationId);if(!requestId){renderEmpty();return}
    activeRequestId=requestId;activeHeaders=new Headers();activeCredentials='same-origin';const token=activePollToken;
    renderEmpty('Loading this chat’s latest work…','Retrieving the most recent verified Status Board events saved for this conversation.');void pollOnce(requestId,token,{continuePolling:false});
  }
  function installConversationTracking(){
    document.getElementById('itwsNewChat')?.addEventListener('click',()=>{stopPolling();activeRequestId='';activeConversationId='';latestProgressEvents=[];latestActionEvents=[];renderEmpty()},true);
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('[data-itws-conversation]'):null;const conversationId=target?.getAttribute('data-itws-conversation')||'';if(conversationId)setTimeout(()=>loadConversationProgress(conversationId),40)},true);
    const current=(()=>{try{return sessionStorage.getItem('sulandra:it-agent:conversation')||''}catch{return''}})();if(current)setTimeout(()=>loadConversationProgress(current),60);
  }

  function installDedicatedBoard(){
    const agent=document.getElementById('agent');const shell=qs('.agent-shell',agent);const main=qs('.agent-main',agent);const head=qs('.agent-head',main);if(!agent||!shell||!main||!head)return false;
    drawer=qs('.itws-status-board-drawer',shell);
    if(!drawer){drawer=document.createElement('aside');drawer.className='itws-status-board-drawer';drawer.setAttribute('aria-label','Status Board');drawer.innerHTML=`<button type="button" class="itws-status-board-close" aria-label="Close status board">×</button><div class="itws-status-board-head"><h2>Status Board</h2><p>Verified work steps for this chat, in real time.</p></div><div id="itwsStatusBoardFeed" class="itws-status-board-feed" role="status" aria-live="polite"></div><div class="itws-status-board-privacy">Shows observable request, repository, system, tool, action, GitHub-gate and Railway deployment evidence when actually checked. Private model chain-of-thought is not displayed.</div>`;shell.appendChild(drawer)}
    feed=qs('#itwsStatusBoardFeed',drawer)||qs('.itws-status-board-feed',drawer);
    const oldButton=document.getElementById('itwsActivity');button=document.createElement('button');button.type='button';button.id='itwsActivity';button.className='itws-activity-toggle';button.textContent='Status Board';button.style.setProperty('display','block','important');button.style.setProperty('visibility','visible','important');button.style.setProperty('opacity','1','important');button.style.setProperty('pointer-events','auto','important');if(oldButton?.parentElement)oldButton.replaceWith(button);else head.appendChild(button);
    backdrop=qs('.itws-drawer-backdrop');if(!backdrop){backdrop=document.createElement('div');backdrop.className='itws-drawer-backdrop';document.body.appendChild(backdrop)}
    const close=qs('.itws-status-board-close',drawer);button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setOpen(!drawer.classList.contains('itws-open'),{manual:true})});close?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setOpen(false,{manual:true})});backdrop.addEventListener('click',()=>setOpen(false,{manual:true}));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawer?.classList.contains('itws-open'))setOpen(false,{manual:true})});window.addEventListener('resize',()=>{if(drawer?.classList.contains('itws-open'))backdrop?.classList.toggle('open',compact())},{passive:true});
    renderEmpty();setOpen(readOpen());installFetchProgress();installConversationTracking();document.body.dataset.itwsStatusBoardReady='1';return true;
  }
  function boot(){let attempts=0;const run=()=>{attempts+=1;if(installDedicatedBoard()||attempts>=50)return;setTimeout(run,50)};run()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
