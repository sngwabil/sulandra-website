/* CODEBASE_TERMINAL_NATIVE_PASTE_V1
 * Preserve xterm's native paste pipeline for standalone Sulandra Codebase.
 *
 * The keyboard/focus repair layers intentionally keep direct WebSocket fallbacks
 * for hardware and iPad input. Clipboard paste is different: xterm's paste()
 * method preserves terminal mode semantics such as Bash bracketed paste, which
 * keeps multiline shell pastes together instead of turning every newline into
 * an immediately executed command. This capture-phase shim runs before the
 * older container/iPad paste fallbacks and only intercepts when xterm paste()
 * is available; otherwise the existing direct-input fallback remains intact.
 */
(()=>{
  'use strict';
  if(window.__SULANDRA_CODEBASE_TERMINAL_NATIVE_PASTE_V1__)return;
  window.__SULANDRA_CODEBASE_TERMINAL_NATIVE_PASTE_V1__=true;

  const BRIDGE_ID='codebase-ipad-terminal-keyboard-bridge';
  const terminals=()=>{try{return activeTerminals&&typeof activeTerminals==='object'?activeTerminals:{}}catch{return {}}};

  const terminalForTarget=target=>{
    const element=target&&target.nodeType===1?target:target?.parentElement;
    if(!element)return null;

    const bridge=element.id===BRIDGE_ID?element:element.closest?.(`#${BRIDGE_ID}`);
    if(bridge){
      const id=String(bridge.dataset?.codebaseTerminalId||'');
      return id?terminals()[id]||null:null;
    }

    const container=element.closest?.('[id^="xterm-container-"]');
    if(!container)return null;
    const id=String(container.dataset?.codebaseTerminalId||container.id.slice('xterm-container-'.length));
    return id?terminals()[id]||null:null;
  };

  const nativePaste=(term,text)=>{
    if(!term||!text||typeof term.paste!=='function')return false;
    try{
      term.__codebaseNativePasteAt=performance.now();
      term.paste(text);
      return true;
    }catch{
      return false;
    }
  };

  document.addEventListener('paste',event=>{
    const text=event.clipboardData?.getData('text/plain')||event.clipboardData?.getData('text')||'';
    if(!text)return;
    const term=terminalForTarget(event.target);
    if(!nativePaste(term,text))return;
    if(event.cancelable)event.preventDefault();
    event.stopImmediatePropagation();
  },true);

  // Some WebKit versions emit insertFromPaste after paste. Once the clipboard
  // has already gone through xterm paste(), suppress that follow-up so the same
  // text cannot be forwarded a second time by the iPad/beforeinput fallbacks.
  document.addEventListener('beforeinput',event=>{
    if(String(event.inputType||'')!=='insertFromPaste')return;
    const term=terminalForTarget(event.target);
    const at=Number(term?.__codebaseNativePasteAt);
    if(!Number.isFinite(at)||performance.now()-at>600)return;
    if(event.cancelable)event.preventDefault();
    event.stopImmediatePropagation();
  },true);
})();
