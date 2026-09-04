/* CODEBASE_IPAD_TERMINAL_KEYBOARD_V4
 * Real iPad/WebKit terminal keyboard bridge for standalone Sulandra Codebase.
 *
 * xterm's helper textarea is intentionally tiny/hidden. On iPad, focusing that
 * helper is not always enough to keep the software keyboard attached after the
 * Codebase grid rerenders. This bridge keeps one real, rendered textarea in the
 * viewport, focuses it synchronously from the terminal tap/click gesture, and
 * forwards keyboard, beforeinput, input, composition, and paste data to only the
 * terminal the user selected. Hardware keyboards continue to work as well.
 */
(()=>{
  'use strict';
  if(window.__SULANDRA_CODEBASE_IPAD_TERMINAL_KEYBOARD_V4__)return;
  window.__SULANDRA_CODEBASE_IPAD_TERMINAL_KEYBOARD_V4__=true;

  const BRIDGE_ID='codebase-ipad-terminal-keyboard-bridge';
  const BOUND='4';
  let active=null;
  let bindTimer=0;
  let suppressInputUntil=0;

  const terminals=()=>{try{return activeTerminals&&typeof activeTerminals==='object'?activeTerminals:{}}catch{return {}}};

  const ensureBridge=()=>{
    let bridge=document.getElementById(BRIDGE_ID);
    if(bridge)return bridge;
    bridge=document.createElement('textarea');
    bridge.id=BRIDGE_ID;
    bridge.rows=1;
    bridge.setAttribute('aria-label','Terminal keyboard input');
    bridge.setAttribute('autocomplete','off');
    bridge.setAttribute('autocorrect','off');
    bridge.setAttribute('autocapitalize','off');
    bridge.setAttribute('spellcheck','false');
    bridge.setAttribute('inputmode','text');
    bridge.setAttribute('enterkeyhint','enter');
    bridge.style.cssText='position:fixed!important;right:2px!important;bottom:2px!important;width:32px!important;height:24px!important;min-width:32px!important;min-height:24px!important;padding:0!important;margin:0!important;border:0!important;outline:0!important;resize:none!important;overflow:hidden!important;background:transparent!important;color:transparent!important;caret-color:transparent!important;opacity:.001!important;pointer-events:none!important;font-size:16px!important;line-height:24px!important;z-index:2147483000!important;-webkit-appearance:none!important;appearance:none!important;transform:translate3d(0,0,0)!important;';
    document.body.appendChild(bridge);
    return bridge;
  };

  const terminalDataFromKey=event=>{
    if(event.isComposing||event.key==='Dead'||event.metaKey)return '';
    if(event.ctrlKey&&!event.altKey&&event.key?.length===1){
      const upper=event.key.toUpperCase();
      if(upper>='A'&&upper<='Z')return String.fromCharCode(upper.charCodeAt(0)-64);
      if(event.key===' ')return '\x00';
    }
    const special={Enter:'\r',Backspace:'\x7f',Tab:'\t',Escape:'\x1b',ArrowUp:'\x1b[A',ArrowDown:'\x1b[B',ArrowRight:'\x1b[C',ArrowLeft:'\x1b[D',Home:'\x1b[H',End:'\x1b[F',Delete:'\x1b[3~',PageUp:'\x1b[5~',PageDown:'\x1b[6~'};
    if(special[event.key])return special[event.key];
    if(!event.ctrlKey&&event.key?.length===1)return(event.altKey?'\x1b':'')+event.key;
    return '';
  };

  const send=(data)=>{
    const term=active?.term;
    if(!term||!data)return false;
    const ws=term.__sulandraWs;
    if(ws?.readyState===WebSocket.OPEN){try{ws.send(data);return true}catch{}}
    try{if(typeof term.input==='function'){term.input(data,true);return true}}catch{}
    try{if(term?._core?._onData?.fire){term._core._onData.fire(data);return true}}catch{}
    try{if(typeof term.paste==='function'){term.paste(data);return true}}catch{}
    return false;
  };

  const focusBridge=(term,container,tabId)=>{
    if(!term||!container)return;
    const bridge=ensureBridge();
    active={term,container,tabId};
    bridge.dataset.codebaseTerminalId=tabId;
    bridge.value='';
    container.dataset.codebaseFocused='true';
    try{bridge.focus({preventScroll:true})}catch{try{bridge.focus()}catch{}}
    try{bridge.setSelectionRange(0,0)}catch{}
  };

  const bindBridgeEvents=()=>{
    const bridge=ensureBridge();
    if(bridge.dataset.codebaseKeyboardEvents===BOUND)return;
    bridge.dataset.codebaseKeyboardEvents=BOUND;

    bridge.addEventListener('keydown',event=>{
      const data=terminalDataFromKey(event);
      if(!data||!send(data))return;
      suppressInputUntil=performance.now()+180;
      bridge.value='';
      event.preventDefault();
      event.stopPropagation();
    },true);

    bridge.addEventListener('beforeinput',event=>{
      if(!active)return;
      let data='';
      const type=String(event.inputType||'');
      if((type==='insertText'||type==='insertReplacementText'||type==='insertCompositionText')&&event.data)data=event.data;
      else if(type==='insertLineBreak'||type==='insertParagraph')data='\r';
      else if(type==='deleteContentBackward'||type==='deleteWordBackward'||type==='deleteSoftLineBackward')data='\x7f';
      else if(type==='deleteContentForward'||type==='deleteWordForward'||type==='deleteSoftLineForward')data='\x1b[3~';
      else if(type==='insertFromPaste'&&event.data)data=event.data;
      if(!data||!send(data))return;
      suppressInputUntil=performance.now()+260;
      bridge.value='';
      if(event.cancelable)event.preventDefault();
      event.stopPropagation();
    },true);

    bridge.addEventListener('input',event=>{
      if(!active)return;
      const now=performance.now();
      if(now<suppressInputUntil){bridge.value='';return}
      const type=String(event.inputType||'');
      let data='';
      if(type.startsWith('deleteContent')||type.startsWith('deleteWord')||type.startsWith('deleteSoftLine'))data='\x7f';
      else if(type==='insertLineBreak'||type==='insertParagraph')data='\r';
      else data=typeof event.data==='string'&&event.data?event.data:bridge.value;
      bridge.value='';
      if(data)send(data);
    },true);

    bridge.addEventListener('compositionend',event=>{
      const data=String(event.data||'');
      if(data&&send(data))suppressInputUntil=performance.now()+260;
      bridge.value='';
    },true);

    bridge.addEventListener('paste',event=>{
      const text=event.clipboardData?.getData('text/plain')||event.clipboardData?.getData('text')||'';
      if(!text||!send(text))return;
      suppressInputUntil=performance.now()+260;
      bridge.value='';
      event.preventDefault();
      event.stopPropagation();
    },true);

    bridge.addEventListener('blur',()=>{
      if(active?.container)active.container.dataset.codebaseFocused='false';
    });
  };

  const bindContainer=(tabId,term,container)=>{
    if(!term||!container||container.dataset.codebaseIpadKeyboardBound===BOUND)return;
    container.dataset.codebaseIpadKeyboardBound=BOUND;
    const activate=()=>focusBridge(term,container,tabId);
    // Bubble-phase activation deliberately runs after xterm's own pointer handler,
    // so xterm cannot immediately steal focus back to its hidden helper textarea.
    container.addEventListener('pointerup',activate,false);
    container.addEventListener('touchend',activate,{passive:true});
    container.addEventListener('click',activate,false);
  };

  const bindAll=()=>{
    bindBridgeEvents();
    for(const[tabId,term]of Object.entries(terminals())){
      const container=document.getElementById(`xterm-container-${tabId}`);
      if(container)bindContainer(tabId,term,container);
    }
  };

  const schedule=()=>{
    clearTimeout(bindTimer);
    bindTimer=setTimeout(bindAll,40);
    setTimeout(bindAll,140);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',schedule);
})();
