/* SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V2
   Keep ordinary mouse-wheel/trackpad navigation local to xterm scrollback.
   Capture the browser wheel event before xterm/tmux can translate it into PTY
   cursor-key input. Preserve native terminal mouse reporting only when an
   application explicitly enables mouse tracking. Also provide keyboard
   scrollback navigation for long engineering sessions. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V2__)return;
  window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V2__=true;

  const Runtime=window.SulandraTerminalRuntime;
  const Terminal=Runtime?.Terminal;
  if(!Terminal?.prototype?.open)return;
  if(Terminal.prototype.__sulandraWheelScrollbackV2Patched)return;

  const originalOpen=Terminal.prototype.open;
  const wheelLines=event=>{
    const delta=Number(event?.deltaY)||0;
    if(!delta)return 0;
    const magnitude=Math.abs(delta);
    const mode=Number(event?.deltaMode)||0;
    const lines=mode===2?Math.max(1,Math.round(magnitude*18))
      :mode===1?Math.max(1,Math.round(magnitude))
      :Math.max(1,Math.ceil(magnitude/18));
    return delta<0?-Math.min(lines,180):Math.min(lines,180);
  };

  const mouseTrackingActive=term=>String(term?.modes?.mouseTrackingMode||'none')!=='none';

  Terminal.prototype.open=function(parent){
    const result=originalOpen.call(this,parent);
    if(this.__sulandraWheelScrollbackInstalledV2)return result;
    this.__sulandraWheelScrollbackInstalledV2=true;

    const viewport=parent?.querySelector?.('.xterm-viewport');
    if(viewport){
      viewport.setAttribute('data-sulandra-scrollback','enabled');
      viewport.addEventListener('wheel',event=>{
        if(mouseTrackingActive(this))return;
        const lines=wheelLines(event);
        if(!lines)return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.scrollLines(lines);
      },{capture:true,passive:false});
    }

    parent?.addEventListener?.('keydown',event=>{
      if(!event.shiftKey||event.altKey||event.ctrlKey||event.metaKey)return;
      if(mouseTrackingActive(this))return;
      if(event.key==='PageUp'){
        event.preventDefault();event.stopImmediatePropagation();this.scrollPages(-1);return;
      }
      if(event.key==='PageDown'){
        event.preventDefault();event.stopImmediatePropagation();this.scrollPages(1);return;
      }
      if(event.key==='Home'){
        event.preventDefault();event.stopImmediatePropagation();this.scrollToTop();return;
      }
      if(event.key==='End'){
        event.preventDefault();event.stopImmediatePropagation();this.scrollToBottom();
      }
    },true);

    return result;
  };

  Object.defineProperty(Terminal.prototype,'__sulandraWheelScrollbackV2Patched',{
    value:true,configurable:false,enumerable:false,writable:false
  });
})();
