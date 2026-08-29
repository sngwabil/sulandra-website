/* IT_AGENT_STATUS_BOARD_FINALIZER_V2
   Finalizes the current chat-first Status Board after legacy presentation scripts.
   The Status Board is a docked right rail during active work on tablet/desktop;
   this does not restore the old Action Center navigation or old IT Solutions UI. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__)return;
  window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__=true;

  const qs=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const qsa=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  let drawer=null;
  let button=null;
  let backdrop=null;
  let userClosedDuringActiveWork=false;
  let observersInstalled=false;

  function removeLegacyPresentation(){
    document.getElementById('itws-action-center-tab-style')?.remove();
    qsa('[data-itws-view="action-center"]').forEach(node=>node.remove());
    document.getElementById('itwsActionCenterView')?.classList.add('hidden');
  }

  const compact=()=>window.matchMedia('(max-width:699px)').matches;

  function hasActiveWork(){
    if(qs('.sulandra-live-activity:not(.finished)'))return true;
    const firstAction=qs('#agentActions .action');
    if(!firstAction)return false;
    const text=clean(firstAction.textContent).toUpperCase();
    if(/\b(DONE|COMPLETED|SUCCESS|FAILED|REJECTED|CANCELLED|CANCELED)\b/.test(text))return false;
    return /\b(IN[_ -]?PROGRESS|RUNNING|WORKING|EXECUTING|BUILDING|DEPLOYING|QUEUED|PROPOSED|PENDING|NEEDS APPROVAL|APPROVAL REQUIRED|AWAITING APPROVAL)\b/.test(text);
  }

  function setOpen(open,{manual=false}={}){
    if(!drawer||!button)return;
    const next=Boolean(open);
    drawer.classList.toggle('itws-open',next);
    document.body.classList.toggle('itws-status-board-open',next);
    backdrop?.classList.toggle('open',next&&compact());
    button.setAttribute('aria-expanded',next?'true':'false');
    button.setAttribute('aria-label',next?'Close status board':'Open status board');
    if(manual){
      if(next)userClosedDuringActiveWork=false;
      else if(hasActiveWork())userClosedDuringActiveWork=true;
    }
  }

  function syncActivePresentation(){
    const active=hasActiveWork();
    document.body.classList.toggle('itws-status-board-active',active);
    if(active&&!userClosedDuringActiveWork&&!drawer?.classList.contains('itws-open'))setOpen(true);
    if(!active)userClosedDuringActiveWork=false;
  }

  function installActivityObservers(){
    if(observersInstalled)return;
    observersInstalled=true;
    const sync=()=>window.requestAnimationFrame(syncActivePresentation);
    const actions=document.getElementById('agentActions');
    const chat=document.getElementById('agentChat');
    if(actions)new MutationObserver(sync).observe(actions,{childList:true,subtree:true,characterData:true,attributes:true});
    if(chat)new MutationObserver(sync).observe(chat,{childList:true,subtree:true,characterData:true,attributes:true});

    const send=document.getElementById('agentSend')||document.getElementById('askAgentBtn');
    send?.addEventListener('click',()=>{
      const value=clean(document.getElementById('agentPrompt')?.value);
      if(!value)return;
      userClosedDuringActiveWork=false;
      setOpen(true);
      setTimeout(syncActivePresentation,80);
    },true);

    document.getElementById('itwsNewChat')?.addEventListener('click',()=>{
      userClosedDuringActiveWork=false;
      setOpen(false);
      document.body.classList.remove('itws-status-board-active');
    },true);

    document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false,{manual:true})});
    window.addEventListener('resize',()=>{
      if(drawer?.classList.contains('itws-open'))backdrop?.classList.toggle('open',compact());
    },{passive:true});
  }

  function ensureStatusBoard(){
    removeLegacyPresentation();
    const agent=document.getElementById('agent');
    const shell=qs('.agent-shell',agent);
    const main=qs('.agent-main',agent);
    if(!agent||!shell||!main)return false;

    const legacyView=document.getElementById('itwsActionCenterView');
    drawer=qs('.itws-status-board-drawer')||qs('.itws-action-center-panel',legacyView)||qs('aside',shell)||qs('#agentActions')?.closest('aside');
    if(!drawer)return false;

    drawer.classList.remove('itws-action-center-panel','card');
    drawer.classList.add('itws-status-board-drawer');
    if(drawer.parentElement!==shell)shell.appendChild(drawer);
    legacyView?.remove();

    const title=qs('h2',drawer);if(title)title.textContent='Status Board';
    const intro=qs('p',drawer);if(intro)intro.textContent='Live request status, approvals, execution evidence, and connected capabilities.';
    qsa('*',drawer).forEach(node=>{
      if(node.children.length===0&&/Action Center/i.test(node.textContent||''))node.textContent=String(node.textContent||'').replace(/Action Center/gi,'Status Board');
    });

    button=document.getElementById('itwsActivity');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='itwsActivity';
      button.className='itws-activity-toggle';
      qs('.agent-head',main)?.appendChild(button);
    }
    button.textContent='Status Board';
    button.style.setProperty('display','block','important');
    button.style.setProperty('visibility','visible','important');
    button.style.setProperty('opacity','1','important');
    button.style.setProperty('pointer-events','auto','important');

    backdrop=qs('.itws-drawer-backdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.className='itws-drawer-backdrop';
      document.body.appendChild(backdrop);
    }
    let close=qs('.itws-status-board-close',drawer);
    if(!close){
      close=document.createElement('button');
      close.type='button';
      close.className='itws-status-board-close';
      close.setAttribute('aria-label','Close status board');
      close.textContent='×';
      drawer.prepend(close);
    }

    button.onclick=event=>{event.preventDefault();event.stopPropagation();setOpen(!drawer.classList.contains('itws-open'),{manual:true})};
    close.onclick=event=>{event.preventDefault();event.stopPropagation();setOpen(false,{manual:true})};
    backdrop.onclick=()=>setOpen(false,{manual:true});
    qsa('.itws-nav [data-itws-view]').forEach(nav=>nav.addEventListener('click',()=>setOpen(false,{manual:true})));

    installActivityObservers();
    syncActivePresentation();
    document.body.dataset.itwsStatusBoardReady='1';
    return true;
  }

  function boot(){
    let attempts=0;
    const run=()=>{
      attempts+=1;
      if(ensureStatusBoard()||attempts>=40)return;
      setTimeout(run,50);
    };
    run();
    const head=document.head;
    if(head)new MutationObserver(()=>{
      const legacy=document.getElementById('itws-action-center-tab-style');
      if(legacy){legacy.remove();ensureStatusBoard()}
    }).observe(head,{childList:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
