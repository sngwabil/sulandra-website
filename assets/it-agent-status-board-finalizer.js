/* IT_AGENT_STATUS_BOARD_FINALIZER_V5
   Request-scoped Status Board for observable Sulandra IT work.
   Every prompt owns one run. New prompts replace old board activity immediately,
   stale callbacks cannot repaint a newer run, and the chat response is released
   only after that run has reached a terminal observable state. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__)return;
  window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__=true;

  const qs=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const OPEN_KEY='sulandra:it-agent:status-board-open';
  const previousFetch=window.fetch.bind(window);
  const POLL_MS=700;
  const TERMINAL_TIMEOUT_MS=120000;
  const ACTION_CLOCK_SLOP_MS=3000;

  let drawer=null,button=null,backdrop=null,feed=null;
  let activeRun=null;
  let runSequence=0;
  let pollTimer=null;
  let fetchWrapper=null;
  let selectedConversationId='';

  const compact=()=>window.matchMedia('(max-width:699px)').matches;
  const readOpen=()=>{try{return sessionStorage.getItem(OPEN_KEY)==='1'}catch{return false}};
  const writeOpen=open=>{try{sessionStorage.setItem(OPEN_KEY,open?'1':'0')}catch{}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
  const clean=(value,max=1400)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  /* IT_AGENT_STATUS_BOARD_API_ORIGIN_FIX_V1: Status Board polling follows the same
     Railway API origin as the intercepted chat request instead of assuming the
     static website origin owns authenticated IT Agent routes. */
  const apiBaseFromRequest=input=>{
    const raw=typeof input==='string'?input:String(input?.url||'');
    try{
      const parsed=new URL(raw,window.location.href);
      if(!parsed.pathname.includes('/api/it-solutions/agent/chat'))return'';
      return parsed.origin===window.location.origin?'':parsed.origin;
    }catch{return''}
  };
  const apiUrl=(run,pathname)=>{
    const configured=String(run?.apiBase||window.SULANDRA_API_BASE||'').trim().replace(/\/$/,'');
    return configured?configured+pathname:pathname;
  };
  const runIsCurrent=run=>Boolean(run&&activeRun===run&&!run.superseded);
  const terminalProgressStatus=status=>['done','success','completed','error','failed','failure','waiting','pending','approval'].includes(clean(status,40).toLowerCase());
  const safeTime=value=>{const time=value?new Date(value).getTime():NaN;return Number.isFinite(time)?time:0};
  const collapseProgressEvents=events=>{
    const latest=new Map();
    (Array.isArray(events)?events:[]).forEach((event,index)=>{
      const phase=clean(event?.phase,80)||`event-${index}`;
      latest.set(phase,{...event,__order:index});
    });
    return [...latest.values()].sort((a,b)=>a.__order-b.__order).map(({__order,...event})=>event);
  };
  const uuid=()=>{
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    const bytes=new Uint8Array(16);globalThis.crypto?.getRandomValues?.(bytes);
    if(!bytes.some(Boolean))for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    return [...bytes].map((byte,index)=>`${index===4||index===6||index===8||index===10?'-':''}${byte.toString(16).padStart(2,'0')}`).join('');
  };

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

  function renderEmpty(title='No work is running right now.',detail='Send a prompt and this board will replace the old activity with the verified steps for that request.'){
    if(!feed)return;
    feed.innerHTML=`<div class="itws-status-board-empty"><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`;
  }

  function renderWaiting(run){
    if(!feed||!runIsCurrent(run))return;
    run.progressEvents=[];run.actionEvents=[];
    const text=clean(run.message,320);
    feed.innerHTML=`<div class="itws-status-event running itws-status-event-local"><span class="itws-status-event-icon"></span><span class="itws-status-event-body"><strong>Request sent</strong><span>${esc(text?`Starting work on: ${text}`:'Starting this request…')}</span></span></div>`;
  }

  function renderCombined(run){
    if(!feed||!runIsCurrent(run))return;
    const events=[...(run.progressEvents||[]),...(run.actionEvents||[])];
    if(!events.length){renderWaiting(run);return}
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

  function settleVisuals(run){
    if(!runIsCurrent(run))return;
    const settle=event=>statusClass(event?.status)==='running'?{...event,status:'done'}:event;
    run.progressEvents=(run.progressEvents||[]).map(settle);
    run.actionEvents=(run.actionEvents||[]).map(settle);
    renderCombined(run);
  }

  function renderTerminalFallback(run,label,detail,status='done'){
    if(!runIsCurrent(run)||!feed)return;
    const row=document.createElement('div');row.className=`itws-status-event ${statusClass(status)}`;
    const icon=document.createElement('span');icon.className='itws-status-event-icon';icon.textContent=statusIcon(status);
    const body=document.createElement('span');body.className='itws-status-event-body';
    const heading=document.createElement('strong');heading.textContent=clean(label,240);
    const text=document.createElement('span');text.textContent=clean(detail,900);
    body.append(heading,text);row.append(icon,body);feed.appendChild(row);
    drawer?.scrollTo({top:drawer.scrollHeight,behavior:'smooth'});
  }

  function actionEvents(actions,run){
    if(!run?.conversationId||!Array.isArray(actions))return{events:[],active:false,terminal:false};
    const cutoff=run.startedAt-ACTION_CLOCK_SLOP_MS;
    const rows=actions
      .filter(action=>String(action?.conversationId||'')===String(run.conversationId))
      .filter(action=>{const created=safeTime(action?.createdAt);return !created||created>=cutoff})
      .slice(0,8)
      .reverse();
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
        terminal=true;event={status:action.approvalRequired?'waiting':'done',label:action.approvalRequired?'Waiting for owner approval':'Action prepared',detail:summary,createdAt:action.updatedAt||action.createdAt};
      }else if(status==='PR_OPEN'){
        terminal=true;event={status:'done',label:'Coding worker opened a pull request',detail:clean(result.message||`PR #${worker.prNumber||''} · ${worker.branch||''}`,1200),createdAt:action.updatedAt||action.createdAt};
      }else if(status==='EXECUTED'||status==='DONE'){
        terminal=true;event={status:'done',label:String(release.phase||'').toUpperCase()==='PRODUCTION_GREEN'?'Railway production verification completed':'IT action completed',detail:clean(release.message||result.message||summary,1200),createdAt:action.updatedAt||action.createdAt};
      }else if(status==='FAILED'||status==='REJECTED'){
        terminal=true;event={status:'error',label:status==='REJECTED'?'Action rejected':'IT action failed',detail:clean(release.error||result.message||summary,1200),createdAt:action.updatedAt||action.createdAt};
      }
      if(event)events.push(event);
    });
    return{events,active,terminal};
  }

  function cloneHeaders(input,init){try{if(init?.headers)return new Headers(init.headers);if(input instanceof Request)return new Headers(input.headers)}catch{}return new Headers()}
  function requestCredentials(input,init){if(init?.credentials)return init.credentials;if(input instanceof Request&&input.credentials)return input.credentials;return'same-origin'}

  function clearPollTimer(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}}
  function resolveRun(run,{reason='terminal'}={}){
    if(!run||run.finished)return;
    run.finished=true;run.finishReason=reason;clearPollTimer();
    run.resolveTerminal?.(reason);
  }
  function supersedeActiveRun(){
    const run=activeRun;
    if(!run||run.finished)return;
    run.superseded=true;
    clearPollTimer();
    run.resolveTerminal?.('superseded');
  }

  async function readActionState(run,headers){
    if(!runIsCurrent(run)||!run.conversationId)return{events:[],active:false,terminal:false};
    try{
      const response=await previousFetch(apiUrl(run,'/api/it-solutions/agent/actions'),{method:'GET',headers,credentials:run.credentials,cache:'no-store'});
      if(!response.ok)return{events:run.actionEvents||[],active:false,terminal:false};
      const payload=await response.json().catch(()=>({}));
      return actionEvents(payload?.data?.actions||payload?.actions||[],run);
    }catch{return{events:run.actionEvents||[],active:false,terminal:false}}
  }

  async function pollOnce(run,{continuePolling=true}={}){
    if(!runIsCurrent(run)||run.finished)return{done:false,active:false};
    let responseTerminal=false;
    let actionState={events:run.actionEvents||[],active:false,terminal:false};
    try{
      const headers=new Headers(run.headers||{});headers.set('Accept','application/json');
      const response=await previousFetch(apiUrl(run,`/api/it-solutions/agent/progress/${encodeURIComponent(run.requestId)}`),{method:'GET',headers,credentials:run.credentials,cache:'no-store'});
      if(response.ok){
        const payload=await response.json().catch(()=>({}));
        const events=payload?.data?.events||payload?.events||[];
        if(!runIsCurrent(run)||run.finished)return{done:false,active:false};
        if(events.length)run.progressEvents=collapseProgressEvents(events);
        responseTerminal=events.some(event=>String(event?.phase||'').toLowerCase()==='response'&&terminalProgressStatus(event?.status));
      }
      actionState=await readActionState(run,headers);
      if(!runIsCurrent(run)||run.finished)return{done:false,active:false};
      run.actionEvents=actionState.events;renderCombined(run);
    }catch{}
    const done=responseTerminal&&!actionState.active;
    if(done){
      settleVisuals(run);
      resolveRun(run);
    }else if(continuePolling&&runIsCurrent(run)&&!run.finished){
      clearPollTimer();pollTimer=setTimeout(()=>void pollOnce(run),POLL_MS);
    }
    return{done,active:actionState.active,responseTerminal};
  }

  function beginRequest(requestId,message,input,init,conversationId=''){
    supersedeActiveRun();
    const run={
      sequence:++runSequence,
      requestId,
      message,
      conversationId:conversationId||'',
      startedAt:Date.now(),
      headers:cloneHeaders(input,init),
      credentials:requestCredentials(input,init),
      apiBase:apiBaseFromRequest(input),
      progressEvents:[],
      actionEvents:[],
      responseReceived:false,
      finished:false,
      superseded:false,
      resolveTerminal:null,
      terminalPromise:null,
    };
    run.terminalPromise=new Promise(resolve=>{run.resolveTerminal=resolve});
    activeRun=run;selectedConversationId=run.conversationId||selectedConversationId;
    renderWaiting(run);setOpen(true);void pollOnce(run);
    return run;
  }

  function showClientError(run,message){
    if(!runIsCurrent(run))return;
    renderTerminalFallback(run,'Request did not complete',clean(message,900)||'The chat request failed before a completed progress event was returned.','error');
    resolveRun(run,{reason:'error'});
  }

  async function waitForTerminal(run){
    if(!runIsCurrent(run)||run.finished)return;
    const timeout=new Promise(resolve=>setTimeout(()=>resolve('timeout'),TERMINAL_TIMEOUT_MS));
    const outcome=await Promise.race([run.terminalPromise,timeout]);
    if(outcome==='timeout'&&runIsCurrent(run)&&!run.finished){
      renderTerminalFallback(run,'Status tracking stopped','The request returned, but live work tracking did not reach a terminal event in time. The board has stopped so the chat can continue.','error');
      resolveRun(run,{reason:'timeout'});
    }
  }

  function installFetchProgress(){
    if(window.fetch===fetchWrapper)return;
    const downstream=window.fetch.bind(window);
    const wrapper=async function(input,init){
      const url=typeof input==='string'?input:String(input?.url||'');
      const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase();
      if(method!=='POST'||!url.includes('/api/it-solutions/agent/chat'))return downstream(input,init);

      const nextInit=init?{...init}:{};
      let body=null;
      if(typeof nextInit.body==='string'){try{body=JSON.parse(nextInit.body)}catch{}}
      if(!body||typeof body!=='object')return downstream(input,init);

      /* A later UI layer can wrap this wrapper. requestId makes nested copies pass through
         instead of starting a duplicate Status Board lifecycle. */
      if(clean(body.requestId,100))return downstream(input,init);

      const requestId=uuid();
      body.requestId=requestId;
      nextInit.body=JSON.stringify(body);
      const run=beginRequest(requestId,clean(body.message,320),input,nextInit,clean(body.conversationId,120));

      try{
        const response=await downstream(input,nextInit);
        run.responseReceived=true;
        let payload={};
        try{payload=await response.clone().json()}catch{}
        if(runIsCurrent(run)){
          const conversationId=payload?.data?.conversationId||payload?.conversationId||'';
          if(conversationId){run.conversationId=String(conversationId);selectedConversationId=run.conversationId}
        }

        if(!response.ok){
          showClientError(run,`Server returned HTTP ${response.status}.`);
          return response;
        }

        /* The caller cannot render the assistant reply until the observable run is
           terminal. This keeps "working" from remaining on screen behind an answer. */
        if(runIsCurrent(run)&&!run.finished){
          await pollOnce(run,{continuePolling:false});
          await waitForTerminal(run);
        }
        return response;
      }catch(error){
        showClientError(run,error instanceof Error?error.message:String(error||'Request failed'));
        throw error;
      }
    };
    fetchWrapper=wrapper;
    window.fetch=wrapper;
  }

  function ensureFetchProgress(){
    if(window.fetch!==fetchWrapper)installFetchProgress();
  }

  function clearForConversation(conversationId=''){
    selectedConversationId=String(conversationId||'');
    if(activeRun&&!activeRun.finished&&!activeRun.superseded){
      if(!selectedConversationId||!activeRun.conversationId||String(activeRun.conversationId)===selectedConversationId){
        renderCombined(activeRun);return;
      }
    }
    renderEmpty();
  }

  function installConversationTracking(){
    document.getElementById('itwsNewChat')?.addEventListener('click',()=>{
      selectedConversationId='';
      if(!activeRun||activeRun.finished)renderEmpty();
    },true);
    document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target.closest('[data-itws-conversation]'):null;
      const conversationId=target?.getAttribute('data-itws-conversation')||'';
      if(conversationId)setTimeout(()=>clearForConversation(conversationId),40);
    },true);
    const current=(()=>{try{return sessionStorage.getItem('sulandra:it-agent:conversation')||''}catch{return''}})();
    selectedConversationId=current;
  }

  function installComposerBehavior(){
    /* Capture phase makes this survive dynamically replaced composers and prevents a
       second older keydown listener from sending the same prompt twice. */
    document.addEventListener('keydown',event=>{
      const prompt=event.target instanceof Element?event.target.closest('#agentPrompt'):null;
      if(!prompt||event.key!=='Enter'||event.isComposing)return;
      if(event.shiftKey)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ensureFetchProgress();
      const send=document.getElementById('agentSend');
      if(send instanceof HTMLElement&&!send.hasAttribute('disabled'))send.click();
    },true);

    document.addEventListener('click',event=>{
      const send=event.target instanceof Element?event.target.closest('#agentSend'):null;
      if(!send)return;
      ensureFetchProgress();
    },true);
  }

  function installDedicatedBoard(){
    const agent=document.getElementById('agent');const shell=qs('.agent-shell',agent);const main=qs('.agent-main',agent);const head=qs('.agent-head',main);
    if(!agent||!shell||!main||!head)return false;
    drawer=qs('.itws-status-board-drawer',shell);
    if(!drawer){
      drawer=document.createElement('aside');drawer.className='itws-status-board-drawer';drawer.setAttribute('aria-label','Status Board');
      drawer.innerHTML=`<button type="button" class="itws-status-board-close" aria-label="Close status board">×</button><div class="itws-status-board-head"><h2>Status Board</h2><p>Verified work for the current request, in real time.</p></div><div id="itwsStatusBoardFeed" class="itws-status-board-feed" role="status" aria-live="polite"></div><div class="itws-status-board-privacy">Shows observable request, repository, system, tool, action, GitHub-gate and Railway deployment evidence when actually checked. Private model chain-of-thought is not displayed.</div>`;
      shell.appendChild(drawer);
    }else{
      const subtitle=qs('.itws-status-board-head p',drawer);if(subtitle)subtitle.textContent='Verified work for the current request, in real time.';
    }
    feed=qs('#itwsStatusBoardFeed',drawer)||qs('.itws-status-board-feed',drawer);
    const oldButton=document.getElementById('itwsActivity');
    button=document.createElement('button');button.type='button';button.id='itwsActivity';button.className='itws-activity-toggle';button.textContent='Status Board';
    button.style.setProperty('display','block','important');button.style.setProperty('visibility','visible','important');button.style.setProperty('opacity','1','important');button.style.setProperty('pointer-events','auto','important');
    if(oldButton?.parentElement)oldButton.replaceWith(button);else head.appendChild(button);
    backdrop=qs('.itws-drawer-backdrop');
    if(!backdrop){backdrop=document.createElement('div');backdrop.className='itws-drawer-backdrop';document.body.appendChild(backdrop)}
    const close=qs('.itws-status-board-close',drawer);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setOpen(!drawer.classList.contains('itws-open'),{manual:true})});
    close?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setOpen(false,{manual:true})});
    backdrop.addEventListener('click',()=>setOpen(false,{manual:true}));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawer?.classList.contains('itws-open'))setOpen(false,{manual:true})});
    window.addEventListener('resize',()=>{if(drawer?.classList.contains('itws-open'))backdrop?.classList.toggle('open',compact())},{passive:true});

    renderEmpty();
    setOpen(readOpen());
    installFetchProgress();
    installComposerBehavior();
    installConversationTracking();
    document.body.dataset.itwsStatusBoardReady='1';
    return true;
  }

  function boot(){let attempts=0;const run=()=>{attempts+=1;if(installDedicatedBoard()||attempts>=50)return;setTimeout(run,50)};run()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();