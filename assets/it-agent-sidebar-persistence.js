/* IT_AGENT_SIDEBAR_PERSISTENCE_V1
   The IT Solutions left rail is user-controlled. Once open, ordinary workspace
   clicks, chat actions, navigation choices, or the mobile scrim must not collapse
   it. Only the explicit navigation toggle/close control or Escape closes it. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_SIDEBAR_PERSISTENCE__)return;
  window.__SULANDRA_IT_SIDEBAR_PERSISTENCE__=true;

  const OPEN_KEY='sulandra:it-solutions:left-sidebar-open';
  const isCompact=()=>window.matchMedia('(max-width:820px)').matches;

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

  const applyOpenState=(open,{focus=false}={})=>{
    const {body,sidebar,scrim,closeButton,openButton}=elements();
    if(!body||!sidebar)return;
    const next=Boolean(open);

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
    if(closeButton){
      closeButton.textContent='‹';
      closeButton.setAttribute('aria-label','Collapse navigation');
      closeButton.setAttribute('title','Collapse navigation');
      closeButton.setAttribute('aria-expanded',next?'true':'false');
    }
    if(openButton){
      openButton.textContent=next?'‹':'›';
      openButton.setAttribute('aria-label',next?'Close navigation':'Open navigation');
      openButton.setAttribute('title',next?'Close navigation':'Open navigation');
      openButton.setAttribute('aria-expanded',next?'true':'false');
    }
    try{sessionStorage.setItem(OPEN_KEY,next?'1':'0')}catch{}
    if(focus){
      const target=next?closeButton:openButton;
      window.setTimeout(()=>target?.focus?.(),0);
    }
  };

  const isExplicitToggleTarget=target=>Boolean(target?.closest?.('#itwsCloseSide,#itwsMenu'));
  let preserveAfterClick=false;

  const rememberOpenClick=event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target||!isOpen()||isExplicitToggleTarget(target)){
      preserveAfterClick=false;
      return;
    }
    preserveAfterClick=true;
  };

  const restoreAfterOrdinaryClick=()=>{
    if(!preserveAfterClick)return;
    preserveAfterClick=false;
    /* Existing workspace listeners may have just collapsed the rail. Restore it in
       the same event turn, after the clicked control has still been allowed to work. */
    applyOpenState(true);
  };

  function install(){
    const {body,sidebar,closeButton,openButton}=elements();
    if(!body||!sidebar||!closeButton||!openButton){
      window.setTimeout(install,50);
      return;
    }
    if(body.dataset.itwsSidebarPersistenceReady==='1')return;
    body.dataset.itwsSidebarPersistenceReady='1';

    /* Document capture happens before target handlers. This remembers that the rail
       was open without blocking the user's click. Our later bubble handler restores
       it after older auto-close handlers have run. */
    document.addEventListener('pointerdown',rememberOpenClick,true);
    document.addEventListener('touchstart',rememberOpenClick,{capture:true,passive:true});
    document.addEventListener('click',restoreAfterOrdinaryClick,false);

    /* Explicit controls remain authoritative. Recording the desired state makes the
       choice survive normal in-page interactions and soft reloads in this tab. */
    document.addEventListener('pointerdown',event=>{
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.closest('#itwsCloseSide')){
        try{sessionStorage.setItem(OPEN_KEY,'0')}catch{}
      }else if(target.closest('#itwsMenu')){
        try{sessionStorage.setItem(OPEN_KEY,isOpen()?'0':'1')}catch{}
      }
    },true);

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&isOpen()){
        try{sessionStorage.setItem(OPEN_KEY,'0')}catch{}
      }
    },true);

    let stored=null;
    try{stored=sessionStorage.getItem(OPEN_KEY)}catch{}
    if(stored==='1')applyOpenState(true);
    else if(stored==='0')applyOpenState(false);
    else applyOpenState(isCompact()?sidebar.classList.contains('open'):true);

    window.addEventListener('resize',()=>{
      let desired=null;
      try{desired=sessionStorage.getItem(OPEN_KEY)}catch{}
      if(desired==='1')window.setTimeout(()=>applyOpenState(true),0);
      else if(desired==='0')window.setTimeout(()=>applyOpenState(false),0);
    },{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
