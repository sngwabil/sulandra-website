/* IT_AGENT_REAL_TERMINAL_UX_V2
   IT_AGENT_REAL_TERMINAL_UX_V3
   Enhances the isolated terminal with a visible in-terminal line editor, command-box fallback,
   stable scrollback and reliable copy controls without changing worker isolation. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_REAL_TERMINAL_UX_V3__)return;
  window.__SULANDRA_IT_REAL_TERMINAL_UX_V3__=true;

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
    if(!sessionId||data===undefined||data===null)return;
    const base=typeof window.API==='string'&&window.API?window.API:API_FALLBACK;
    const response=await fetch(base+'/api/it-solutions/terminal/sessions/'+encodeURIComponent(sessionId)+'/input',{
      method:'POST',
      headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+authToken()},
      body:JSON.stringify({data:String(data)}),
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
    if(!root||root.dataset.rtUxV3==='1')return;
    const shell=root.querySelector('#itwsRtShell');
    const screen=root.querySelector('#itwsRtScreen');
    const commandbar=root.querySelector('.itws-rt-commandbar');
    if(!shell||!screen||!commandbar)return;
    root.dataset.rtUxV3='1';

    const shellMode=root.querySelector('.itws-rt-mode[data-mode="shell"]');
    if(shellMode)shellMode.textContent='Terminal';
    root.querySelectorAll('#itwsRtAi .itws-rt-ai-card p').forEach(node=>{
      node.textContent=String(node.textContent||'').replace(/Real Terminal/g,'Terminal');
    });

    const directLine=document.createElement('div');
    directLine.className='itws-rt-direct-line';
    directLine.innerHTML=`
      <span class="itws-rt-direct-prompt" aria-hidden="true">$</span>
      <textarea id="itwsRtDirectInput" class="itws-rt-direct-input" rows="1" spellcheck="false" autocomplete="off" autocapitalize="none" autocorrect="off" enterkeyhint="go" aria-label="Terminal input" placeholder="Type here, edit normally, then press Enter"></textarea>`;
    screen.after(directLine);

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
    directLine.after(switcher);

    const directInput=directLine.querySelector('#itwsRtDirectInput');
    screen.tabIndex=0;
    screen.setAttribute('aria-label','Interactive terminal output. In Direct typing mode, tap the terminal and type in the visible line below the output.');

    let inputMode='direct';
    try{inputMode=sessionStorage.getItem(INPUT_MODE_KEY)==='box'?'box':'direct'}catch{}
    let stickToBottom=true;
    let savedScrollTop=0;
    let interactionUntil=0;
    let suppressScroll=false;
    let savedSelection=null;
    const history=[];
    let historyIndex=0;

    const hint=switcher.querySelector('#itwsRtInputHint');
    const scrollState=switcher.querySelector('#itwsRtScrollState');
    const setScrollState=()=>{
      if(!scrollState)return;
      scrollState.classList.toggle('paused',!stickToBottom);
      scrollState.textContent=stickToBottom?'Following latest output':'Scrollback paused';
    };

    const focusDirect=()=>{
      if(inputMode!=='direct'||!directInput)return;
      try{directInput.focus({preventScroll:true})}catch{directInput.focus()}
      const end=directInput.value.length;
      try{directInput.setSelectionRange(end,end)}catch{}
    };

    const resizeDirectInput=()=>{
      if(!directInput)return;
      directInput.style.height='auto';
      directInput.style.height=Math.min(120,Math.max(34,directInput.scrollHeight))+'px';
    };

    const setInputMode=mode=>{
      inputMode=mode==='box'?'box':'direct';
      root.classList.toggle('itws-rt-direct-mode',inputMode==='direct');
      root.classList.toggle('itws-rt-box-mode',inputMode==='box');
      switcher.querySelectorAll('[data-rt-input-mode]').forEach(button=>button.classList.toggle('active',button.dataset.rtInputMode===inputMode));
      if(hint)hint.textContent=inputMode==='direct'
        ?'Type in the terminal line above. The blinking caret shows your position; Backspace/Delete edit the line before Enter sends it.'
        :'Use the command box exactly as before, then press Run or Enter.';
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
    directLine.addEventListener('click',event=>{
      if(event.target===directLine||event.target.classList?.contains('itws-rt-direct-prompt'))focusDirect();
    });

    const submitDirect=async()=>{
      if(inputMode!=='direct'||!directInput)return;
      const value=String(directInput.value||'');
      directInput.value='';resizeDirectInput();
      if(value.trim()){
        if(history[history.length-1]!==value)history.push(value);
        if(history.length>100)history.shift();
      }
      historyIndex=history.length;
      stickToBottom=true;savedSelection=null;setScrollState();screen.scrollTop=screen.scrollHeight;
      try{await postInput(root,value.replace(/\r?\n/g,'\n')+'\r')}
      catch(error){if(hint)hint.textContent=error.message||'Unable to send terminal input.'}
      window.setTimeout(focusDirect,0);
    };

    directInput.addEventListener('focus',()=>root.classList.add('itws-rt-direct-focus'));
    directInput.addEventListener('blur',()=>root.classList.remove('itws-rt-direct-focus'));
    directInput.addEventListener('input',resizeDirectInput);
    directInput.addEventListener('keydown',event=>{
      if(inputMode!=='direct')return;

      if(event.key==='Backspace'||event.key==='Delete'){
        event.stopPropagation();
        return;
      }

      if((event.ctrlKey||event.metaKey)&&!event.altKey&&String(event.key).toLowerCase()==='c'){
        event.preventDefault();event.stopPropagation();directInput.value='';resizeDirectInput();
        void postInput(root,'\x03').catch(()=>{});
        return;
      }
      if(event.ctrlKey&&!event.altKey&&String(event.key).toLowerCase()==='d'&&!directInput.value){
        event.preventDefault();event.stopPropagation();
        void postInput(root,'\x04').catch(()=>{});
        return;
      }
      if(event.key==='Enter'&&!event.shiftKey){
        event.preventDefault();event.stopPropagation();
        void submitDirect();
        return;
      }
      if(event.key==='ArrowUp'&&!event.shiftKey&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&history.length){
        event.preventDefault();event.stopPropagation();
        historyIndex=Math.max(0,historyIndex-1);
        directInput.value=history[historyIndex]||'';resizeDirectInput();
        const end=directInput.value.length;try{directInput.setSelectionRange(end,end)}catch{}
        return;
      }
      if(event.key==='ArrowDown'&&!event.shiftKey&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&history.length){
        event.preventDefault();event.stopPropagation();
        historyIndex=Math.min(history.length,historyIndex+1);
        directInput.value=historyIndex<history.length?(history[historyIndex]||''):'';resizeDirectInput();
        const end=directInput.value.length;try{directInput.setSelectionRange(end,end)}catch{}
        return;
      }
      event.stopPropagation();
    });

    setScrollState();
    resizeDirectInput();
    setInputMode(inputMode);
  };

  const scan=()=>document.querySelectorAll('#itwsRealTerminal').forEach(enhance);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.setInterval(scan,1500);
})();