/* IT_AGENT_REAL_TERMINAL_UX_V2
   Enhances the isolated terminal with direct keyboard input, command-box fallback,
   stable scrollback and reliable copy controls without changing worker isolation. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_REAL_TERMINAL_UX_V2__)return;
  window.__SULANDRA_IT_REAL_TERMINAL_UX_V2__=true;

  const INPUT_MODE_KEY='sulandra:it-solutions:terminal-input-mode';
  const API_FALLBACK='https://sulandra-website-production-5fc4.up.railway.app';

  const authToken=()=>sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('token')||'';

  const activeSessionId=root=>root.querySelector('#itwsRtTabs .itws-rt-tab.active')?.dataset?.terminalId||'';

  const postInput=async(root,data)=>{
    const sessionId=activeSessionId(root);
    if(!sessionId||!data)return;
    const base=typeof window.API==='string'&&window.API?window.API:API_FALLBACK;
    const response=await fetch(base+'/api/it-solutions/terminal/sessions/'+encodeURIComponent(sessionId)+'/input',{
      method:'POST',
      headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+authToken()},
      body:JSON.stringify({data}),
    });
    if(!response.ok){
      const payload=await response.json().catch(()=>({}));
      throw new Error(payload.error||payload.message||`Terminal input failed (${response.status})`);
    }
  };

  const copyText=async text=>{
    const value=String(text||'');
    if(!value)return false;
    try{
      await navigator.clipboard.writeText(value);
      return true;
    }catch{}
    const helper=document.createElement('textarea');
    helper.value=value;helper.setAttribute('readonly','');
    helper.style.position='fixed';helper.style.left='-10000px';helper.style.top='0';
    document.body.appendChild(helper);helper.select();
    let ok=false;try{ok=document.execCommand('copy')}catch{}
    helper.remove();return ok;
  };

  const nodeOffset=(root,node,offset)=>{
    try{
      const range=document.createRange();
      range.selectNodeContents(root);
      range.setEnd(node,offset);
      return range.toString().length;
    }catch{return 0}
  };

  const selectionSnapshot=screen=>{
    const sel=window.getSelection?.();
    if(!sel||!sel.rangeCount||sel.isCollapsed)return null;
    const range=sel.getRangeAt(0);
    if(!screen.contains(range.startContainer)||!screen.contains(range.endContainer))return null;
    const start=nodeOffset(screen,range.startContainer,range.startOffset);
    const end=nodeOffset(screen,range.endContainer,range.endOffset);
    return start===end?null:{start:Math.min(start,end),end:Math.max(start,end)};
  };

  const pointAtOffset=(root,target)=>{
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let remaining=Math.max(0,target),node;
    while((node=walker.nextNode())){
      const length=node.nodeValue?.length||0;
      if(remaining<=length)return {node,offset:remaining};
      remaining-=length;
    }
    const fallback=root.lastChild;
    if(fallback?.nodeType===Node.TEXT_NODE)return {node:fallback,offset:fallback.nodeValue?.length||0};
    return null;
  };

  const restoreSelection=(screen,snapshot)=>{
    if(!snapshot)return;
    const start=pointAtOffset(screen,snapshot.start);
    const end=pointAtOffset(screen,snapshot.end);
    if(!start||!end)return;
    try{
      const range=document.createRange();
      range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
      const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
    }catch{}
  };

  const enhance=root=>{
    if(!root||root.dataset.rtUxV2==='1')return;
    const shell=root.querySelector('#itwsRtShell');
    const screen=root.querySelector('#itwsRtScreen');
    const commandbar=root.querySelector('.itws-rt-commandbar');
    if(!shell||!screen||!commandbar)return;
    root.dataset.rtUxV2='1';

    const switcher=document.createElement('div');
    switcher.className='itws-rt-input-switch';
    switcher.innerHTML=`
      <button type="button" class="itws-rt-input-mode" data-rt-input-mode="direct">⌨ Direct typing</button>
      <button type="button" class="itws-rt-input-mode" data-rt-input-mode="box">Command box</button>
      <span class="itws-rt-input-hint" id="itwsRtInputHint"></span>
      <span class="itws-rt-input-actions">
        <span class="itws-rt-scroll-state" id="itwsRtScrollState">Following latest output</span>
        <button type="button" class="itws-rt-latest" id="itwsRtLatest">Latest</button>
        <button type="button" class="itws-rt-copy" id="itwsRtCopy">Copy</button>
      </span>`;
    commandbar.before(switcher);

    const capture=document.createElement('textarea');
    capture.id='itwsRtDirectCapture';
    capture.className='itws-rt-direct-capture';
    capture.setAttribute('aria-label','Direct terminal keyboard input');
    capture.setAttribute('autocapitalize','none');
    capture.setAttribute('autocomplete','off');
    capture.setAttribute('autocorrect','off');
    capture.spellcheck=false;
    shell.appendChild(capture);

    screen.tabIndex=0;
    screen.setAttribute('aria-label','Interactive terminal output. In Direct typing mode, tap the terminal and type.');

    let inputMode='direct';
    try{inputMode=sessionStorage.getItem(INPUT_MODE_KEY)==='box'?'box':'direct'}catch{}
    let stickToBottom=true;
    let savedScrollTop=0;
    let interactionUntil=0;
    let suppressScroll=false;
    let savedSelection=null;

    const hint=switcher.querySelector('#itwsRtInputHint');
    const scrollState=switcher.querySelector('#itwsRtScrollState');
    const setScrollState=()=>{
      if(!scrollState)return;
      scrollState.classList.toggle('paused',!stickToBottom);
      scrollState.textContent=stickToBottom?'Following latest output':'Scrollback paused';
    };

    const focusDirect=()=>{
      if(inputMode!=='direct')return;
      try{capture.focus({preventScroll:true})}catch{capture.focus()}
    };

    const setInputMode=mode=>{
      inputMode=mode==='box'?'box':'direct';
      root.classList.toggle('itws-rt-direct-mode',inputMode==='direct');
      root.classList.toggle('itws-rt-box-mode',inputMode==='box');
      switcher.querySelectorAll('[data-rt-input-mode]').forEach(button=>button.classList.toggle('active',button.dataset.rtInputMode===inputMode));
      if(hint)hint.textContent=inputMode==='direct'
        ?'Tap inside the terminal and type normally. Enter runs the command; paste and control keys go straight to the shell.'
        :'Use the command box below exactly as before, then press Run or Enter.';
      try{sessionStorage.setItem(INPUT_MODE_KEY,inputMode)}catch{}
      if(inputMode==='direct')window.setTimeout(focusDirect,30);
      else root.querySelector('#itwsRtCommand')?.focus();
    };

    switcher.querySelectorAll('[data-rt-input-mode]').forEach(button=>button.addEventListener('click',()=>setInputMode(button.dataset.rtInputMode)));

    const markScrollIntent=()=>{interactionUntil=Date.now()+1800};
    for(const eventName of ['wheel','touchstart','touchmove','pointerdown','pointermove'])screen.addEventListener(eventName,markScrollIntent,{passive:true});
    screen.addEventListener('scroll',()=>{
      if(suppressScroll||Date.now()>interactionUntil)return;
      const max=Math.max(0,screen.scrollHeight-screen.clientHeight);
      const nearBottom=max-screen.scrollTop<28;
      stickToBottom=nearBottom;
      if(!stickToBottom)savedScrollTop=screen.scrollTop;
      setScrollState();
    },{passive:true});

    document.addEventListener('selectionchange',()=>{
      if(suppressScroll)return;
      const snapshot=selectionSnapshot(screen);
      if(snapshot)savedSelection=snapshot;
    });

    const observer=new MutationObserver(()=>{
      suppressScroll=true;
      window.requestAnimationFrame(()=>{
        if(stickToBottom)screen.scrollTop=screen.scrollHeight;
        else screen.scrollTop=Math.min(savedScrollTop,Math.max(0,screen.scrollHeight-screen.clientHeight));
        if(savedSelection)restoreSelection(screen,savedSelection);
        window.requestAnimationFrame(()=>{suppressScroll=false});
      });
    });
    observer.observe(screen,{childList:true,characterData:true,subtree:true});

    switcher.querySelector('#itwsRtLatest')?.addEventListener('click',()=>{
      stickToBottom=true;savedSelection=null;setScrollState();
      screen.scrollTop=screen.scrollHeight;
      if(inputMode==='direct')focusDirect();
    });

    switcher.querySelector('#itwsRtCopy')?.addEventListener('click',async event=>{
      const button=event.currentTarget;
      const live=selectionSnapshot(screen);
      if(live)savedSelection=live;
      const text=screen.textContent||'';
      const selected=savedSelection?text.slice(savedSelection.start,savedSelection.end):'';
      const ok=await copyText(selected||text);
      const old=button.textContent;button.textContent=ok?(selected?'Copied selection':'Copied output'):'Copy failed';
      window.setTimeout(()=>{button.textContent=old},1300);
      if(inputMode==='direct')focusDirect();
    });

    screen.addEventListener('click',()=>{
      const selection=window.getSelection?.();
      if(selection&&!selection.isCollapsed)return;
      focusDirect();
    });

    capture.addEventListener('focus',()=>root.classList.add('itws-rt-direct-focus'));
    capture.addEventListener('blur',()=>root.classList.remove('itws-rt-direct-focus'));
    capture.addEventListener('paste',event=>{
      if(inputMode!=='direct')return;
      event.preventDefault();
      const text=event.clipboardData?.getData('text')||'';
      if(text)void postInput(root,text).catch(()=>{});
    });
    capture.addEventListener('input',()=>{
      if(inputMode!=='direct'){capture.value='';return}
      const value=capture.value;
      capture.value='';
      if(value)void postInput(root,value).catch(()=>{});
    });
    capture.addEventListener('keydown',event=>{
      if(inputMode!=='direct')return;
      if(event.metaKey)return;
      let data='';
      if(event.ctrlKey&&!event.altKey&&event.key.length===1){
        const code=event.key.toUpperCase().charCodeAt(0)&31;
        if(code>0)data=String.fromCharCode(code);
      }else{
        const keys={
          Enter:'\r',Backspace:'\x7f',Tab:'\t',Escape:'\x1b',
          ArrowUp:'\x1b[A',ArrowDown:'\x1b[B',ArrowRight:'\x1b[C',ArrowLeft:'\x1b[D',
          Home:'\x1b[H',End:'\x1b[F',Delete:'\x1b[3~',PageUp:'\x1b[5~',PageDown:'\x1b[6~'
        };
        data=keys[event.key]||'';
        if(!data&&!event.ctrlKey&&!event.altKey&&event.key.length===1)data=event.key;
      }
      if(!data)return;
      event.preventDefault();event.stopPropagation();capture.value='';
      void postInput(root,data).catch(()=>{});
    });

    setScrollState();
    setInputMode(inputMode);
  };

  const scan=()=>document.querySelectorAll('#itwsRealTerminal').forEach(enhance);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.setInterval(scan,1500);
})();