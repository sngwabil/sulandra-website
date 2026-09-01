/* SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V3
   Keep ordinary mouse-wheel/trackpad navigation inside browser scrollback.
   Intercept at the terminal pane in capture phase so events over xterm-screen
   cannot reach xterm's alternate-scroll path and become Up/Down PTY input.
   Preserve native mouse reporting only for applications that explicitly
   enable terminal mouse tracking. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V3__)return;
  window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V3__=true;

  const Runtime=window.SulandraTerminalRuntime;
  const Terminal=Runtime?.Terminal;
  if(!Terminal?.prototype?.open)return;
  if(Terminal.prototype.__sulandraWheelScrollbackV3Patched)return;

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
    if(this.__sulandraWheelScrollbackInstalledV3)return result;
    this.__sulandraWheelScrollbackInstalledV3=true;

    const xtermRoot=parent?.querySelector?.('.xterm')||null;
    const localWheel=event=>{
      if(!xtermRoot?.contains?.(event.target))return;
      if(mouseTrackingActive(this))return;
      const lines=wheelLines(event);
      if(!lines)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.scrollLines(lines);
    };

    /* Capture on the pane, not .xterm-viewport. xterm-screen is a sibling of
       the viewport, so viewport-only listeners miss the normal pointer path. */
    parent?.addEventListener?.('wheel',localWheel,{capture:true,passive:false});

    /* Second line of defense for any wheel event that reaches xterm itself. */
    try{
      this.attachCustomWheelEventHandler?.(event=>{
        if(mouseTrackingActive(this))return true;
        const lines=wheelLines(event);
        if(!lines)return true;
        event.preventDefault?.();
        this.scrollLines(lines);
        return false;
      });
    }catch{}

    parent?.addEventListener?.('keydown',event=>{
      if(!xtermRoot?.contains?.(event.target))return;
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

  Object.defineProperty(Terminal.prototype,'__sulandraWheelScrollbackV3Patched',{
    value:true,configurable:false,enumerable:false,writable:false
  });
})();
