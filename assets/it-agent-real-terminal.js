/* IT_AGENT_REAL_TERMINAL_V1
   Adds a real isolated multi-session shell to IT Solutions while preserving the
   existing natural-language Sulandra coding-worker workflow. Production changes
   still use the normal approval/release path; this shell runs in a separate worker. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_REAL_TERMINAL_V1__)return;
  window.__SULANDRA_IT_REAL_TERMINAL_V1__=true;

  const WORKSPACE_KEY='sulandra:it-solutions:terminal-workspace';
  const MODE_KEY='sulandra:it-solutions:terminal-mode';
  const sessions=[];
  let workspaceId='';
  let activeId='';
  let pollTimer=0;
  let workerOnline=false;
  let terminalRoot=null;

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const stripAnsi=value=>String(value||'')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g,'')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g,'')
    .replace(/\x1B[()][A-Z0-2]/g,'')
    .replace(/\r(?!\n)/g,'\n')
    .replace(/\u0000/g,'');

  const authToken=()=>sessionStorage.getItem('sulandra:employee:access-token')
    ||localStorage.getItem('sulandra:employee:access-token')
    ||sessionStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('sulandra:admin:access-token')
    ||localStorage.getItem('token')||'';

  const apiRequest=async(path,options={})=>{
    try{
      if(typeof api==='function')return await api(path,options);
    }catch(error){throw error}
    const base=typeof API==='string'&&API?API:'https://sulandra-website-production-5fc4.up.railway.app';
    const response=await fetch(base+path,{
      ...options,
      headers:{Accept:'application/json',Authorization:'Bearer '+authToken(),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Request failed (${response.status})`);
    return payload.data??payload;
  };

  const sessionById=id=>sessions.find(session=>session.id===id)||null;
  const activeSession=()=>sessionById(activeId);

  const setWorkerState=(online,message='')=>{
    workerOnline=Boolean(online);
    const node=terminalRoot?.querySelector('#itwsRtWorkerState');
    if(!node)return;
    node.classList.toggle('ok',workerOnline);
    node.classList.toggle('bad',!workerOnline);
    node.textContent=workerOnline?'● Isolated terminal worker connected':`● ${message||'Terminal worker unavailable'}`;
  };

  const renderTabs=()=>{
    const root=terminalRoot?.querySelector('#itwsRtTabs');
    if(!root)return;
    root.innerHTML=sessions.map((session,index)=>`<button type="button" class="itws-rt-tab ${session.id===activeId?'active':''} ${session.alive?'alive':''}" data-terminal-id="${escapeHtml(session.id)}"><span class="itws-rt-tab-status"></span><span>Terminal ${index+1}</span><span class="itws-rt-tab-close" data-close-terminal="${escapeHtml(session.id)}" title="Close terminal">×</span></button>`).join('')+'<button type="button" class="itws-rt-new-tab" id="itwsRtNewTab" title="New terminal" aria-label="New terminal">＋</button>';
    root.querySelectorAll('[data-terminal-id]').forEach(button=>button.addEventListener('click',event=>{
      if(event.target instanceof Element&&event.target.closest('[data-close-terminal]'))return;
      activeId=button.dataset.terminalId||'';renderTabs();renderScreen();terminalRoot?.querySelector('#itwsRtCommand')?.focus();
    }));
    root.querySelectorAll('[data-close-terminal]').forEach(button=>button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();void closeTerminal(button.dataset.closeTerminal||'');
    }));
    root.querySelector('#itwsRtNewTab')?.addEventListener('click',()=>void createTerminal());
  };

  const renderScreen=()=>{
    const screen=terminalRoot?.querySelector('#itwsRtScreen');
    if(!screen)return;
    const session=activeSession();
    screen.textContent=session?.output||'No terminal is open. Press + to start one.\n';
    screen.scrollTop=screen.scrollHeight;
    const run=terminalRoot?.querySelector('#itwsRtRun');
    const command=terminalRoot?.querySelector('#itwsRtCommand');
    if(run)run.disabled=!session?.alive;
    if(command)command.disabled=!session?.alive;
  };

  const appendOutput=(session,text,{reset=false}={})=>{
    const clean=stripAnsi(text);
    if(reset)session.output=clean;
    else session.output+=clean;
    if(session.output.length>1_500_000)session.output=session.output.slice(-1_500_000);
    if(session.id===activeId)renderScreen();
  };

  const ensureWorkspace=async()=>{
    if(workspaceId){
      try{await apiRequest('/api/it-solutions/terminal/workspaces/'+encodeURIComponent(workspaceId));return workspaceId}
      catch{workspaceId='';try{sessionStorage.removeItem(WORKSPACE_KEY)}catch{}}
    }
    const data=await apiRequest('/api/it-solutions/terminal/workspaces',{method:'POST',body:'{}'});
    workspaceId=String(data.workspaceId||'');
    if(!workspaceId)throw new Error('Terminal worker did not return a workspace ID');
    try{sessionStorage.setItem(WORKSPACE_KEY,workspaceId)}catch{}
    return workspaceId;
  };

  const createTerminal=async()=>{
    try{
      setWorkerState(true,'Starting terminal…');
      await ensureWorkspace();
      const data=await apiRequest('/api/it-solutions/terminal/workspaces/'+encodeURIComponent(workspaceId)+'/sessions',{method:'POST',body:JSON.stringify({cols:120,rows:34})});
      const session={id:String(data.sessionId||''),cursor:0,output:'',alive:true,polling:false};
      if(!session.id)throw new Error('Terminal worker did not return a session ID');
      sessions.push(session);activeId=session.id;renderTabs();renderScreen();
      await pollSession(session);
      terminalRoot?.querySelector('#itwsRtCommand')?.focus();
    }catch(error){setWorkerState(false,error.message||'Unable to start terminal');appendSystem(error.message||'Unable to start terminal')}
  };

  const closeTerminal=async(id)=>{
    const session=sessionById(id);if(!session)return;
    try{await apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(id),{method:'DELETE'})}catch{}
    const index=sessions.indexOf(session);if(index>=0)sessions.splice(index,1);
    if(activeId===id)activeId=sessions[Math.max(0,index-1)]?.id||sessions[0]?.id||'';
    renderTabs();renderScreen();
  };

  const pollSession=async session=>{
    if(!session||session.polling)return;
    session.polling=true;
    try{
      const data=await apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(session.id)+'/output?cursor='+encodeURIComponent(String(session.cursor||0)));
      if(data.reset)session.output='';
      if(data.data)appendOutput(session,data.data,{reset:false});
      session.cursor=Number(data.cursor)||session.cursor||0;
      session.alive=data.alive!==false;
      if(data.exitCode!==null&&data.exitCode!==undefined)session.exitCode=data.exitCode;
      setWorkerState(true);
    }catch(error){
      if(/not found/i.test(String(error.message||'')))session.alive=false;
      else setWorkerState(false,error.message||'Terminal connection interrupted');
    }finally{session.polling=false;renderTabs();if(session.id===activeId)renderScreen()}
  };

  const pollAll=()=>sessions.filter(session=>session.alive).forEach(session=>void pollSession(session));

  const sendRaw=async data=>{
    const session=activeSession();if(!session?.alive)return;
    await apiRequest('/api/it-solutions/terminal/sessions/'+encodeURIComponent(session.id)+'/input',{method:'POST',body:JSON.stringify({data})});
    window.setTimeout(()=>void pollSession(session),80);
  };

  const runCommand=async()=>{
    const input=terminalRoot?.querySelector('#itwsRtCommand');
    const value=String(input?.value||'');
    if(!value.trim())return;
    if(input)input.value='';
    try{await sendRaw(value.replace(/\r?\n/g,'\n')+'\r')}
    catch(error){appendSystem(error.message||'Unable to send terminal input')}
  };

  const appendSystem=message=>{
    const session=activeSession();
    if(session)appendOutput(session,`\n[${String(message||'Terminal message')}]\n`);
    else{
      const screen=terminalRoot?.querySelector('#itwsRtScreen');if(screen)screen.textContent=`${String(message||'Terminal message')}\n`;
    }
  };

  const clearScreen=()=>{const session=activeSession();if(session){session.output='';renderScreen()}};

  const restartTerminal=async()=>{
    const old=activeSession();
    if(old)await closeTerminal(old.id);
    await createTerminal();
  };

  const resetWorkspace=async()=>{
    if(!workspaceId)return;
    if(!window.confirm('Reset this isolated coding workspace? All uncommitted terminal files and terminal sessions in this workspace will be deleted. Production is not affected.'))return;
    for(const session of [...sessions])await closeTerminal(session.id);
    try{await apiRequest('/api/it-solutions/terminal/workspaces/'+encodeURIComponent(workspaceId),{method:'DELETE'})}catch{}
    workspaceId='';try{sessionStorage.removeItem(WORKSPACE_KEY)}catch{}
    appendSystem('Isolated workspace reset.');
    await createTerminal();
  };

  const openAgent=()=>{
    document.querySelector('.itws-nav [data-itws-view="agent"]')?.click();
    window.setTimeout(()=>document.getElementById('agentPrompt')?.focus(),50);
  };
  const openStatus=()=>document.getElementById('itwsActivity')?.click();

  const sendNaturalLanguage=()=>{
    const input=terminalRoot?.querySelector('#itwsRtAiInput');
    const text=String(input?.value||'').trim();if(!text)return;
    const prompt=document.getElementById('agentPrompt');
    const send=document.getElementById('agentSend')||document.getElementById('askAgentBtn');
    if(!prompt||!send){appendSystem('IT Agent composer is unavailable.');return}
    prompt.value=text;prompt.dispatchEvent(new Event('input',{bubbles:true}));
    send.click();if(input)input.value='';openAgent();
  };

  const setMode=mode=>{
    const selected=mode==='ai'?'ai':'shell';
    terminalRoot?.querySelectorAll('.itws-rt-mode').forEach(button=>button.classList.toggle('active',button.dataset.mode===selected));
    terminalRoot?.querySelector('#itwsRtShell')?.classList.toggle('hidden',selected!=='shell');
    terminalRoot?.querySelector('#itwsRtAi')?.classList.toggle('hidden',selected!=='ai');
    try{sessionStorage.setItem(MODE_KEY,selected)}catch{}
    if(selected==='shell'&&!sessions.length)void createTerminal();
  };

  const installMarkup=terminal=>{
    terminal.innerHTML=`
      <div class="itws-real-terminal" id="itwsRealTerminal">
        <div class="itws-rt-head">
          <div><span class="itws-rt-kicker">CONTROLLED ENGINEERING</span><h2>Engineering Workspace</h2><p>Use a real isolated shell for direct coding, installs, tests and Git-style local diffs, or switch to Tell Sulandra for natural-language engineering requests.</p></div>
          <span class="itws-rt-isolation">Isolated worker · production secrets excluded</span>
        </div>
        <div class="itws-rt-modebar">
          <div class="itws-rt-modes"><button type="button" class="itws-rt-mode active" data-mode="shell">Real Terminal</button><button type="button" class="itws-rt-mode" data-mode="ai">Tell Sulandra</button></div>
          <div class="itws-rt-tools"><button type="button" class="itws-rt-tool" id="itwsRtTests">Run typecheck</button><button type="button" class="itws-rt-tool" id="itwsRtBuild">Build web</button><button type="button" class="itws-rt-tool" id="itwsRtCtrlC">Ctrl+C</button><button type="button" class="itws-rt-tool" id="itwsRtClear">Clear</button><button type="button" class="itws-rt-tool" id="itwsRtRestart">Restart shell</button><button type="button" class="itws-rt-tool danger" id="itwsRtReset">Reset workspace</button></div>
        </div>
        <section class="itws-rt-shell" id="itwsRtShell">
          <div class="itws-rt-tabs" id="itwsRtTabs"></div>
          <pre class="itws-rt-screen" id="itwsRtScreen" role="log" aria-live="polite">Connecting to isolated coding worker…\n</pre>
          <div class="itws-rt-commandbar"><span class="itws-rt-prompt">$</span><textarea class="itws-rt-command" id="itwsRtCommand" rows="1" spellcheck="false" autocomplete="off" aria-label="Terminal command" placeholder="Type a shell command. Shift+Enter adds another line."></textarea><button type="button" class="itws-rt-run" id="itwsRtRun">Run</button></div>
          <div class="itws-rt-foot"><span>Commands run only in the isolated coding-worker workspace. Do not paste passwords, tokens, MFA codes, patient data, or other secrets.</span><span class="itws-rt-worker-state" id="itwsRtWorkerState">● Checking terminal worker…</span></div>
        </section>
        <section class="itws-rt-ai hidden" id="itwsRtAi">
          <div class="itws-rt-ai-card"><h3>Tell Sulandra what you want</h3><p>This keeps the conversational coding-worker workflow for requests such as “fix this layout,” “install a dependency,” or “prepare and verify a code change.” Use Real Terminal when you want to type exact shell commands and watch output live.</p><div class="itws-rt-ai-quick"><button type="button" data-ai-prompt="Inspect the current build and tell me what needs attention.">Inspect build</button><button type="button" data-ai-prompt="Fix the issue I describe, run the relevant verification, and show the verified work in Status Board.">Fix + verify</button><button type="button" data-ai-prompt="Install the dependency I name in the correct workspace and explain the changes before promotion: ">Install dependency</button><button type="button" data-ai-prompt="Review my current isolated-workspace changes and prepare the safe GitHub approval path.">Prepare review</button></div><textarea class="itws-rt-ai-input" id="itwsRtAiInput" placeholder="Example: Add a validation helper, run the relevant checks, and prepare it for review…"></textarea><div class="itws-rt-ai-actions"><button type="button" id="itwsRtOpenStatus">Status Board</button><button type="button" id="itwsRtOpenAgent">Open IT Agent</button><button type="button" class="primary" id="itwsRtSendAi">Send to Sulandra</button></div></div>
        </section>
      </div>`;
    terminalRoot=terminal.querySelector('#itwsRealTerminal');
  };

  const bind=()=>{
    terminalRoot.querySelectorAll('.itws-rt-mode').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode||'shell')));
    terminalRoot.querySelector('#itwsRtRun')?.addEventListener('click',()=>void runCommand());
    terminalRoot.querySelector('#itwsRtCommand')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void runCommand()}
      else if(event.key==='c'&&event.ctrlKey){event.preventDefault();void sendRaw('\x03')}
    });
    terminalRoot.querySelector('#itwsRtCtrlC')?.addEventListener('click',()=>void sendRaw('\x03'));
    terminalRoot.querySelector('#itwsRtClear')?.addEventListener('click',clearScreen);
    terminalRoot.querySelector('#itwsRtRestart')?.addEventListener('click',()=>void restartTerminal());
    terminalRoot.querySelector('#itwsRtReset')?.addEventListener('click',()=>void resetWorkspace());
    terminalRoot.querySelector('#itwsRtTests')?.addEventListener('click',async()=>{setMode('shell');const input=terminalRoot.querySelector('#itwsRtCommand');if(input)input.value='npm run typecheck';await runCommand()});
    terminalRoot.querySelector('#itwsRtBuild')?.addEventListener('click',async()=>{setMode('shell');const input=terminalRoot.querySelector('#itwsRtCommand');if(input)input.value='npm run build:web';await runCommand()});
    terminalRoot.querySelector('#itwsRtOpenStatus')?.addEventListener('click',openStatus);
    terminalRoot.querySelector('#itwsRtOpenAgent')?.addEventListener('click',openAgent);
    terminalRoot.querySelector('#itwsRtSendAi')?.addEventListener('click',sendNaturalLanguage);
    terminalRoot.querySelector('#itwsRtAiInput')?.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();sendNaturalLanguage()}});
    terminalRoot.querySelectorAll('[data-ai-prompt]').forEach(button=>button.addEventListener('click',()=>{const input=terminalRoot.querySelector('#itwsRtAiInput');if(input){input.value=button.dataset.aiPrompt||'';input.focus()}}));
  };

  const checkWorker=async()=>{
    try{await apiRequest('/api/it-solutions/terminal/health');setWorkerState(true);return true}
    catch(error){setWorkerState(false,error.message||'Terminal worker unavailable');return false}
  };

  const install=async()=>{
    const terminal=document.getElementById('itwsEngineeringTerminal');
    if(!terminal){window.setTimeout(()=>void install(),80);return}
    if(terminal.dataset.realTerminalReady==='1')return;
    terminal.dataset.realTerminalReady='1';
    try{workspaceId=sessionStorage.getItem(WORKSPACE_KEY)||''}catch{}
    installMarkup(terminal);bind();renderTabs();renderScreen();
    const healthy=await checkWorker();
    let mode='shell';try{mode=sessionStorage.getItem(MODE_KEY)||'shell'}catch{}
    setMode(mode);
    if(healthy&&mode!=='ai'&&!sessions.length)void createTerminal();
    pollTimer=window.setInterval(pollAll,350);
    window.addEventListener('beforeunload',()=>{if(pollTimer)window.clearInterval(pollTimer)},{once:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void install(),{once:true});
  else void install();
})();
