/* IT_AGENT_SIDEBAR_PERSISTENCE_V2
   The IT Solutions left rail is explicitly user-controlled. Once open, ordinary
   workspace clicks, synthetic tab clicks, saved-conversation loads, navigation,
   or the mobile scrim must not collapse it. Only the explicit rail control or
   Escape changes that choice. This layer also restores readable contrast for the
   non-chat engineering views inside the navy IT Solutions workspace. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_SIDEBAR_PERSISTENCE_V2__)return;
  window.__SULANDRA_IT_SIDEBAR_PERSISTENCE_V2__=true;

  const OPEN_KEY='sulandra:it-solutions:left-sidebar-open';
  const isCompact=()=>window.matchMedia('(max-width:820px)').matches;
  let desiredOpen=null;
  let applying=false;
  let reconcileQueued=false;

  const elements=()=>({
    body:document.body,
    sidebar:document.querySelector('.itws-sidebar'),
    scrim:document.querySelector('.itws-sidebar-scrim'),
    closeButton:document.getElementById('itwsCloseSide'),
    openButton:document.getElementById('itwsMenu'),
  });

  const isOpen=()=>{
    const {body,sidebar}=elements();
    if(!body||!sidebar)return false;
    return isCompact()?sidebar.classList.contains('open'):!body.classList.contains('itws-left-sidebar-closed');
  };

  const storeDesired=open=>{
    desiredOpen=Boolean(open);
    try{sessionStorage.setItem(OPEN_KEY,desiredOpen?'1':'0')}catch{}
  };

  const syncControls=open=>{
    const {closeButton,openButton}=elements();
    const next=Boolean(open);
    if(closeButton){
      closeButton.textContent='‹';
      closeButton.setAttribute('aria-label','Collapse navigation');
      closeButton.setAttribute('title','Collapse navigation');
      closeButton.setAttribute('aria-expanded',next?'true':'false');
    }
    if(openButton){
      openButton.textContent='›';
      openButton.setAttribute('aria-label','Open navigation');
      openButton.setAttribute('title','Open navigation');
      openButton.setAttribute('aria-expanded',next?'true':'false');
      /* There must be only one navigation close control while the rail is open.
         The rail's own button closes it; the header button only appears when closed. */
      openButton.style.setProperty('display',next?'none':'grid','important');
      openButton.style.setProperty('visibility',next?'hidden':'visible','important');
      openButton.style.setProperty('pointer-events',next?'none':'auto','important');
    }
  };

  const applyOpenState=(open,{focus=false,persist=true}={})=>{
    const {body,sidebar,scrim,closeButton,openButton}=elements();
    if(!body||!sidebar)return;
    const next=Boolean(open);
    applying=true;

    if(isCompact()){
      body.classList.remove('itws-left-sidebar-closed');
      sidebar.classList.toggle('open',next);
      scrim?.classList.toggle('open',next);
    }else{
      sidebar.classList.remove('open');
      scrim?.classList.remove('open');
      body.classList.toggle('itws-left-sidebar-closed',!next);
    }

    sidebar.setAttribute('aria-hidden',next?'false':'true');
    syncControls(next);
    if(persist)storeDesired(next);

    if(focus){
      const target=next?closeButton:openButton;
      window.setTimeout(()=>target?.focus?.(),0);
    }
    queueMicrotask(()=>{applying=false});
  };

  const scheduleReconcile=()=>{
    if(applying||desiredOpen===null||reconcileQueued)return;
    reconcileQueued=true;
    queueMicrotask(()=>{
      reconcileQueued=false;
      if(applying||desiredOpen===null)return;
      if(isOpen()!==desiredOpen)applyOpenState(desiredOpen,{persist:false});
      else syncControls(desiredOpen);
    });
  };

  const installViewContrast=()=>{
    if(document.getElementById('itwsViewContrastStyle'))return;
    const style=document.createElement('style');
    style.id='itwsViewContrastStyle';
    style.textContent=`
      /* Operational views must remain readable inside the navy IT Solutions shell. */
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent),
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView{
        background:#081927!important;
        color:#dceaf3!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) .card,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .itws-action-center-panel .action{
        background:#0e2739!important;
        color:#dceaf3!important;
        border-color:#284b62!important;
        box-shadow:none!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) h1,
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) h2,
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) h3,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView h1,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView h2,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView h3{
        color:#eef7fd!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) p,
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) li,
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) td,
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) small,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView p,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .action,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .action p{
        color:#b9cad6!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) table,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView table{
        color:#dceaf3!important;
        border-color:#284b62!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) th,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView th{
        background:#102b40!important;
        color:#cfe0ea!important;
        border-bottom-color:#31556b!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) td,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView td{
        border-bottom-color:#24465d!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .itws-action-center-panel,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .itws-action-center-wrap{
        background:transparent!important;
        color:#dceaf3!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .itws-action-center-panel>p{
        color:#8fa6b6!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .action h3,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .action strong{
        color:#e8f3fa!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .action pre,
      body.it-chatgpt-workspace.itws-enterprise-shell #itwsActionCenterView .agent-note{
        background:#0a2030!important;
        color:#bdd0dc!important;
        border-color:#294d64!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) .pill{
        background:#15354a!important;
        color:#c9dce7!important;
        border-color:#31566e!important;
      }
      body.it-chatgpt-workspace.itws-enterprise-shell .itws-content>.view:not(#agent) .btn.secondary{
        background:#17364b!important;
        color:#dceaf3!important;
      }
      /* Keep generated artifacts and long chat content above the fixed composer. */
      body.it-chatgpt-workspace.itws-enterprise-shell #agentChat,
      body.it-chatgpt-workspace.itws-enterprise-shell .agent-chat,
      body.it-chatgpt-workspace.itws-enterprise-shell .chat-log{
        padding-bottom:220px!important;
      }
    `;
    document.head.appendChild(style);
  };

  function install(){
    const {body,sidebar,closeButton,openButton}=elements();
    if(!body||!sidebar||!closeButton||!openButton){
      window.setTimeout(install,50);
      return;
    }
    if(body.dataset.itwsSidebarPersistenceReady==='2')return;
    body.dataset.itwsSidebarPersistenceReady='2';
    installViewContrast();

    let stored=null;
    try{stored=sessionStorage.getItem(OPEN_KEY)}catch{}
    if(stored==='1')desiredOpen=true;
    else if(stored==='0')desiredOpen=false;
    else desiredOpen=isCompact()?sidebar.classList.contains('open'):true;
    applyOpenState(desiredOpen,{persist:true});

    /* Capture explicit manual controls before older listeners run. */
    document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.closest('#itwsCloseSide'))storeDesired(false);
      else if(target.closest('#itwsMenu'))storeDesired(!isOpen());
    },true);

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&isOpen())storeDesired(false);
    },true);

    /* Older workspace code still contains several implicit close paths, including
       synthetic tab clicks after a saved conversation finishes loading. Treat the
       stored user choice as authoritative and repair any such class mutation before
       the next paint. */
    const bodyObserver=new MutationObserver(scheduleReconcile);
    bodyObserver.observe(body,{attributes:true,attributeFilter:['class']});
    const sidebarObserver=new MutationObserver(scheduleReconcile);
    sidebarObserver.observe(sidebar,{attributes:true,attributeFilter:['class']});

    window.addEventListener('resize',()=>window.setTimeout(()=>applyOpenState(desiredOpen,{persist:false}),0),{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();