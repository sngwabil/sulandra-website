/* SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V4
   Give the Engineering Terminal the same ordinary in-session scrollback users
   expect from a normal terminal: wheel/trackpad/scrollbar navigation stays in
   xterm's browser buffer and never becomes Bash cursor-key input. Full-screen
   applications that explicitly enable terminal mouse tracking keep native mouse
   reporting. The browser buffer is raised to a substantial 100k-line window. */
(()=>{
  'use strict';
  if(window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V4__)return;
  window.__SULANDRA_TERMINAL_WHEEL_SCROLLBACK_V4__=true;

  const Runtime=window.SulandraTerminalRuntime;
  const Terminal=Runtime?.Terminal;
  if(!Terminal?.prototype?.open)return;

  /* The production stack historically requested 25k lines. Raise that request
     before the stack constructs xterm so long command output remains naturally
     reachable with the browser scrollbar/wheel during the same session. */
  if(!Runtime.__sulandraScrollbackConstructorV4){
    try{
      Runtime.Terminal=new Proxy(Terminal,{
        construct(Target,args){
          const options={...((args&&args[0])||{})};
          options.scrollback=Math.max(100000,Number(options.scrollback)||0);
          return Reflect.construct(Target,[options,...((args||[]).slice(1))]);
        }
      });
      Runtime.__sulandraScrollbackConstructorV4=true;
    }catch(error){
      console.warn('[Sulandra Terminal] unable to raise xterm scrollback window',error);
    }
  }

  if(Terminal.prototype.__sulandraWheelScrollbackV4Patched)return;
  const originalOpen=Terminal.prototype.open;
  const wheelLines=event=>{
    const delta=Number(event?.deltaY)||0;
    if(!delta)return 0;
    const magnitude=Math.abs(delta);
    const mode=Number(event?.deltaMode)||0;
    const lines=mode===2?Math.max(1,Math.round(magnitude*18))
      :mode===1?Math.max(1,Math.round(magnitude))
      :Math.max(1,Math.ceil(magnitude/18));
    return delta<0?-Math.min(lines,240):Math.min(lines,240);
  };
  const mouseTrackingActive=term=>String(term?.modes?.mouseTrackingMode||'none')!=='none';

  Terminal.prototype.open=function(parent){
    const result=originalOpen.call(this,parent);
    if(this.__sulandraWheelScrollbackInstalledV4)return result;
    this.__sulandraWheelScrollbackInstalledV4=true;

    const xtermRoot=parent?.querySelector?.('.xterm')||null;
    const viewport=parent?.querySelector?.('.xterm-viewport')||null;
    viewport?.setAttribute?.('data-sulandra-scrollback','enabled');

    const localWheel=event=>{
      if(!xtermRoot?.contains?.(event.target))return;
      if(mouseTrackingActive(this))return;
      const lines=wheelLines(event);
      if(!lines)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.scrollLines(lines);
    };

    /* Capture at the pane because .xterm-screen and .xterm-viewport are
       siblings. This guarantees normal pointer-wheel events are intercepted
       before xterm can synthesize terminal input. */
    parent?.addEventListener?.('wheel',localWheel,{capture:true,passive:false});

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

  Object.defineProperty(Terminal.prototype,'__sulandraWheelScrollbackV4Patched',{
    value:true,configurable:false,enumerable:false,writable:false
  });
})();
