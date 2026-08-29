/* IT_AGENT_STATUS_BOARD_FINALIZER_V1
   Finalizes the current chat-first Status Board after legacy presentation scripts.
   This does not restore the old Action Center navigation or old IT Solutions UI. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__)return;
  window.__SULANDRA_IT_STATUS_BOARD_FINALIZER__=true;

  const qs=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const qsa=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);

  function removeLegacyPresentation(){
    document.getElementById('itws-action-center-tab-style')?.remove();
    qsa('[data-itws-view="action-center"]').forEach(node=>node.remove());
    document.getElementById('itwsActionCenterView')?.classList.add('hidden');
  }

  function ensureStatusBoard(){
    removeLegacyPresentation();
    const agent=document.getElementById('agent');
    const shell=qs('.agent-shell',agent);
    const main=qs('.agent-main',agent);
    if(!agent||!shell||!main)return false;

    const legacyView=document.getElementById('itwsActionCenterView');
    let drawer=qs('.itws-status-board-drawer')||qs('.itws-action-center-panel',legacyView)||qs('aside',shell)||qs('#agentActions')?.closest('aside');
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

    let button=document.getElementById('itwsActivity');
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

    let backdrop=qs('.itws-drawer-backdrop');
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

    const compact=()=>window.matchMedia('(max-width:820px)').matches;
    const setOpen=open=>{
      drawer.classList.toggle('itws-open',Boolean(open));
      backdrop.classList.toggle('open',Boolean(open)&&compact());
      button.setAttribute('aria-expanded',open?'true':'false');
      button.setAttribute('aria-label',open?'Close status board':'Open status board');
    };
    button.onclick=event=>{event.preventDefault();event.stopPropagation();setOpen(!drawer.classList.contains('itws-open'))};
    close.onclick=event=>{event.preventDefault();event.stopPropagation();setOpen(false)};
    backdrop.onclick=()=>setOpen(false);
    qsa('.itws-nav [data-itws-view]').forEach(nav=>nav.addEventListener('click',()=>setOpen(false)));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false)});
    window.addEventListener('resize',()=>{if(drawer.classList.contains('itws-open'))backdrop.classList.toggle('open',compact())});

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
