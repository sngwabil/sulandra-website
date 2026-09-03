/* SULANDRA_CODEBASE_BACKEND_ADAPTER_V1 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_BACKEND_ADAPTER_V1__)return;
window.__SULANDRA_CODEBASE_BACKEND_ADAPTER_V1__=true;

const sessionToken=()=>
  document.getElementById('cfg-token')?.value?.trim()||
  sessionStorage.getItem('sulandra:admin:access-token')||
  localStorage.getItem('sulandra:admin:access-token')||
  sessionStorage.getItem('sulandra:employee:access-token')||
  localStorage.getItem('sulandra:employee:access-token')||
  localStorage.getItem('token')||'';

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

window.initXterm=(containerId,tabId)=>{
  if(activeTerminals[tabId])return;
  const container=document.getElementById(containerId);
  if(!container)return;
  const term=new Terminal({theme:{background:'#000000',foreground:'#ffffff'},fontFamily:'"Menlo", monospace',fontSize:13,cursorBlink:true,scrollback:10000});
  const fitAddon=new FitAddon.FitAddon();
  term.loadAddon(fitAddon);term.open(container);fitAddon.fit();
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
  let lastSize='';
  const fit=()=>{
    try{fitAddon.fit()}catch{}
    const size=term.cols+'x'+term.rows;
    if(size!==lastSize&&ws.readyState===WebSocket.OPEN){lastSize=size;ws.send(JSON.stringify({type:'resize',cols:term.cols,rows:term.rows}))}
  };
  const observer=new ResizeObserver(fit);observer.observe(container);term.__sulandraResizeObserver=observer;
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

const wire=()=>{
  wireSia();
  const iframe=document.getElementById('railway-preview-iframe');if(iframe&&!iframe.src)iframe.src=RAILWAY_CONFIG.PREVIEW_URL;
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
