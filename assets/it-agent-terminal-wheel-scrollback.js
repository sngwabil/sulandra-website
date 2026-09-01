/* SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V1
   Keep ordinary mouse-wheel navigation local to xterm scrollback instead of
   allowing xterm alternate-scroll mode to synthesize cursor-key PTY input.
   Real applications that explicitly enable terminal mouse tracking retain
   xterm's native mouse reporting. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V1__)return;
  window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V1__=true;

  const Runtime=window.SulandraTerminalRuntime;
  const Terminal=Runtime?.Terminal;
  if(!Terminal?.prototype?.open||!Terminal?.prototype?.attachCustomWheelEventHandler)return;
  if(Terminal.prototype.__sulandraWheelScrollbackPatched)return;

  const originalOpen=Terminal.prototype.open;
  const wheelLines=event=>{
    const delta=Number(event?.deltaY)||0;
    if(!delta)return 0;
    const magnitude=Math.abs(delta);
    const mode=Number(event?.deltaMode)||0;
    const lines=mode===2?Math.max(1,Math.round(magnitude*12))
      :mode===1?Math.max(1,Math.round(magnitude))
      :Math.max(1,Math.ceil(magnitude/24));
    return delta<0?-Math.min(lines,120):Math.min(lines,120);
  };

  Terminal.prototype.open=function(parent){
    const result=originalOpen.call(this,parent);
    if(!this.__sulandraWheelScrollbackInstalled){
      this.__sulandraWheelScrollbackInstalled=true;
      this.attachCustomWheelEventHandler(event=>{
        const mouseMode=String(this.modes?.mouseTrackingMode||'none');
        if(mouseMode!=='none')return true;
        const lines=wheelLines(event);
        if(!lines)return false;
        event.preventDefault?.();
        this.scrollLines(lines);
        return false;
      });
    }
    return result;
  };
  Object.defineProperty(Terminal.prototype,'__sulandraWheelScrollbackPatched',{value:true,configurable:false,enumerable:false,writable:false});
})();
