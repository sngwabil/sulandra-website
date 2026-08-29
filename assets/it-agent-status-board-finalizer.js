/* IT_AGENT_STATUS_BOARD_FINALIZER_V3
   Dedicated chat Status Board for observable work progress.
   This does not expose private model reasoning and does not reuse Action Center. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__)return;
  window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__=true;

  const qs=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const qsa=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const OPEN_KEY='sulandra:it-agent:status-board-open';
  let drawer=null;
  let button=null;
  let backdrop=null;
  let feed=null;
  let syncQueued=false;

  const compact=()=>window.matchMedia('(max-width:699px)').matches;
  const readOpen=()=>sessionStorage.getItem(OPEN_KEY)==='1';
  const writeOpen=open=>{try{sessionStorage.setItem(OPEN_KEY,open?'1':'0')}catch{}};

  function stripDuplicateIds(root){
    qsa('[id]',root).forEach(node=>node.removeAttribute('id'));
  }

  function syncFeed(){
    if(syncQueued)return;
    syncQueued=true;
    requestAnimationFrame(()=>{
      syncQueued=false;
      const chat=document.getElementById('agentChat')||qs('.chat-log')||qs('.agent-chat');
      if(!feed||!chat)return;
      const sources=qsa('.sulandra-live-activity,.itws-progress-fallback',chat);
      feed.innerHTML='';
      if(!sources.length){
        const empty=document.createElement('div');
        empty.className='itws-status-board-empty';
        empty.innerHTML='<strong>No active work in this chat.</strong><span>When Sulandra starts checking, creating, executing, building, or deploying something, the observable working steps will appear here.</span>';
        feed.appendChild(empty);
        return;
      }
      sources.forEach(source=>{
        const clone=source.cloneNode(true);
        stripDuplicateIds(clone);
        clone.removeAttribute('aria-live');
        feed.appendChild(clone);
      });
      drawer?.scrollTo({top:drawer.scrollHeight,behavior:'smooth'});
    });
  }

  function setOpen(open,{manual=false}={}){
    if(!drawer||!button)return;
    const next=Boolean(open);
    drawer.classList.toggle('itws-open',next);
    document.body.classList.toggle('itws-status-board-open',next);
    backdrop?.classList.toggle('open',next&&compact());
    button.setAttribute('aria-expanded',next?'true':'false');
    button.setAttribute('aria-label',next?'Close status board':'Open status board');
    if(manual||next)writeOpen(next);
    if(next)syncFeed();
  }

  function installDedicatedBoard(){
    const agent=document.getElementById('agent');
    const shell=qs('.agent-shell',agent);
    const main=qs('.agent-main',agent);
    const head=qs('.agent-head',main);
    if(!agent||!shell||!main||!head)return false;

    /* Action Center is a separate Operations workspace. Never repurpose its DOM. */
    drawer=qs('.itws-status-board-drawer',shell);
    if(!drawer){
      drawer=document.createElement('aside');
      drawer.className='itws-status-board-drawer';
      drawer.setAttribute('aria-label','Status Board');
      drawer.innerHTML=`
        <button type="button" class="itws-status-board-close" aria-label="Close status board">×</button>
        <div class="itws-status-board-head">
          <h2>Status Board</h2>
          <p>Observable working steps and actions for this chat.</p>
        </div>
        <div id="itwsStatusBoardFeed" class="itws-status-board-feed" role="status" aria-live="polite"></div>
        <div class="itws-status-board-privacy">Operational progress only — private model reasoning is not displayed.</div>`;
      shell.appendChild(drawer);
    }
    feed=qs('#itwsStatusBoardFeed',drawer)||qs('.itws-status-board-feed',drawer);

    /* Replace the legacy Activity button node entirely so older click/focus
       listeners cannot close this dedicated board when the composer is touched. */
    const oldButton=document.getElementById('itwsActivity');
    button=document.createElement('button');
    button.type='button';
    button.id='itwsActivity';
    button.className='itws-activity-toggle';
    button.textContent='Status Board';
    button.style.setProperty('display','block','important');
    button.style.setProperty('visibility','visible','important');
    button.style.setProperty('opacity','1','important');
    button.style.setProperty('pointer-events','auto','important');
    if(oldButton?.parentElement)oldButton.replaceWith(button);else head.appendChild(button);

    backdrop=qs('.itws-drawer-backdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.className='itws-drawer-backdrop';
      document.body.appendChild(backdrop);
    }

    const close=qs('.itws-status-board-close',drawer);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setOpen(!drawer.classList.contains('itws-open'),{manual:true})});
    close?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setOpen(false,{manual:true})});
    backdrop.addEventListener('click',()=>setOpen(false,{manual:true}));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drawer?.classList.contains('itws-open'))setOpen(false,{manual:true})});
    window.addEventListener('resize',()=>{if(drawer?.classList.contains('itws-open'))backdrop?.classList.toggle('open',compact())},{passive:true});

    const chat=document.getElementById('agentChat')||qs('.chat-log')||qs('.agent-chat');
    if(chat)new MutationObserver(syncFeed).observe(chat,{childList:true,subtree:true,characterData:true,attributes:true});

    const send=document.getElementById('agentSend')||document.getElementById('askAgentBtn');
    send?.addEventListener('click',()=>{
      const value=String(document.getElementById('agentPrompt')?.value||'').trim();
      if(!value)return;
      setOpen(true);
      setTimeout(syncFeed,80);
    },true);

    /* New chat and conversation switches update the feed, but never close the
       board. Open/closed state changes only from the board controls/Escape. */
    document.getElementById('itwsNewChat')?.addEventListener('click',()=>setTimeout(syncFeed,40),true);
    qsa('.itws-recents').forEach(root=>new MutationObserver(syncFeed).observe(root,{childList:true,subtree:true,attributes:true}));

    setOpen(readOpen());
    syncFeed();
    document.body.dataset.itwsStatusBoardReady='1';
    return true;
  }

  function boot(){
    let attempts=0;
    const run=()=>{
      attempts+=1;
      if(installDedicatedBoard()||attempts>=50)return;
      setTimeout(run,50);
    };
    run();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
