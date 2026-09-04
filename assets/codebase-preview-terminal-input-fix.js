/* CODEBASE_PREVIEW_TERMINAL_INPUT_V1
 * Sulandra Codebase standalone preview/terminal usability repair.
 * - Preview is a true edge-to-edge dark/glossy screen with compact overlay controls.
 * - Codebase preview tickets carry the Codebase product namespace explicitly.
 * - Reattached xterm panes regain focus/caret/input after workspace rerenders.
 */
(()=>{
  'use strict';
  if(window.__SULANDRA_CODEBASE_PREVIEW_TERMINAL_INPUT_V1__)return;
  window.__SULANDRA_CODEBASE_PREVIEW_TERMINAL_INPUT_V1__=true;

  const styleId='codebase-preview-terminal-input-style';
  const styleText=`
    #view-preview{
      position:relative!important;
      min-width:0!important;
      min-height:0!important;
      padding:0!important;
      overflow:hidden!important;
      background:
        radial-gradient(circle at 18% 0%,rgba(46,204,113,.08),transparent 34%),
        radial-gradient(circle at 88% 12%,rgba(66,165,245,.08),transparent 30%),
        linear-gradient(180deg,#020407 0%,#000 100%)!important;
      isolation:isolate;
    }
    #view-preview>#codebase-preview-toolbar{
      position:absolute!important;
      z-index:6!important;
      top:8px!important;
      left:8px!important;
      right:8px!important;
      height:34px!important;
      min-height:34px!important;
      display:flex!important;
      align-items:center!important;
      gap:7px!important;
      margin:0!important;
      padding:0 7px!important;
      border:1px solid rgba(255,255,255,.10)!important;
      border-radius:8px!important;
      background:linear-gradient(180deg,rgba(13,19,28,.86),rgba(2,6,10,.78))!important;
      -webkit-backdrop-filter:blur(18px) saturate(150%)!important;
      backdrop-filter:blur(18px) saturate(150%)!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 8px 24px rgba(0,0,0,.32)!important;
    }
    #codebase-preview-toolbar .codebase-preview-label{
      flex:0 0 auto;
      color:#dce7f3;
      font:700 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
      letter-spacing:.03em;
    }
    #codebase-preview-toolbar #preview-port{
      width:58px!important;
      height:24px!important;
      margin:0!important;
      padding:0 6px!important;
      border:1px solid rgba(255,255,255,.10)!important;
      border-radius:5px!important;
      outline:none!important;
      background:rgba(0,0,0,.48)!important;
      color:#fff!important;
      text-align:center!important;
      font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;
      box-shadow:inset 0 1px 5px rgba(0,0,0,.45)!important;
    }
    #codebase-preview-toolbar #preview-port:focus{
      border-color:rgba(79,195,247,.52)!important;
      box-shadow:0 0 0 2px rgba(79,195,247,.08),inset 0 1px 5px rgba(0,0,0,.45)!important;
    }
    #codebase-preview-toolbar .codebase-preview-open,
    #codebase-preview-toolbar .codebase-preview-actions button{
      width:auto!important;
      height:24px!important;
      margin:0!important;
      padding:0 8px!important;
      border:1px solid rgba(255,255,255,.10)!important;
      border-radius:5px!important;
      background:rgba(255,255,255,.025)!important;
      color:#dce7f3!important;
      font:650 9px/1 system-ui,-apple-system,"Segoe UI",sans-serif!important;
      cursor:pointer!important;
    }
    #codebase-preview-toolbar .codebase-preview-open:hover,
    #codebase-preview-toolbar .codebase-preview-actions button:hover{
      border-color:rgba(79,195,247,.32)!important;
      background:rgba(79,195,247,.07)!important;
      color:#fff!important;
    }
    #codebase-preview-toolbar .codebase-preview-actions{
      margin-left:auto!important;
      display:flex!important;
      align-items:center!important;
      gap:5px!important;
    }
    #railway-preview-iframe{
      position:absolute!important;
      z-index:1!important;
      inset:0!important;
      display:block!important;
      width:100%!important;
      height:100%!important;
      min-width:0!important;
      min-height:0!important;
      margin:0!important;
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      background:
        radial-gradient(circle at 18% 0%,rgba(46,204,113,.07),transparent 32%),
        radial-gradient(circle at 88% 12%,rgba(66,165,245,.08),transparent 28%),
        #000!important;
      color-scheme:dark!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 34px rgba(255,255,255,.025)!important;
    }
    .terminal-view{
      cursor:text!important;
    }
    .terminal-view .xterm,
    .terminal-view .xterm-screen{
      height:100%!important;
    }
    .terminal-view .xterm.focus .xterm-cursor-layer,
    .terminal-view .xterm:focus-within .xterm-cursor-layer{
      opacity:1!important;
    }
  `;

  const installStyle=()=>{
    let style=document.getElementById(styleId);
    if(style)return style;
    style=document.createElement('style');
    style.id=styleId;
    style.textContent=styleText;
    document.head.appendChild(style);
    return style;
  };

  const setStatus=text=>{
    const node=document.getElementById('status-line-col');
    if(node)node.innerText=String(text||'');
  };

  const compactPreviewChrome=()=>{
    installStyle();
    const view=document.getElementById('view-preview');
    const iframe=document.getElementById('railway-preview-iframe');
    if(!view||!iframe)return false;
    iframe.setAttribute('title','Sulandra Codebase Preview');

    let toolbar=document.getElementById('codebase-preview-toolbar');
    if(toolbar)return true;

    const direct=[...view.children];
    const titleRow=direct.find(node=>node!==iframe&&node.querySelector?.('h2'))||null;
    const portInput=document.getElementById('preview-port');
    const portRow=portInput?.parentElement?.parentElement===view?portInput.parentElement:null;
    const actions=titleRow?.querySelector('div:last-child')||null;
    const openButton=portRow?.querySelector('button')||null;

    toolbar=document.createElement('div');
    toolbar.id='codebase-preview-toolbar';
    toolbar.setAttribute('aria-label','Preview controls');

    const label=document.createElement('span');
    label.className='codebase-preview-label';
    label.textContent='Port';
    toolbar.appendChild(label);

    if(portInput)toolbar.appendChild(portInput);
    if(openButton){
      openButton.classList.add('codebase-preview-open');
      openButton.textContent='Open';
      toolbar.appendChild(openButton);
    }
    if(actions){
      actions.classList.add('codebase-preview-actions');
      toolbar.appendChild(actions);
    }

    titleRow?.remove();
    if(portRow?.parentNode===view)portRow.remove();
    view.insertBefore(toolbar,iframe);
    return true;
  };

  const activeTerminalIs=tabId=>{
    try{return Array.isArray(openTabs)&&openTabs[0]?.id===tabId}catch{return false}
  };

  const focusTerminal=(term,container,tabId,{force=false}={})=>{
    if(!term||!container)return;
    try{term.options.cursorBlink=true}catch{}
    const focus=()=>{
      try{
        term.__sulandraFitAddon?.fit?.();
        term.focus?.();
        if(Number.isInteger(term.rows)&&term.rows>0)term.refresh?.(0,term.rows-1);
      }catch{}
    };
    if(container.dataset.codebaseTerminalFocusBound!=='1'){
      container.dataset.codebaseTerminalFocusBound='1';
      container.addEventListener('pointerdown',()=>requestAnimationFrame(focus),{passive:true});
      container.addEventListener('touchstart',()=>requestAnimationFrame(focus),{passive:true});
      container.addEventListener('click',()=>requestAnimationFrame(focus),{passive:true});
    }
    if(force||activeTerminalIs(tabId))requestAnimationFrame(()=>requestAnimationFrame(focus));
  };

  const originalInitXterm=window.initXterm;
  if(typeof originalInitXterm==='function'){
    window.initXterm=(containerId,tabId)=>{
      const result=originalInitXterm(containerId,tabId);
      requestAnimationFrame(()=>{
        try{
          const container=document.getElementById(containerId);
          const term=activeTerminals?.[tabId];
          focusTerminal(term,container,tabId);
        }catch{}
      });
      return result;
    };
  }

  window.updatePreviewPort=async()=>{
    compactPreviewChrome();
    const input=document.getElementById('preview-port');
    const iframe=document.getElementById('railway-preview-iframe');
    if(!iframe)return;
    const port=Number(input?.value||3000);
    if(!Number.isInteger(port)||port<1024||port>65535||[9000,13337].includes(port)){
      setStatus('PREVIEW port must be 1024–65535 and not a reserved terminal port');
      return;
    }

    let sessionId='';
    try{
      const terminalTab=Array.isArray(openTabs)?openTabs.find(tab=>tab?.type==='terminal'&&tab?.sessionId):null;
      sessionId=String(terminalTab?.sessionId||window.__SULANDRA_CODEBASE_PREVIEW_SESSION__||'').trim();
    }catch{}

    if(!sessionId){
      iframe.src=RAILWAY_CONFIG.PREVIEW_URL;
      setStatus(`PREVIEW waiting for a Codebase terminal session on port ${port}`);
      return;
    }

    const token=String(RAILWAY_CONFIG.getToken?.()||'').trim();
    if(!token){
      iframe.src=RAILWAY_CONFIG.PREVIEW_URL;
      setStatus('PREVIEW requires an active Sulandra session');
      return;
    }

    setStatus(`PREVIEW opening Codebase terminal ${sessionId.slice(0,12)}… on port ${port}`);
    try{
      const response=await fetch(`${RAILWAY_CONFIG.PREVIEW_URL}/api/preview-ticket`,{
        method:'POST',
        headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({sessionId,port,surface:'codebase'}),
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload?.url)throw new Error(payload?.error||`Preview ticket failed (${response.status})`);
      iframe.src=payload.url;
      setStatus(`PREVIEW routing Codebase terminal port ${port}`);
    }catch(error){
      iframe.src=RAILWAY_CONFIG.PREVIEW_URL;
      setStatus(`PREVIEW unavailable: ${error?.message||error}`);
    }
  };

  compactPreviewChrome();

  document.addEventListener('pointerdown',event=>{
    const target=event.target instanceof Element?event.target:null;
    const container=target?.closest?.('.terminal-view');
    if(!container)return;
    const tabId=String(container.id||'').replace(/^xterm-container-/,'');
    if(!tabId)return;
    try{focusTerminal(activeTerminals?.[tabId],container,tabId,{force:true})}catch{}
  },true);

  window.addEventListener('pageshow',()=>{
    compactPreviewChrome();
    requestAnimationFrame(()=>{
      try{
        if(!Array.isArray(openTabs))return;
        for(const tab of openTabs){
          if(tab?.type!=='terminal')continue;
          const container=document.getElementById(`xterm-container-${tab.id}`);
          focusTerminal(activeTerminals?.[tab.id],container,tab.id);
        }
      }catch{}
    });
  });
})();
