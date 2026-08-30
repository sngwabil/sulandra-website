/* IT_AGENT_TERMINAL_INLINE_PROMPT_V1
   Makes Direct typing look and behave like a terminal prompt at the end of the
   scrollback surface instead of a separate input box. The isolated worker and
   Command box fallback remain unchanged. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_TERMINAL_INLINE_PROMPT_V1__)return;
  window.__SULANDRA_IT_TERMINAL_INLINE_PROMPT_V1__=true;

  const enhance=root=>{
    if(!root||root.dataset.inlinePromptReady==='1')return;
    const shell=root.querySelector('#itwsRtShell');
    const screen=root.querySelector('#itwsRtScreen');
    const directLine=root.querySelector('.itws-rt-direct-line');
    const directInput=root.querySelector('#itwsRtDirectInput');
    const promptNode=root.querySelector('.itws-rt-direct-prompt');
    const switcher=root.querySelector('.itws-rt-input-switch');
    if(!shell||!screen||!directLine||!directInput||!promptNode||!switcher)return;

    root.dataset.inlinePromptReady='1';

    const surface=document.createElement('div');
    surface.className='itws-rt-terminal-surface';
    screen.before(surface);
    surface.append(screen,directLine);

    directInput.removeAttribute('placeholder');
    directInput.setAttribute('aria-label','Terminal prompt input');
    screen.setAttribute('aria-label','Terminal scrollback');
    promptNode.textContent='bash-5.2$';

    let mutating=false;
    let lastPromptRaw='';
    let followLatest=true;
    let userScrollingUntil=0;

    const scrollState=switcher.querySelector('#itwsRtScrollState');
    const setScrollState=()=>{
      if(!scrollState)return;
      scrollState.classList.toggle('paused',!followLatest);
      scrollState.textContent=followLatest?'Following latest output':'Scrollback paused';
    };

    const focusPrompt=()=>{
      if(!root.classList.contains('itws-rt-direct-mode'))return;
      const selection=window.getSelection?.();
      if(selection&&!selection.isCollapsed)return;
      try{directInput.focus({preventScroll:true})}catch{directInput.focus()}
      const end=directInput.value.length;
      try{directInput.setSelectionRange(end,end)}catch{}
    };

    const normalizeTrailingPrompt=()=>{
      if(mutating)return;
      const raw=String(screen.textContent||'');
      const match=raw.match(/(^|\n)([^\n\r]{1,120}?(?:\$|#))[ \t]*$/);
      if(!match)return;

      const prompt=String(match[2]||'').trimEnd();
      if(!prompt)return;
      const cut=match.index+String(match[1]||'').length;
      const before=raw.slice(0,cut);
      const isNewPrompt=raw!==lastPromptRaw;
      lastPromptRaw=raw;
      promptNode.textContent=prompt;

      if(before!==raw){
        mutating=true;
        screen.textContent=before;
        mutating=false;
      }

      if(followLatest)surface.scrollTop=surface.scrollHeight;
      if(isNewPrompt&&root.classList.contains('itws-rt-direct-mode')){
        window.setTimeout(focusPrompt,0);
      }
    };

    const observer=new MutationObserver(()=>{
      normalizeTrailingPrompt();
      if(followLatest){
        window.requestAnimationFrame(()=>{surface.scrollTop=surface.scrollHeight});
      }
    });
    observer.observe(screen,{childList:true,characterData:true,subtree:true});
    normalizeTrailingPrompt();

    const markScrollIntent=()=>{userScrollingUntil=Date.now()+1800};
    for(const name of ['wheel','touchstart','touchmove','pointerdown','pointermove']){
      surface.addEventListener(name,markScrollIntent,{passive:true});
    }
    surface.addEventListener('scroll',()=>{
      if(Date.now()>userScrollingUntil)return;
      const max=Math.max(0,surface.scrollHeight-surface.clientHeight);
      followLatest=max-surface.scrollTop<30;
      setScrollState();
    },{passive:true});

    switcher.querySelector('#itwsRtLatest')?.addEventListener('click',()=>{
      followLatest=true;
      setScrollState();
      surface.scrollTop=surface.scrollHeight;
      window.setTimeout(focusPrompt,0);
    });

    surface.addEventListener('click',event=>{
      const selection=window.getSelection?.();
      if(selection&&!selection.isCollapsed)return;
      if(event.target===screen||event.target===surface||event.target===promptNode)focusPrompt();
    });

    directInput.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey){
        followLatest=true;
        setScrollState();
        window.setTimeout(()=>{surface.scrollTop=surface.scrollHeight},40);
      }
    },true);

    root.querySelectorAll('[data-rt-input-mode]').forEach(button=>button.addEventListener('click',()=>{
      if(button.dataset.rtInputMode==='direct')window.setTimeout(focusPrompt,35);
    }));

    setScrollState();
    surface.scrollTop=surface.scrollHeight;
    window.setTimeout(focusPrompt,60);
  };

  const scan=()=>document.querySelectorAll('#itwsRealTerminal').forEach(enhance);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.setInterval(scan,1200);
})();