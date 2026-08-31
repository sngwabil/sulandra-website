/* IT_SOLUTIONS_SHARED_ENTERPRISE_SHELL_V1
   Dedicated Sulandra engineering chrome for IT Solutions.
   Keeps the global Sulandra platform identity, removes Administrator module tabs
   from the engineering workspace, preserves Status Board / Action Center separation,
   and routes terminal-style coding requests through the existing controlled IT Agent
   coding-worker and approval workflow rather than exposing an unrestricted shell. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_ENTERPRISE_SHELL__)return;
  window.__SULANDRA_IT_ENTERPRISE_SHELL__=true;

  const platformLinks=[
    ['Admin Console','/admin.html#dashboard'],
    ['Intranet Portal','/intranet.html'],
    ['Employee Portal','/employee-portal.html'],
    ['Employee 360','/employee360.html'],
    ['Education Portal','/education-portal.html'],
    ['Spire Clinical','/spire.html'],
  ];
  const OPEN_KEY='sulandra:it-agent:status-board-open';
  const ACTIVE_VIEW_KEY='sulandra:it-solutions:active-view';
  const launcherSelectors=[
    '[data-sia-launcher]',
    '[data-sia-floating-launcher]',
    '#siaLauncher',
    '#sia-launcher',
    '.sia-launcher',
    '.sia-floating-launcher',
    '.floating-sia-launcher',
    '.ask-sia-launcher',
  ];

  const link=(label,href)=>{
    const a=document.createElement('a');
    a.textContent=label;
    a.href=href;
    return a;
  };

  const isInsideRealWorkspace=node=>Boolean(node?.closest?.('#agent,.itws-layout,.itws-content,main.shell'));
  const askSiaLabel=node=>{
    if(!(node instanceof Element))return false;
    const text=[node.getAttribute('aria-label'),node.getAttribute('title'),node.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().toLowerCase();
    return text.includes('ask sia');
  };
  const fixedHost=node=>{
    let current=node instanceof Element?node:null;
    while(current&&current!==document.body){
      try{if(getComputedStyle(current).position==='fixed')return current}catch{}
      current=current.parentElement;
    }
    return null;
  };
  const removeFloatingSiaFrom=root=>{
    if(!(root instanceof Element||root instanceof Document))return;
    for(const selector of launcherSelectors){
      root.querySelectorAll?.(selector).forEach(node=>{
        if(!isInsideRealWorkspace(node))node.remove();
      });
      if(root instanceof Element&&root.matches?.(selector)&&!isInsideRealWorkspace(root))root.remove();
    }
    const candidates=[];
    if(root instanceof Element)candidates.push(root);
    root.querySelectorAll?.('button,a,[role="button"],[aria-label],[title]').forEach(node=>candidates.push(node));
    candidates.forEach(node=>{
      if(!askSiaLabel(node)||isInsideRealWorkspace(node))return;
      const host=fixedHost(node);
      if(host&&!isInsideRealWorkspace(host))host.remove();
    });
  };

  function installFloatingSiaGuard(){
    const body=document.body;
    if(!body)return;
    body.dataset.siaExpandedEnvironment='true';
    removeFloatingSiaFrom(document);
    if(window.__SULANDRA_IT_FLOATING_SIA_GUARD__)return;
    window.__SULANDRA_IT_FLOATING_SIA_GUARD__=true;
    const observer=new MutationObserver(records=>{
      for(const record of records){
        record.addedNodes.forEach(node=>{if(node instanceof Element)removeFloatingSiaFrom(node)});
      }
    });
    observer.observe(body,{childList:true,subtree:true});
  }

  function forceCloseStatusBoard(){
    const drawer=document.querySelector('.itws-status-board-drawer');
    const backdrop=document.querySelector('.itws-drawer-backdrop');
    const toggle=document.getElementById('itwsActivity');
    drawer?.classList.remove('itws-open');
    backdrop?.classList.remove('open');
    document.body?.classList.remove('itws-status-board-open');
    if(toggle){
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label','Open status board');
    }
    try{sessionStorage.setItem(OPEN_KEY,'0')}catch{}
  }

  function installDrawerCloseGuard(){
    if(window.__SULANDRA_IT_DRAWER_CLOSE_GUARD__)return;
    window.__SULANDRA_IT_DRAWER_CLOSE_GUARD__=true;
    document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      const close=target.closest('.itws-status-board-close');
      const backdrop=target.closest('.itws-drawer-backdrop');
      if(!close&&!backdrop)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      forceCloseStatusBoard();
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||!document.body?.classList.contains('itws-status-board-open'))return;
      event.preventDefault();
      event.stopPropagation();
      forceCloseStatusBoard();
    },true);
  }

  function installLeftSidebarController(){
    if(window.__SULANDRA_IT_LEFT_SIDEBAR_CONTROLLER__)return true;
    const body=document.body;
    const sidebar=document.querySelector('.itws-sidebar');
    const layout=document.querySelector('.itws-layout');
    const closeButton=document.getElementById('itwsCloseSide');
    const openButton=document.getElementById('itwsMenu');
    if(!body||!sidebar||!layout||!closeButton||!openButton)return false;
    window.__SULANDRA_IT_LEFT_SIDEBAR_CONTROLLER__=true;

    if(!document.getElementById('itwsLeftSidebarRepairStyle')){
      const style=document.createElement('style');
      style.id='itwsLeftSidebarRepairStyle';
      style.textContent=`
        body.it-chatgpt-workspace #itwsCloseSide,
        body.it-chatgpt-workspace #itwsMenu{
          width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important;
          display:grid;place-items:center;border:1px solid #d9e1e7!important;border-radius:11px!important;
          background:#fff!important;color:#385065!important;box-shadow:0 2px 8px rgba(15,23,42,.07)!important;
          font-size:27px!important;font-weight:500!important;line-height:1!important;cursor:pointer!important;
          -webkit-tap-highlight-color:transparent!important;touch-action:manipulation!important;
        }
        body.it-chatgpt-workspace #itwsCloseSide:hover,
        body.it-chatgpt-workspace #itwsMenu:hover{background:#eef3f6!important;color:#0b5f9e!important}
        body.it-chatgpt-workspace #itwsCloseSide:focus-visible,
        body.it-chatgpt-workspace #itwsMenu:focus-visible{outline:3px solid rgba(22,133,209,.25)!important;outline-offset:2px!important}
        body.it-chatgpt-workspace .itws-sidebar-scrim{display:none!important}
        @media(min-width:821px){
          body.it-chatgpt-workspace.itws-left-sidebar-closed .itws-layout{grid-template-columns:minmax(0,1fr)!important}
          body.it-chatgpt-workspace.itws-left-sidebar-closed .itws-sidebar{display:none!important}
          body.it-chatgpt-workspace.itws-left-sidebar-closed #itwsMenu{display:grid!important;z-index:60!important}
          body.it-chatgpt-workspace.itws-left-sidebar-closed .agent-compose,
          body.it-chatgpt-workspace.itws-left-sidebar-closed #agentForm{
            left:50%!important;width:min(790px,calc(100vw - 56px))!important;
          }
        }
        @media(max-width:820px){
          body.it-chatgpt-workspace .itws-sidebar{z-index:2147483000!important}
          body.it-chatgpt-workspace #itwsMenu{display:grid!important;z-index:2147482980!important}
          body.it-chatgpt-workspace .itws-sidebar-scrim.open{
            display:block!important;position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;
            background:rgba(8,31,51,.28)!important;z-index:2147482990!important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let scrim=document.querySelector('.itws-sidebar-scrim');
    if(!scrim){
      scrim=document.createElement('div');
      scrim.className='itws-sidebar-scrim';
      scrim.setAttribute('aria-hidden','true');
      document.body.appendChild(scrim);
    }

    const isCompact=()=>window.matchMedia('(max-width:820px)').matches;
    const isOpen=()=>isCompact()?sidebar.classList.contains('open'):!body.classList.contains('itws-left-sidebar-closed');
    const setOpen=(open,{focus=false}={})=>{
      const next=Boolean(open);
      if(isCompact()){
        body.classList.remove('itws-left-sidebar-closed');
        sidebar.classList.toggle('open',next);
        scrim.classList.toggle('open',next);
      }else{
        sidebar.classList.remove('open');
        scrim.classList.remove('open');
        body.classList.toggle('itws-left-sidebar-closed',!next);
      }
      closeButton.textContent='‹';
      closeButton.setAttribute('aria-label','Collapse navigation');
      closeButton.setAttribute('title','Collapse navigation');
      closeButton.setAttribute('aria-expanded',next?'true':'false');
      openButton.textContent=next?'‹':'›';
      openButton.setAttribute('aria-label',next?'Close navigation':'Open navigation');
      openButton.setAttribute('title',next?'Close navigation':'Open navigation');
      openButton.setAttribute('aria-expanded',next?'true':'false');
      sidebar.setAttribute('aria-hidden',next?'false':'true');
      if(focus){
        const target=next?closeButton:openButton;
        window.setTimeout(()=>target?.focus?.(),0);
      }
    };

    closeButton.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      setOpen(false,{focus:true});
    },true);
    openButton.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      setOpen(!isOpen(),{focus:true});
    },true);
    scrim.addEventListener('click',()=>setOpen(false,{focus:true}));

    document.addEventListener('click',event=>{
      if(!isOpen())return;
      const target=event.target instanceof Element?event.target:null;
      if(!target||sidebar.contains(target)||openButton.contains(target)||closeButton.contains(target))return;
      setOpen(false);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&isOpen())setOpen(false,{focus:true});
    },true);

    let compact=isCompact();
    window.addEventListener('resize',()=>{
      const nextCompact=isCompact();
      if(nextCompact===compact)return;
      compact=nextCompact;
      setOpen(nextCompact?false:true);
    },{passive:true});

    setOpen(isCompact()?sidebar.classList.contains('open'):true);
    return true;
  }

  function installReturnToPortal(header){
    document.getElementById('itwsEnterpriseAdminTabs')?.remove();
    document.querySelectorAll('.itws-enterprise-admin-tabs').forEach(node=>node.remove());
    let button=header.querySelector('a.btn[href*="admin.html"]');
    if(!button){
      let actions=header.querySelector(':scope > div:last-child');
      if(!actions){actions=document.createElement('div');header.appendChild(actions)}
      button=document.createElement('a');
      button.className='btn itws-return-portal';
      actions.appendChild(button);
    }
    button.id='itwsReturnToAdminPortal';
    button.classList.add('itws-return-portal');
    button.href='/admin.html#dashboard';
    button.textContent='Return to Admin Portal';
    button.title='Return to Admin Portal';
    button.removeAttribute('aria-hidden');
  }

  function appendTerminalLine(root,text,kind='info'){
    if(!root)return;
    const line=document.createElement('div');
    line.className=`itws-terminal-line ${kind}`;
    line.textContent=String(text||'');
    root.appendChild(line);
    root.scrollTop=root.scrollHeight;
  }

  function installEngineeringWorkspace(){
    if(window.__SULANDRA_IT_ENGINEERING_WORKSPACE__)return true;
    const body=document.body;
    const sidebar=document.querySelector('.itws-sidebar');
    const nav=sidebar?.querySelector('.itws-nav');
    const agent=document.getElementById('agent');
    const agentMain=agent?.querySelector('.agent-main');
    const agentHead=agentMain?.querySelector('.agent-head');
    const prompt=document.getElementById('agentPrompt');
    const send=document.getElementById('agentSend')||document.getElementById('askAgentBtn');
    if(!body||!nav||!agent||!agentMain||!agentHead||!prompt||!send)return false;
    window.__SULANDRA_IT_ENGINEERING_WORKSPACE__=true;

    const buttons=[...nav.querySelectorAll('[data-itws-view]')];
    buttons.forEach(button=>{
      const view=button.dataset.itwsView;
      if(view==='agent')button.textContent='IT Agent';
      else if(view==='overview')button.textContent='Action Center';
      else if(view==='diagnostics')button.textContent='Diagnostics';
      else if(view==='approvals')button.textContent='Approvals';
      else if(view==='resolved')button.textContent='Completed Work';
      else if(view==='incidents'||view==='remote')button.remove();
    });

    const agentButton=nav.querySelector('[data-itws-view="agent"]');
    const terminalButton=document.createElement('button');
    terminalButton.type='button';
    terminalButton.id='itwsEngineeringTerminalNav';
    terminalButton.dataset.itwsEngineeringView='terminal';
    terminalButton.textContent='Engineering Terminal';
    if(agentButton?.nextSibling)nav.insertBefore(terminalButton,agentButton.nextSibling);else nav.prepend(terminalButton);

    const terminal=document.createElement('section');
    terminal.id='itwsEngineeringTerminal';
    terminal.className='itws-engineering-terminal';
    terminal.setAttribute('aria-label','Engineering Terminal');
    terminal.innerHTML=`
      <div class="itws-terminal-shell">
        <div class="itws-terminal-topbar">
          <div><span class="itws-terminal-kicker">CONTROLLED ENGINEERING</span><h2>Engineering Terminal</h2><p>Code, dependency, test, build, and deployment requests are routed through Sulandra's coding worker and approval gates.</p></div>
          <span class="itws-terminal-mode">Protected worker</span>
        </div>
        <div class="itws-terminal-context">
          <span>Repository · sngwabil/sulandra-website</span><span>Production · release/sulandra-1.0</span><span>No unrestricted host shell</span>
        </div>
        <div class="itws-terminal-quick" aria-label="Terminal shortcuts">
          <button type="button" data-terminal-command="Run the relevant tests and report any failures before making changes.">Run tests</button>
          <button type="button" data-terminal-command="Inspect the current build and deployment health and tell me what needs attention.">Check build</button>
          <button type="button" data-terminal-command="Install the dependency I name using the correct workspace and update the lockfile safely: ">Install dependency</button>
          <button type="button" data-terminal-command="Prepare the requested code change, verify it, and use the normal approval and release gates: ">Code change</button>
        </div>
        <div id="itwsTerminalOutput" class="itws-terminal-output" role="log" aria-live="polite"></div>
        <form id="itwsTerminalForm" class="itws-terminal-form">
          <span class="itws-terminal-prompt" aria-hidden="true">$</span>
          <input id="itwsTerminalInput" autocomplete="off" spellcheck="false" aria-label="Engineering command" placeholder="Describe a coding, install, test, build, or deployment task…">
          <button type="submit">Run</button>
        </form>
        <div class="itws-terminal-footer">
          <span>Never paste passwords, tokens, MFA codes, patient data, or other secrets.</span>
          <div><button type="button" id="itwsTerminalOpenChat">Open IT Agent</button><button type="button" id="itwsTerminalOpenStatus">Status Board</button></div>
        </div>
      </div>`;
    agentMain.insertBefore(terminal,agentHead.nextSibling);

    const output=terminal.querySelector('#itwsTerminalOutput');
    const form=terminal.querySelector('#itwsTerminalForm');
    const input=terminal.querySelector('#itwsTerminalInput');
    const openChat=terminal.querySelector('#itwsTerminalOpenChat');
    const openStatus=terminal.querySelector('#itwsTerminalOpenStatus');
    appendTerminalLine(output,'Sulandra Engineering Terminal ready.','system');
    appendTerminalLine(output,'Requests run through the authenticated IT Agent coding-worker workflow; this browser does not expose a raw server shell.','muted');
    appendTerminalLine(output,'Type /help for local terminal commands.','muted');

    const persistActiveView=view=>{try{sessionStorage.setItem(ACTIVE_VIEW_KEY,String(view||'agent'))}catch{}};
    const clearTerminalActive=()=>{
      body.classList.remove('itws-terminal-open');
      terminalButton.classList.remove('active');
    };
    const showAgent=()=>{
      persistActiveView('agent');
      clearTerminalActive();
      agentButton?.click();
      window.setTimeout(()=>prompt.focus(),0);
    };
    const showTerminal=()=>{
      persistActiveView('terminal');
      document.querySelector('.tab[data-view="agent"]')?.click();
      body.classList.add('itws-terminal-open');
      nav.querySelectorAll('button').forEach(button=>button.classList.remove('active'));
      terminalButton.classList.add('active');
      window.setTimeout(()=>input?.focus(),0);
    };

    terminalButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();showTerminal()});
    nav.querySelectorAll('[data-itws-view]').forEach(button=>button.addEventListener('click',()=>{
      persistActiveView(button.dataset.itwsView||'agent');
      clearTerminalActive();
    }));
    openChat?.addEventListener('click',showAgent);
    openStatus?.addEventListener('click',()=>document.getElementById('itwsActivity')?.click());
    terminal.querySelectorAll('[data-terminal-command]').forEach(button=>button.addEventListener('click',()=>{
      input.value=button.dataset.terminalCommand||'';
      input.focus();
      input.setSelectionRange(input.value.length,input.value.length);
    }));

    form?.addEventListener('submit',event=>{
      event.preventDefault();
      const command=String(input?.value||'').trim();
      if(!command)return;
      input.value='';
      appendTerminalLine(output,`$ ${command}`,'command');
      if(command==='/clear'){
        output.innerHTML='';
        appendTerminalLine(output,'Terminal cleared.','system');
        return;
      }
      if(command==='/help'){
        appendTerminalLine(output,'Local commands: /help · /clear · /status · /chat. Any other text is submitted as a controlled engineering request.','system');
        return;
      }
      if(command==='/chat'){
        appendTerminalLine(output,'Opening IT Agent chat.','system');
        showAgent();
        return;
      }
      if(command==='/status'){
        const states=[...document.querySelectorAll('#agent .agent-status .pill')].map(node=>node.textContent?.trim()).filter(Boolean);
        appendTerminalLine(output,states.length?states.join(' · '):'Runtime status pills are not currently available; use Status Board for verified work state.','system');
        return;
      }
      prompt.value=command;
      prompt.dispatchEvent(new Event('input',{bubbles:true}));
      prompt.dispatchEvent(new Event('change',{bubbles:true}));
      send.click();
      appendTerminalLine(output,'→ Submitted to the controlled Sulandra coding-worker workflow. Status Board will show verified GitHub/Railway work; open IT Agent for the full response.','submitted');
    });

    const title=agentHead.querySelector('h2');
    if(title)title.textContent='Sulandra IT Agent';
    let restoredView='';try{restoredView=sessionStorage.getItem(ACTIVE_VIEW_KEY)||''}catch{}
    if(restoredView==='terminal')window.requestAnimationFrame(showTerminal);
    return true;
  }

  function install(){
    const body=document.body;
    const header=document.querySelector('body > header');
    const shell=document.querySelector('body > main.shell');
    if(!body||!header||!shell)return;
    installFloatingSiaGuard();
    installDrawerCloseGuard();
    if(!body.classList.contains('it-chatgpt-workspace')){
      window.setTimeout(install,60);
      return;
    }

    if(!document.getElementById('itwsEnterprisePlatformBar')){
      const nav=document.createElement('nav');
      nav.id='itwsEnterprisePlatformBar';
      nav.className='itws-enterprise-platform';
      nav.setAttribute('aria-label','Sulandra Health Platform');
      const brand=document.createElement('strong');
      brand.textContent='Sulandra Health Platform';
      nav.appendChild(brand);
      for(const [label,href] of platformLinks)nav.appendChild(link(label,href));
      body.insertBefore(nav,header);
    }

    installReturnToPortal(header);
    const headerCopy=header.querySelector('p');
    if(headerCopy)headerCopy.textContent='Engineering, code, dependencies, diagnostics, release controls, and deployment.';
    body.classList.add('itws-enterprise-shell');
    installLeftSidebarController();
    installEngineeringWorkspace();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
