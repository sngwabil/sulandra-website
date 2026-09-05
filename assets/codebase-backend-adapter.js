/* SULANDRA_CODEBASE_BACKEND_ADAPTER_V2
 * SULANDRA_CODEBASE_STANDALONE_CONTROLS_V1
 * CODEBASE_VISIBLE_REGRESSIONS_V1
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_BACKEND_ADAPTER_V2__)return;
window.__SULANDRA_CODEBASE_BACKEND_ADAPTER_V2__=true;

const sameOriginOpener=()=>{
  try{
    if(window.opener&&!window.opener.closed&&window.opener.location.origin===window.location.origin)return window.opener;
  }catch{}
  return null;
};
const storageToken=storage=>{
  try{
    return storage?.getItem('sulandra:admin:access-token')||
      storage?.getItem('sulandra:employee:access-token')||
      storage?.getItem('token')||'';
  }catch{return ''}
};
const sessionToken=()=>
  document.getElementById('cfg-token')?.value?.trim()||
  storageToken(sessionStorage)||
  storageToken(localStorage)||
  storageToken(sameOriginOpener()?.sessionStorage)||
  storageToken(sameOriginOpener()?.localStorage)||'';

const status=text=>{const node=document.getElementById('status-line-col');if(node)node.textContent=String(text||'')};
const authHeaders=(json=false)=>{
  const headers={Accept:'application/json'};
  const token=sessionToken();
  if(token)headers.Authorization='Bearer '+token;
  if(json)headers['Content-Type']='application/json';
  return headers;
};
const api=async(path,options={})=>{
  const response=await fetch(RAILWAY_CONFIG.API_URL+path,{...options,headers:{...authHeaders(options.body!==undefined),...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error||`Codebase API request failed (${response.status})`);
  return payload;
};

RAILWAY_CONFIG.getToken=sessionToken;
window.renderFallbackFileSystem=()=>{
  const root=document.getElementById('dynamic-file-list');
  if(root)root.innerHTML='<div style="padding:16px;color:#e57373;line-height:1.5">Unable to load the real repository. Check Codebase API authentication or service health.</div>';
};

window.openFallbackFile=async()=>{
  const requested=prompt('New file path','src/new_file.js');
  if(!requested)return;
  try{
    const created=await api('/api/files',{method:'POST',body:JSON.stringify({path:requested,content:''})});
    status('CREATED: '+created.id);
    await fetchFileSystem();
  }catch(error){status('CREATE FAILED: '+error.message)}
};
window.createWorkspaceFolder=async()=>{
  const requested=prompt('New folder path','src/components');
  if(!requested)return;
  try{
    const created=await api('/api/folders',{method:'POST',body:JSON.stringify({path:requested})});
    status('CREATED FOLDER: '+created.id);
    await fetchFileSystem();
  }catch(error){status('CREATE FOLDER FAILED: '+error.message)}
};

window.saveActiveFile=async()=>{
  const activeTab=openTabs[0];
  if(!activeTab||activeTab.type!=='code'){status('No active code file to save.');return}
  const editor=activeEditors[activeTab.id];
  if(!editor)return;
  const content=editor.getValue();
  try{
    saveVersion(activeTab.id,content);
    await api('/api/files/'+activeTab.id,{method:'PUT',body:JSON.stringify({content})});
    activeTab.content=content;
    status('SAVED: '+activeTab.name);
  }catch(error){status('SAVE FAILED: '+error.message)}
};

window.commitToGitHub=async()=>{
  const input=document.getElementById('commit-msg-input');
  const message=(input?.value||prompt('Enter commit message:')||'').trim();
  if(!message){status('Commit message required.');return}
  status('PUSHING commit to GitHub...');
  try{
    const result=await api('/api/commit',{method:'POST',body:JSON.stringify({message})});
    status(result.pushed?`COMMIT ${String(result.commit||'').slice(0,8)} pushed to ${result.branch}`:result.message||'No changes to commit');
    if(input)input.value='';
  }catch(error){status('COMMIT FAILED: '+error.message)}
};

let lastPreviewSessionId='';
window.updatePreviewPort=async()=>{
  const port=Number(document.getElementById('preview-port')?.value||3000);
  const iframe=document.getElementById('railway-preview-iframe');
  const terminalTab=openTabs.find(tab=>tab.type==='terminal'&&tab.sessionId);
  const sessionId=terminalTab?.sessionId||lastPreviewSessionId;
  if(!iframe)return;
  if(!sessionId){iframe.src=RAILWAY_CONFIG.PREVIEW_URL;status('PREVIEW ready — start a terminal session first.');return}
  try{
    const response=await fetch(RAILWAY_CONFIG.PREVIEW_URL+'/api/preview-ticket',{
      method:'POST',headers:authHeaders(true),body:JSON.stringify({sessionId,port})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.url)throw new Error(payload.error||`Preview gateway returned ${response.status}`);
    iframe.src=payload.url;
    status(`PREVIEW routing terminal ${sessionId.slice(0,10)}… port ${port}`);
  }catch(error){iframe.src=RAILWAY_CONFIG.PREVIEW_URL;status('PREVIEW FAILED: '+error.message)}
};

const resizeTerminal=(term,container)=>{
  if(!term||!container)return;
  try{term.__sulandraFitAddon?.fit()}catch{}
  const ws=term.__sulandraWs;
  const size=term.cols+'x'+term.rows;
  if(size!==term.__sulandraLastSize&&ws?.readyState===WebSocket.OPEN){
    term.__sulandraLastSize=size;
    try{ws.send(JSON.stringify({type:'resize',cols:term.cols,rows:term.rows}))}catch{}
  }
};
const reattachTerminal=(term,container)=>{
  if(!term||!container)return;
  try{
    if(term.element&&term.element.parentElement!==container)container.replaceChildren(term.element);
    term.__sulandraResizeObserver?.disconnect?.();
    const observer=new ResizeObserver(()=>resizeTerminal(term,container));
    observer.observe(container);
    term.__sulandraResizeObserver=observer;
    requestAnimationFrame(()=>resizeTerminal(term,container));
  }catch{}
};

window.initXterm=(containerId,tabId)=>{
  const container=document.getElementById(containerId);
  if(!container)return;
  const existing=activeTerminals[tabId];
  if(existing){reattachTerminal(existing,container);return}
  if(typeof Terminal!=='function'||!window.FitAddon?.FitAddon){
    status('TERMINAL runtime unavailable. Refresh Codebase and try again.');
    container.textContent='Terminal runtime unavailable.';
    return;
  }
  const term=new Terminal({theme:{background:'#000000',foreground:'#ffffff'},fontFamily:'"Menlo", monospace',fontSize:13,cursorBlink:true,scrollback:10000});
  const fitAddon=new FitAddon.FitAddon();
  term.loadAddon(fitAddon);term.open(container);fitAddon.fit();
  term.__sulandraFitAddon=fitAddon;
  activeTerminals[tabId]=term;
  const token=sessionToken();
  if(!token){term.writeln('\x1b[31mSulandra authentication is required before a terminal can start.\x1b[0m');return}
  const ws=new WebSocket(`${RAILWAY_CONFIG.WSS_URL}/pty?token=${encodeURIComponent(token)}&cols=${term.cols}&rows=${term.rows}`);
  ws.binaryType='arraybuffer';
  term.__sulandraWs=ws;
  ws.onopen=()=>status('TERMINAL connecting to isolated Codebase workspace...');
  ws.onmessage=event=>{
    if(typeof event.data==='string'&&event.data.startsWith('{')){
      try{
        const control=JSON.parse(event.data);
        if(control?.type==='session'&&control.sessionId){
          const tab=openTabs.find(item=>item.id===tabId);
          if(tab){tab.sessionId=control.sessionId;tab.workspaceId=control.workspaceId||''}
          lastPreviewSessionId=control.sessionId;
          window.__SULANDRA_CODEBASE_PREVIEW_SESSION__=control.sessionId;
          status('TERMINAL READY: '+control.sessionId.slice(0,12)+'…');
          setTimeout(()=>{void window.updatePreviewPort?.()},0);
          return;
        }
      }catch{}
    }
    if(event.data instanceof ArrayBuffer)term.write(new Uint8Array(event.data));
    else term.write(String(event.data||''));
  };
  ws.onerror=()=>{term.writeln('\r\n\x1b[31mTerminal connection failed. Check terminal-worker health/authentication.\x1b[0m');status('TERMINAL connection failed.')};
  ws.onclose=event=>{if(event.code!==1000)term.writeln(`\r\n\x1b[33mTerminal disconnected (${event.code}).\x1b[0m`)};
  term.onData(data=>{if(ws.readyState===WebSocket.OPEN)ws.send(data)});
  const observer=new ResizeObserver(()=>resizeTerminal(term,container));observer.observe(container);term.__sulandraResizeObserver=observer;
};

const encodeTextareaSource=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const installSafeWorkspaceRenderer=()=>{
  if(window.__SULANDRA_CODEBASE_SAFE_RENDER_V1__||typeof window.renderWorkspace!=='function')return false;
  window.__SULANDRA_CODEBASE_SAFE_RENDER_V1__=true;
  const originalRenderWorkspace=window.renderWorkspace;
  window.renderWorkspace=()=>{
    const originals=[];
    for(const tab of openTabs){
      if(tab?.type==='code'){
        originals.push([tab,tab.content]);
        tab.content=encodeTextareaSource(tab.content);
      }
    }
    try{return originalRenderWorkspace()}
    finally{for(const [tab,content] of originals)tab.content=content}
  };
  return true;
};

const originalCloseTab=window.closeTab;
window.closeTab=(index,event)=>{
  const tab=openTabs[index];
  const terminal=tab&&activeTerminals[tab.id];
  try{terminal?.__sulandraResizeObserver?.disconnect()}catch{}
  try{terminal?.__sulandraWs?.close(1000,'Terminal tab closed')}catch{}
  try{terminal?.dispose?.()}catch{}
  return originalCloseTab(index,event);
};

let dbLoaded=false;
const renderDbSchema=async()=>{
  const root=document.querySelector('#sidebar-db .mock-panel-content');
  if(!root)return;
  root.innerHTML='<div style="opacity:.65">Loading live PostgreSQL schema…</div>';
  try{
    const data=await api('/api/db/schema');
    root.innerHTML=(data.tables||[]).map(table=>`<div class="folder-group" style="margin-bottom:8px"><div class="file-item"><span style="color:#00e5ff">⛁</span> public.${escapeHtml(table.name)}</div><div style="padding-left:22px;color:var(--cb-text);font-size:10px">${(table.columns||[]).map(col=>`<div>${escapeHtml(col.name)} <span style="opacity:.6">${escapeHtml(col.dataType)}</span></div>`).join('')}</div></div>`).join('')||'<div>No public tables found.</div>';
    dbLoaded=true;
  }catch(error){root.innerHTML='<div style="color:#e57373">Database schema unavailable: '+escapeHtml(error.message)+'</div>'}
};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const originalSwitchSidebar=window.switchSidebar;
window.switchSidebar=view=>{originalSwitchSidebar(view);if(view==='db'&&!dbLoaded)void renderDbSchema()};

const wireSia=()=>{
  const root=document.getElementById('sidebar-sia');
  const textarea=root?.querySelector('textarea');
  const button=root?.querySelector('button');
  const transcript=root?.querySelector('.mock-panel-content > div');
  if(!textarea||!button||!transcript)return;
  textarea.id='codebase-sia-prompt';button.id='codebase-sia-send';
  if(button.dataset.codebaseSiaBound==='1')return;
  button.dataset.codebaseSiaBound='1';
  const send=async()=>{
    const prompt=textarea.value.trim();if(!prompt)return;
    const active=openTabs[0];
    const editor=active&&active.type==='code'?activeEditors[active.id]:null;
    const context={activeFile:active?.type==='code'?active.id:'',selection:editor?.getSelection?.()||''};
    button.disabled=true;status('SIA thinking…');
    transcript.insertAdjacentHTML('beforeend','<div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(66,165,245,.08)"><strong>You</strong><br>'+escapeHtml(prompt)+'</div>');
    textarea.value='';
    try{
      const result=await api('/api/sia/chat',{method:'POST',body:JSON.stringify({prompt,context})});
      transcript.insertAdjacentHTML('beforeend','<div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(186,104,200,.10);border:1px solid rgba(186,104,200,.25)"><strong>SIA</strong><br><span style="white-space:pre-wrap">'+escapeHtml(result.response||'')+'</span></div>');
      status('SIA response received.');
    }catch(error){transcript.insertAdjacentHTML('beforeend','<div style="margin-top:10px;color:#e57373">SIA failed: '+escapeHtml(error.message)+'</div>');status('SIA FAILED: '+error.message)}
    finally{button.disabled=false;transcript.scrollTop=transcript.scrollHeight}
  };
  button.addEventListener('click',send);
  textarea.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();void send()}});
};

const wireVisiblePanels=()=>{
  const gitNotice=document.querySelector('#sidebar-git .mock-panel-content > div');
  if(gitNotice){
    gitNotice.textContent='GitHub sync is authenticated by the Sulandra Codebase service. No separate GitHub login is required.';
    gitNotice.style.color='#81c784';
  }
  const debugButton=document.querySelector('#sidebar-debug button');
  if(debugButton&&debugButton.dataset.codebaseDebugBound!=='1'){
    debugButton.dataset.codebaseDebugBound='1';
    debugButton.textContent='▶ Open Debug Terminal';
    debugButton.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      openTerminal();
      status('DEBUG TERMINAL opened in Codebase.');
    });
  }
  const tokenInput=document.getElementById('cfg-token');
  const ideView=document.getElementById('view-ide');
  if(tokenInput&&ideView&&sessionToken()){
    const label=tokenInput.previousElementSibling;
    const saveButton=ideView.querySelector('button.btn-primary');
    if(label)label.textContent='Authentication';
    tokenInput.hidden=true;
    if(saveButton)saveButton.hidden=true;
    let secure=ideView.querySelector('#codebase-auth-status');
    if(!secure){
      secure=document.createElement('div');
      secure.id='codebase-auth-status';
      secure.style.cssText='padding:10px 12px;border:1px solid rgba(129,199,132,.35);border-radius:6px;background:rgba(129,199,132,.08);color:#a5d6a7;line-height:1.4';
      secure.textContent='Authenticated through your Sulandra session. No JWT paste is required.';
      tokenInput.after(secure);
    }
  }
};

const exitStandalone=()=>{
  const opener=sameOriginOpener();
  if(opener){
    try{opener.focus()}catch{}
    try{window.close()}catch{}
    setTimeout(()=>{if(!window.closed)window.location.replace('/it-solutions.html')},80);
    return;
  }
  window.location.assign('/it-solutions.html');
};

const callSafely=(label,fn)=>{
  try{return fn()}catch(error){status(`${label} failed: ${error?.message||error}`)}
};
const wireCoreControls=()=>{
  if(window.__SULANDRA_CODEBASE_CORE_CONTROLS_WIRED__)return;
  window.__SULANDRA_CODEBASE_CORE_CONTROLS_WIRED__=true;
  document.querySelectorAll('.header-actions span,.workspace-controls span,.grid-btn,.rp-tab,.act-icon').forEach(node=>{if(node instanceof HTMLElement||node instanceof SVGElement)node.style.cursor='pointer'});
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const control=target.closest('.header-actions span,.sidebar-toolbox .act-icon,.right-panel-tabs .rp-tab,.grid-controls .grid-btn,.file-actions span,#tab-bar .tab');
    if(!control)return;

    const header=control.closest('.header-actions');
    const sidebar=control.matches('.act-icon')?control:null;
    const rightTab=control.matches('.rp-tab')?control:null;
    const gridButton=control.matches('.grid-btn')?control:null;
    const fileAction=control.closest('.file-actions')?control:null;
    const workspaceTab=control.closest('#tab-bar .tab');

    event.preventDefault();
    event.stopImmediatePropagation();

    if(header){
      const text=String(control.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(text.includes('refresh'))return callSafely('Refresh',()=>fetchFileSystem());
      if(text.includes('ide'))return callSafely('IDE',()=>{
        window.openRightPanel?.();
        switchRightPanel('ide');
      });
      if(text.includes('terminal'))return callSafely('Terminal',()=>openTerminal());
      if(text.includes('full screen'))return callSafely('Full screen',()=>toggleFullScreen());
      if(text.includes('exit codebase'))return exitStandalone();
    }

    if(sidebar){
      const key=String(sidebar.getAttribute('title')||'').toLowerCase();
      const map={
        'explorer':'explorer','search':'search','source control':'git','run and debug':'debug',
        'extensions':'ext','database':'db','sia ai':'sia','settings':'settings'
      };
      const view=map[key];
      if(view)return callSafely('Sidebar',()=>switchSidebar(view));
    }

    if(rightTab){
      const view=String(rightTab.id||'').replace(/^tab-/,'');
      if(view)return callSafely('Right panel',()=>switchRightPanel(view));
    }

    if(gridButton){
      const buttons=[...document.querySelectorAll('.grid-controls .grid-btn')];
      const index=buttons.indexOf(gridButton);
      const modes=[1,2,'vertical','stack-2-1','stack-1-2',4];
      if(index>=0)return callSafely('Grid',()=>setGridMode(modes[index],{currentTarget:gridButton}));
    }

    if(fileAction){
      const text=String(fileAction.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(text.startsWith('edit'))return callSafely('Edit',()=>focusEditor());
      if(text.startsWith('save'))return callSafely('Save',()=>saveActiveFile());
      if(text.startsWith('commit'))return callSafely('Commit',()=>commitToGitHub());
      if(text.includes('revert'))return callSafely('Revert',()=>revertVersion());
    }

    if(workspaceTab){
      const tabs=[...document.querySelectorAll('#tab-bar .tab')];
      const index=tabs.indexOf(workspaceTab);
      if(index<0)return;
      if(target.closest('.tab-close'))return callSafely('Close tab',()=>closeTab(index,event));
      if(index>=gridMode)return callSafely('Activate tab',()=>{
        openTabs.unshift(openTabs.splice(index,1)[0]);
        renderWorkspace();
      });
    }
  },true);
};

const wire=()=>{
  const installedSafeRenderer=installSafeWorkspaceRenderer();
  wireCoreControls();
  wireSia();
  wireVisiblePanels();
  const exit=[...document.querySelectorAll('.header-actions span')].find(node=>String(node.textContent||'').includes('Exit Codebase'));
  if(exit){exit.style.cursor='pointer';exit.title='Close Codebase and return to Sulandra IT Solutions'}
  const iframe=document.getElementById('railway-preview-iframe');if(iframe&&!iframe.src)iframe.src=RAILWAY_CONFIG.PREVIEW_URL;
  if(installedSafeRenderer&&Array.isArray(openTabs)&&openTabs.length)renderWorkspace();
  status('CODEBASE ready • standalone workspace');
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
window.addEventListener('pageshow',wire);
})();
