/* CODEBASE_PREVIEW_TERMINAL_INPUT_V2
 * CODEBASE_PREVIEW_TERMINAL_INPUT_V3
 * Standalone Sulandra Codebase interaction repair.
 * - Preview remains dark until Open is explicitly pressed.
 * - Live terminal DOM is preserved across grid/tab rerenders.
 * - Terminal keyboard and paste work when focus lands on xterm descendants,
 *   including WebKit/iPad browsers.
 * - Resize reconciliation snapshots are suppressed only when they are the
 *   forced reset immediately caused by a layout resize.
 * - CodeMirror keeps its independent edit/focus fallback.
 */
(()=>{
  'use strict';
  if(window.__SULANDRA_CODEBASE_PREVIEW_TERMINAL_INPUT_V3__)return;
  window.__SULANDRA_CODEBASE_PREVIEW_TERMINAL_INPUT_V3__=true;
  window.__SULANDRA_CODEBASE_PREVIEW_TERMINAL_INPUT_V2__=true;

  const styleId='codebase-preview-terminal-input-style';
  const darkDoc='<!doctype html><html><head><meta name="color-scheme" content="dark"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(circle at 18% 0%,rgba(46,204,113,.08),transparent 34%),radial-gradient(circle at 88% 12%,rgba(66,165,245,.08),transparent 30%),linear-gradient(180deg,#020407 0%,#000 100%);}</style></head><body></body></html>';
  let previewIntent=false;
  let bindingTimer=0;

  const styleText=`
    #view-preview{position:relative!important;min-width:0!important;min-height:0!important;padding:0!important;overflow:hidden!important;background:radial-gradient(circle at 18% 0%,rgba(46,204,113,.08),transparent 34%),radial-gradient(circle at 88% 12%,rgba(66,165,245,.08),transparent 30%),linear-gradient(180deg,#020407 0%,#000 100%)!important;isolation:isolate}
    #view-preview>#codebase-preview-toolbar{position:absolute!important;z-index:6!important;top:8px!important;left:8px!important;right:8px!important;height:34px!important;min-height:34px!important;display:flex!important;align-items:center!important;gap:7px!important;margin:0!important;padding:0 7px!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:8px!important;background:linear-gradient(180deg,rgba(13,19,28,.86),rgba(2,6,10,.78))!important;-webkit-backdrop-filter:blur(18px) saturate(150%)!important;backdrop-filter:blur(18px) saturate(150%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 8px 24px rgba(0,0,0,.32)!important}
    #codebase-preview-toolbar .codebase-preview-label{flex:0 0 auto;color:#dce7f3;font:700 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.03em}
    #codebase-preview-toolbar #preview-port{width:58px!important;height:24px!important;margin:0!important;padding:0 6px!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:5px!important;outline:none!important;background:rgba(0,0,0,.48)!important;color:#fff!important;text-align:center!important;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;box-shadow:inset 0 1px 5px rgba(0,0,0,.45)!important}
    #codebase-preview-toolbar #preview-port:focus{border-color:rgba(79,195,247,.52)!important;box-shadow:0 0 0 2px rgba(79,195,247,.08),inset 0 1px 5px rgba(0,0,0,.45)!important}
    #codebase-preview-toolbar .codebase-preview-open,#codebase-preview-toolbar .codebase-preview-actions button{width:auto!important;height:24px!important;margin:0!important;padding:0 8px!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:5px!important;background:rgba(255,255,255,.025)!important;color:#dce7f3!important;font:650 9px/1 system-ui,-apple-system,"Segoe UI",sans-serif!important;cursor:pointer!important}
    #codebase-preview-toolbar .codebase-preview-actions{margin-left:auto!important;display:flex!important;align-items:center!important;gap:5px!important}
    #railway-preview-iframe{position:absolute!important;z-index:1!important;inset:0!important;display:block!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:radial-gradient(circle at 18% 0%,rgba(46,204,113,.07),transparent 32%),radial-gradient(circle at 88% 12%,rgba(66,165,245,.08),transparent 28%),#000!important;color-scheme:dark!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 34px rgba(255,255,255,.025)!important}
    .terminal-view{cursor:text!important;outline:none!important}.terminal-view .xterm,.terminal-view .xterm-screen{height:100%!important}.terminal-view:focus-within .xterm-cursor-layer,.terminal-view[data-codebase-focused="true"] .xterm-cursor-layer{opacity:1!important}.CodeMirror[data-codebase-input-bound="1"]{outline:none!important}
  `;

  const installStyle=()=>{let style=document.getElementById(styleId);if(style)return style;style=document.createElement('style');style.id=styleId;style.textContent=styleText;document.head.appendChild(style);return style};
  const setStatus=text=>{const node=document.getElementById('status-line-col');if(node)node.innerText=String(text||'')};
  const tabs=()=>{try{return Array.isArray(openTabs)?openTabs:[]}catch{return []}};
  const editors=()=>{try{return activeEditors&&typeof activeEditors==='object'?activeEditors:{}}catch{return {}}};
  const terminals=()=>{try{return activeTerminals&&typeof activeTerminals==='object'?activeTerminals:{}}catch{return {}}};

  const setPreviewDark=(message='')=>{const iframe=document.getElementById('railway-preview-iframe');if(!iframe)return;try{iframe.removeAttribute('src');iframe.srcdoc=darkDoc;iframe.dataset.codebasePreviewState='idle'}catch{}if(message)setStatus(message)};
  const compactPreviewChrome=()=>{
    installStyle();
    const view=document.getElementById('view-preview');const iframe=document.getElementById('railway-preview-iframe');if(!view||!iframe)return false;
    iframe.setAttribute('title','Sulandra Codebase Preview');
    let toolbar=document.getElementById('codebase-preview-toolbar');if(toolbar)return true;
    const direct=[...view.children];const titleRow=direct.find(node=>node!==iframe&&node.querySelector?.('h2'))||null;
    const portInput=document.getElementById('preview-port');const portRow=portInput?.parentElement?.parentElement===view?portInput.parentElement:null;
    const actions=titleRow?.querySelector('div:last-child')||null;const openButton=portRow?.querySelector('button')||null;
    toolbar=document.createElement('div');toolbar.id='codebase-preview-toolbar';toolbar.setAttribute('aria-label','Preview controls');
    const label=document.createElement('span');label.className='codebase-preview-label';label.textContent='Port';toolbar.appendChild(label);
    if(portInput)toolbar.appendChild(portInput);
    if(openButton){openButton.id='codebase-preview-open';openButton.classList.add('codebase-preview-open');openButton.textContent='Open';toolbar.appendChild(openButton)}
    if(actions){actions.classList.add('codebase-preview-actions');toolbar.appendChild(actions)}
    titleRow?.remove();if(portRow?.parentNode===view)portRow.remove();view.insertBefore(toolbar,iframe);return true;
  };

  const terminalDataFromKey=event=>{
    if(event.isComposing||event.key==='Dead'||event.metaKey)return '';
    if(event.ctrlKey&&!event.altKey&&event.key?.length===1){const upper=event.key.toUpperCase();if(upper>='A'&&upper<='Z')return String.fromCharCode(upper.charCodeAt(0)-64);if(event.key===' ')return '\x00'}
    const special={Enter:'\r',Backspace:'\x7f',Tab:'\t',Escape:'\x1b',ArrowUp:'\x1b[A',ArrowDown:'\x1b[B',ArrowRight:'\x1b[C',ArrowLeft:'\x1b[D',Home:'\x1b[H',End:'\x1b[F',Delete:'\x1b[3~',PageUp:'\x1b[5~',PageDown:'\x1b[6~'};
    if(special[event.key])return special[event.key];if(!event.ctrlKey&&event.key?.length===1)return(event.altKey?'\x1b':'')+event.key;return '';
  };

  const canonicalResetPacket=data=>{
    if(!(data instanceof ArrayBuffer))return false;
    const bytes=new Uint8Array(data);return bytes.length>=6&&bytes[0]===0x1b&&bytes[1]===0x63&&bytes[2]===0x1b&&bytes[3]===0x5b&&bytes[4]===0x3f&&bytes[5]===0x32;
  };
  const protectSocket=(term)=>{
    const ws=term?.__sulandraWs;if(!ws||ws.__codebaseInputV3)return;
    ws.__codebaseInputV3=true;
    const originalSend=ws.send.bind(ws);
    ws.send=data=>{
      if(typeof data==='string'&&data.startsWith('{')){try{const payload=JSON.parse(data);if(payload?.type==='resize')term.__codebaseResizeSentAt=performance.now()}catch{}}
      return originalSend(data);
    };
    const previousOnMessage=ws.onmessage;
    if(typeof previousOnMessage==='function'){
      ws.onmessage=event=>{
        const recentResize=Number.isFinite(term.__codebaseResizeSentAt)&&performance.now()-term.__codebaseResizeSentAt<1500;
        if(recentResize&&canonicalResetPacket(event.data))return;
        return previousOnMessage.call(ws,event);
      };
    }
  };
  const sendTerminalData=(term,data)=>{
    if(!term||!data)return false;protectSocket(term);
    const ws=term.__sulandraWs;
    if(ws?.readyState===WebSocket.OPEN){try{ws.send(data);return true}catch{}}
    try{if(typeof term.input==='function'){term.input(data,true);return true}}catch{}
    try{if(term?._core?._onData?.fire){term._core._onData.fire(data);return true}}catch{}
    try{if(typeof term.paste==='function'){term.paste(data);return true}}catch{}
    return false;
  };

  const bindTerminal=(term,container,tabId,{focus=false}={})=>{
    if(!term||!container)return;
    try{if(term.element&&term.element.parentElement!==container)container.replaceChildren(term.element)}catch{}
    try{term.options.cursorBlink=true}catch{}
    protectSocket(term);container.tabIndex=0;container.dataset.codebaseTerminalId=tabId;
    const focusNow=()=>{
      container.dataset.codebaseFocused='true';
      try{term.focus?.()}catch{}
      const active=document.activeElement;
      if(!(active&&(active===container||container.contains(active)))){try{container.focus({preventScroll:true})}catch{try{container.focus()}catch{}}}
      requestAnimationFrame(()=>{try{term.__sulandraFitAddon?.fit?.()}catch{}});
    };
    if(container.dataset.codebaseKeyboardBound!=='3'){
      container.dataset.codebaseKeyboardBound='3';
      const activate=()=>focusNow();
      container.addEventListener('pointerdown',activate,true);container.addEventListener('touchstart',activate,{capture:true,passive:true});container.addEventListener('click',activate,true);
      container.addEventListener('focusin',()=>{container.dataset.codebaseFocused='true'});container.addEventListener('focusout',event=>{if(!container.contains(event.relatedTarget))container.dataset.codebaseFocused='false'});
      container.addEventListener('keydown',event=>{
        if(event.target!==container&&!container.contains(event.target))return;
        const data=terminalDataFromKey(event);if(!data||!sendTerminalData(term,data))return;
        term.__codebaseLastDirectKeyAt=performance.now();event.preventDefault();event.stopImmediatePropagation();
      },true);
      container.addEventListener('paste',event=>{
        if(event.target!==container&&!container.contains(event.target))return;
        const text=event.clipboardData?.getData('text/plain')||event.clipboardData?.getData('text')||'';
        if(!text||!sendTerminalData(term,text))return;event.preventDefault();event.stopImmediatePropagation();
      },true);
      container.addEventListener('beforeinput',event=>{
        if(event.target!==container&&!container.contains(event.target))return;
        if(Number.isFinite(term.__codebaseLastDirectKeyAt)&&performance.now()-term.__codebaseLastDirectKeyAt<100)return;
        let data='';
        if(event.inputType==='insertText'&&event.data)data=event.data;
        else if(event.inputType==='insertLineBreak'||event.inputType==='insertParagraph')data='\r';
        else if(event.inputType==='insertFromPaste'&&event.data)data=event.data;
        if(!data||!sendTerminalData(term,data))return;event.preventDefault();event.stopImmediatePropagation();
      },true);
      container.addEventListener('compositionend',event=>{if(event.data)sendTerminalData(term,event.data)},true);
    }
    if(focus)requestAnimationFrame(focusNow);
  };

  const editorFallbackKey=(cm,event)=>{
    if(event.isComposing||event.key==='Dead'||event.metaKey||event.ctrlKey||event.altKey)return false;
    if(event.key?.length===1){cm.replaceSelection(event.key,'end','+input');return true}
    const commands={Backspace:'delCharBefore',Delete:'delCharAfter',ArrowLeft:'goCharLeft',ArrowRight:'goCharRight',ArrowUp:'goLineUp',ArrowDown:'goLineDown',Home:'goLineStartSmart',End:'goLineEnd',PageUp:'goPageUp',PageDown:'goPageDown'};
    if(event.key==='Enter'){cm.replaceSelection('\n','end','+input');return true}if(event.key==='Tab'){cm.replaceSelection('\t','end','+input');return true}
    const command=commands[event.key];if(!command)return false;cm.execCommand(command);return true;
  };
  const bindEditor=(cm,{focus=false}={})=>{
    if(!cm?.getWrapperElement)return;const wrapper=cm.getWrapperElement();if(!wrapper)return;
    wrapper.tabIndex=0;wrapper.dataset.codebaseInputBound='1';
    const focusNow=()=>{try{cm.focus()}catch{}requestAnimationFrame(()=>{const active=document.activeElement;if(active&&(active===wrapper||wrapper.contains(active)))return;try{wrapper.focus({preventScroll:true})}catch{try{wrapper.focus()}catch{}}})};
    if(wrapper.dataset.codebaseKeyboardBound!=='1'){
      wrapper.dataset.codebaseKeyboardBound='1';wrapper.addEventListener('pointerdown',()=>requestAnimationFrame(focusNow),true);wrapper.addEventListener('touchstart',()=>requestAnimationFrame(focusNow),{capture:true,passive:true});wrapper.addEventListener('click',()=>requestAnimationFrame(focusNow),true);
      wrapper.addEventListener('keydown',event=>{if(event.target!==wrapper)return;if(!editorFallbackKey(cm,event))return;event.preventDefault();event.stopPropagation()});
    }
    if(focus)requestAnimationFrame(focusNow);
  };

  const bindInputs=()=>{
    installStyle();compactPreviewChrome();
    for(const[id,term]of Object.entries(terminals())){const container=document.getElementById(`xterm-container-${id}`);if(container)bindTerminal(term,container,id,{focus:tabs()[0]?.id===id&&document.activeElement===document.body})}
    for(const cm of Object.values(editors()))bindEditor(cm);
    document.querySelectorAll('textarea[id^="editor-"]:not([style*="display: none"])').forEach(textarea=>{if(textarea.dataset.codebaseNativeFocusBound==='1')return;textarea.dataset.codebaseNativeFocusBound='1';textarea.addEventListener('pointerdown',()=>textarea.focus(),true);textarea.addEventListener('click',()=>textarea.focus(),true)});
  };
  const scheduleBindings=()=>{clearTimeout(bindingTimer);bindingTimer=setTimeout(bindInputs,70);setTimeout(bindInputs,150)};

  const preserveLiveTerminalNodes=()=>{
    const fragment=document.createDocumentFragment();const saved=[];
    for(const tab of tabs()){
      if(tab?.type!=='terminal')continue;const node=document.getElementById(`xterm-container-${tab.id}`);
      if(!node||!node.isConnected)continue;saved.push([tab.id,node]);fragment.appendChild(node);
    }
    return saved;
  };
  const restoreLiveTerminalNodes=saved=>{
    for(const[id,node]of saved){const fresh=document.getElementById(`xterm-container-${id}`);if(fresh&&fresh!==node)fresh.replaceWith(node)}
  };

  const previousInitXterm=window.initXterm;
  if(typeof previousInitXterm==='function'&&previousInitXterm.__codebaseInputV3!==true){
    const wrapped=function(containerId,tabId){const result=previousInitXterm(containerId,tabId);requestAnimationFrame(()=>requestAnimationFrame(()=>{const container=document.getElementById(containerId);const term=terminals()[tabId];if(container&&term)bindTerminal(term,container,tabId,{focus:tabs()[0]?.id===tabId})}));return result};
    wrapped.__codebaseInputV2=true;wrapped.__codebaseInputV3=true;window.initXterm=wrapped;
  }

  const previousRenderWorkspace=window.renderWorkspace;
  if(typeof previousRenderWorkspace==='function'&&previousRenderWorkspace.__codebaseInputV3!==true){
    const wrapped=function(...args){const saved=preserveLiveTerminalNodes();let result;try{result=previousRenderWorkspace.apply(this,args)}finally{restoreLiveTerminalNodes(saved);scheduleBindings()}return result};
    wrapped.__codebaseInputV2=true;wrapped.__codebaseInputV3=true;window.renderWorkspace=wrapped;
  }

  const previousFocusEditor=window.focusEditor;
  window.focusEditor=()=>{try{previousFocusEditor?.()}catch{}const active=tabs()[0];if(active?.type!=='code')return;const cm=editors()[active.id];if(cm)bindEditor(cm,{focus:true})};

  window.updatePreviewPort=async()=>{
    compactPreviewChrome();const requested=previewIntent;previewIntent=false;
    const input=document.getElementById('preview-port');const iframe=document.getElementById('railway-preview-iframe');if(!iframe)return;const port=Number(input?.value||3000);
    if(!requested){setPreviewDark(`PREVIEW ready on port ${port} — press Open when you want to load it.`);return}
    if(!Number.isInteger(port)||port<1024||port>65535||[9000,13337].includes(port)){setPreviewDark('PREVIEW port must be 1024–65535 and not a reserved terminal port');return}
    let sessionId='';try{const tab=tabs().find(item=>item?.type==='terminal'&&item?.sessionId);sessionId=String(tab?.sessionId||window.__SULANDRA_CODEBASE_PREVIEW_SESSION__||'').trim()}catch{}
    if(!sessionId){setPreviewDark(`PREVIEW waiting for a Codebase terminal session on port ${port}`);return}
    const token=String(RAILWAY_CONFIG.getToken?.()||'').trim();if(!token){setPreviewDark('PREVIEW requires an active Sulandra session');return}
    setStatus(`PREVIEW opening Codebase terminal ${sessionId.slice(0,12)}… on port ${port}`);
    try{
      const response=await fetch(`${RAILWAY_CONFIG.PREVIEW_URL}/api/preview-ticket`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({sessionId,port,surface:'codebase'})});
      const payload=await response.json().catch(()=>({}));if(!response.ok||!payload?.url)throw new Error(payload?.error||`Preview ticket failed (${response.status})`);
      iframe.removeAttribute('srcdoc');iframe.dataset.codebasePreviewState='live';iframe.src=payload.url;setStatus(`PREVIEW routing Codebase terminal port ${port}`);
    }catch(error){setPreviewDark(`PREVIEW unavailable: ${error?.message||error}`)}
  };

  document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target:null;const open=target?.closest?.('#codebase-preview-open,.codebase-preview-open');if(open)previewIntent=true},true);
  installStyle();compactPreviewChrome();setPreviewDark();scheduleBindings();
  window.addEventListener('pageshow',()=>{compactPreviewChrome();setPreviewDark();scheduleBindings()});
})();