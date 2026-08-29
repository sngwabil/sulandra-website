/* Sulandra IT Agent chat-first workspace. Uses existing authenticated APIs and action safety controls. */
(()=>{
  if(window.__SULANDRA_IT_CHATGPT_WORKSPACE__)return;
  window.__SULANDRA_IT_CHATGPT_WORKSPACE__=true;

  const ready=()=>{
    const shell=document.querySelector('main.shell');
    const agent=document.getElementById('agent');
    const agentMain=agent?.querySelector('.agent-main');
    if(!shell||!agent||!agentMain)return;
    document.body.classList.add('it-chatgpt-workspace');

    const existing=[...shell.children];
    const layout=document.createElement('div');layout.className='itws-layout';
    const sidebar=document.createElement('aside');sidebar.className='itws-sidebar';
    sidebar.innerHTML=`
      <div class="itws-brand"><span style="display:flex;align-items:center;gap:9px"><span class="itws-brand-mark">IT</span>Sulandra IT</span><button class="itws-icon-btn" id="itwsCloseSide" type="button" aria-label="Close menu">×</button></div>
      <button class="itws-new-chat" id="itwsNewChat" type="button"><span style="font-size:20px;font-weight:300">＋</span><span>New chat</span></button>
      <div class="itws-search-wrap"><input class="itws-search" id="itwsSearch" type="search" placeholder="Search chats"></div>
      <div class="itws-nav">
        <button type="button" data-itws-view="agent" class="active">IT Agent</button>
        <button type="button" data-itws-view="overview">Operations</button>
        <button type="button" data-itws-view="incidents">Incidents</button>
        <button type="button" data-itws-view="diagnostics">Diagnostics</button>
        <button type="button" data-itws-view="remote">Remote Assistance</button>
        <button type="button" data-itws-view="approvals">Approvals</button>
        <button type="button" data-itws-view="resolved">Resolved Archive</button>
      </div>
      <div class="itws-recent-title">Recent chats</div>
      <div class="itws-recents" id="itwsRecents"><div style="padding:8px 10px;color:#909197;font-size:11px">Loading…</div></div>
      <div class="itws-sidebar-foot"><span>Administrator workspace</span><a href="/admin.html" style="color:#47657f;text-decoration:none;font-weight:700">Admin</a></div>`;
    const content=document.createElement('div');content.className='itws-content';
    existing.forEach(node=>content.appendChild(node));
    layout.append(sidebar,content);shell.appendChild(layout);

    const head=agentMain.querySelector('.agent-head');
    if(head){
      const mobile=document.createElement('button');mobile.type='button';mobile.className='itws-icon-btn itws-mobile-menu';mobile.id='itwsMenu';mobile.setAttribute('aria-label','Open menu');mobile.textContent='☰';head.appendChild(mobile);
      const activity=document.createElement('button');activity.type='button';activity.className='itws-activity-toggle';activity.id='itwsActivity';activity.textContent='Activity';activity.setAttribute('aria-expanded','false');head.appendChild(activity);
    }
    const actionCenter=agent.querySelector('.agent-shell>aside');
    const backdrop=document.createElement('div');backdrop.className='itws-drawer-backdrop';document.body.appendChild(backdrop);
    const toast=document.createElement('div');toast.className='itws-toast';toast.id='itwsToast';document.body.appendChild(toast);

    const closeSide=()=>sidebar.classList.remove('open');
    document.getElementById('itwsMenu')?.addEventListener('click',()=>sidebar.classList.add('open'));
    document.getElementById('itwsCloseSide')?.addEventListener('click',closeSide);

    /*
      iPad/Safari interaction guard:
      Action Center is modal only on the compact mobile layout. On tablet/desktop the
      old full-screen backdrop sat above the fixed composer (z-index 80 vs 35), so it
      intercepted every touch intended for #agentPrompt. Keep the drawer non-modal on
      wider layouts, make Activity a true toggle, and close the drawer when the user
      returns to the composer.
    */
    const activityButton=document.getElementById('itwsActivity');
    const drawerIsModal=()=>window.matchMedia('(max-width:820px)').matches;
    const setDrawer=open=>{
      actionCenter?.classList.toggle('itws-open',!!open);
      backdrop.classList.toggle('open',!!open&&drawerIsModal());
      activityButton?.setAttribute('aria-expanded',open?'true':'false');
    };
    const closeDrawer=()=>setDrawer(false);
    activityButton?.addEventListener('click',()=>setDrawer(!actionCenter?.classList.contains('itws-open')));
    backdrop.addEventListener('click',()=>{closeDrawer();closeSide()});
    window.addEventListener('resize',()=>{
      if(actionCenter?.classList.contains('itws-open'))backdrop.classList.toggle('open',drawerIsModal());
      else backdrop.classList.remove('open');
    });

    const originalTabs=[...content.querySelectorAll('.tab[data-view]')];
    const setNav=(view)=>sidebar.querySelectorAll('[data-itws-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.itwsView===view));
    sidebar.querySelectorAll('[data-itws-view]').forEach(btn=>btn.addEventListener('click',()=>{
      const view=btn.dataset.itwsView;const tab=originalTabs.find(item=>item.dataset.view===view);if(tab)tab.click();setNav(view);closeSide();closeDrawer();
    }));

    const chatNode=()=>document.getElementById('agentChat')||document.querySelector('.chat-log')||document.querySelector('.agent-chat');
    const showEmpty=()=>{const chat=chatNode();if(!chat)return;chat.innerHTML='<div class="itws-empty"><h2>What can Sulandra IT do for you?</h2><p>Ask a question, upload a file or image, create an artifact, inspect a problem, or request an operational change.</p></div>'};
    const removeEmpty=()=>chatNode()?.querySelector('.itws-empty')?.remove();
    const sendButton=document.getElementById('agentSend')||document.getElementById('askAgentBtn');
    sendButton?.addEventListener('click',removeEmpty,true);

    const compose=document.querySelector('.agent-compose')||document.getElementById('agentForm');
    const promptInput=document.getElementById('agentPrompt');
    const returnToComposer=()=>{if(!drawerIsModal())closeDrawer()};
    if(compose){
      compose.style.pointerEvents='auto';
      compose.addEventListener('pointerdown',returnToComposer,true);
      compose.addEventListener('touchstart',returnToComposer,{capture:true,passive:true});
    }
    if(promptInput){
      promptInput.disabled=false;
      promptInput.readOnly=false;
      promptInput.style.pointerEvents='auto';
      promptInput.style.webkitUserSelect='text';
      promptInput.style.userSelect='text';
    }

    const artifactToolbar=document.querySelector('.artifact-toolbar');
    const artifactList=document.getElementById('agentArtifacts');
    if(compose&&artifactToolbar&&artifactToolbar.parentElement!==compose)compose.appendChild(artifactToolbar);
    if(compose&&artifactList&&artifactList.parentElement!==compose)compose.insertBefore(artifactList,compose.firstChild);
    const attach=document.getElementById('agentAttach');if(attach){attach.textContent='+';attach.setAttribute('aria-label','Add files and images');attach.title='Add files and images'}

    const humanTime=value=>{if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const diff=Date.now()-d.getTime();if(diff<60000)return'now';if(diff<3600000)return Math.max(1,Math.floor(diff/60000))+'m';if(diff<86400000)return Math.floor(diff/3600000)+'h';return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})};
    let conversations=[];
    const renderConversations=()=>{
      const root=document.getElementById('itwsRecents');if(!root)return;const q=String(document.getElementById('itwsSearch')?.value||'').trim().toLowerCase();const rows=conversations.filter(row=>!q||String(row.title||row.lastMessage||'').toLowerCase().includes(q));
      if(!rows.length){root.innerHTML='<div style="padding:8px 10px;color:#909197;font-size:11px">No chats yet.</div>';return}
      root.innerHTML=rows.map(row=>`<button type="button" class="itws-conversation ${String(row.id)===String(conversationId)?'active':''}" data-itws-conversation="${esc(row.id)}"><strong>${esc(row.title||'IT Agent chat')}</strong><small>${esc(row.lastMessage||humanTime(row.updatedAt)||'')}</small></button>`).join('');
      root.querySelectorAll('[data-itws-conversation]').forEach(btn=>btn.addEventListener('click',()=>loadConversation(btn.dataset.itwsConversation)));
    };
    const loadConversations=async()=>{try{const data=await api('/api/it-solutions/agent/conversations');conversations=data.conversations||[];renderConversations()}catch(error){const root=document.getElementById('itwsRecents');if(root)root.innerHTML='<div style="padding:8px 10px;color:#9a5555;font-size:11px">Unable to load chats.</div>'}};
    document.getElementById('itwsSearch')?.addEventListener('input',renderConversations);

    async function loadConversation(id){
      if(!id)return;try{
        const data=await api('/api/it-solutions/agent/conversations/'+encodeURIComponent(id)+'/messages');
        conversationId=id;sessionStorage.setItem('sulandra:it-agent:conversation',id);selectedArtifactIds=[];
        const chat=chatNode();if(chat)chat.innerHTML='';
        (data.messages||[]).forEach(message=>bubble(message.role==='user'?'user':'agent',message.content||''));
        await loadArtifacts();renderConversations();setNav('agent');originalTabs.find(item=>item.dataset.view==='agent')?.click();closeSide();closeDrawer();
      }catch(error){showToast(error.message||'Unable to open this chat')}
    }
    window.__sulandraITLoadConversation=loadConversation;

    document.getElementById('itwsNewChat')?.addEventListener('click',()=>{
      conversationId='';sessionStorage.removeItem('sulandra:it-agent:conversation');selectedArtifactIds=[];artifactRows=[];try{renderArtifacts()}catch{}showEmpty();renderConversations();closeDrawer();document.getElementById('agentPrompt')?.focus();setNav('agent');originalTabs.find(item=>item.dataset.view==='agent')?.click();closeSide();
    });

    function showToast(message){if(!message)return;toast.textContent=String(message);toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2400)}
    const status=document.getElementById('artifactUploadStatus');if(status){new MutationObserver(()=>{const text=status.textContent?.trim();if(text)showToast(text)}).observe(status,{childList:true,subtree:true,characterData:true})}

    const previewUrls=new Map();
    const iconFor=name=>{const ext=String(name||'').split('.').pop()?.toUpperCase()||'FILE';if(ext==='PDF')return'PDF';if(['DOC','DOCX'].includes(ext))return'DOC';if(['XLS','XLSX','CSV'].includes(ext))return'XLS';if(['PPT','PPTX'].includes(ext))return'PPT';return'FILE'};
    const enhanceArtifacts=()=>{
      document.querySelectorAll('#agentArtifacts .artifact-row').forEach(row=>{
        const id=row.dataset.artifact||row.querySelector('[data-select-artifact]')?.dataset.selectArtifact;if(!id||row.dataset.itwsEnhanced==='1')return;row.dataset.itwsEnhanced='1';
        const strong=row.querySelector('strong');const name=strong?.textContent?.trim()||'Attachment';const thumb=document.createElement('span');thumb.className='itws-thumb';thumb.textContent=iconFor(name);row.insertBefore(thumb,strong||row.firstChild);
        const meta=document.createElement('span');meta.className='itws-file-meta';meta.textContent=name.split('.').pop()?.toUpperCase()||'FILE';row.appendChild(meta);
        const select=row.querySelector('[data-select-artifact]');if(select){const attached=row.classList.contains('selected');select.textContent=attached?'×':'+';select.title=attached?'Remove from this message':'Attach to this message';select.setAttribute('aria-label',select.title)}
        const opener=row.querySelector('[data-open-artifact]');thumb.addEventListener('click',event=>{event.stopPropagation();opener?.click()});
        if(/\.(png|jpe?g|webp|gif)$/i.test(name)&&typeof fetchArtifactBlob==='function')fetchArtifactBlob(id,false).then(({blob})=>{if(!row.isConnected)return;const old=previewUrls.get(id);if(old)URL.revokeObjectURL(old);const url=URL.createObjectURL(blob);previewUrls.set(id,url);thumb.textContent='';const img=document.createElement('img');img.src=url;img.alt=name;thumb.appendChild(img)}).catch(()=>{});
      });
    };
    if(artifactList){new MutationObserver(enhanceArtifacts).observe(artifactList,{childList:true,subtree:true});enhanceArtifacts()}

    const previousFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){const url=typeof input==='string'?input:String(input?.url||'');const response=await previousFetch(input,init);if(url.includes('/api/it-solutions/agent/chat')&&response.ok)setTimeout(loadConversations,350);return response};

    loadConversations();
    if(conversationId)loadConversation(conversationId);else showEmpty();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
