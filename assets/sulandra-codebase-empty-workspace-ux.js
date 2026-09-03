/* SULANDRA_CODEBASE_EMPTY_WORKSPACE_UX_V1
 * Codebase interaction hardening:
 * - Preview / IDE open as empty in-place cards when no terminal session exists.
 * - No blocking alert() is used, preserving browser fullscreen on mobile/tablet.
 * - The top-level Codebase Terminal control creates a real isolated terminal session
 *   through the existing terminal runtime and then surfaces that real session tab.
 */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_EMPTY_WORKSPACE_UX_V1__)return;
window.__SULANDRA_CODEBASE_EMPTY_WORKSPACE_UX_V1__=true;

const sleep=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
const terminalIds=()=>[...document.querySelectorAll('#itwsRtTabs [data-terminal-id]')].map(node=>node.dataset.terminalId).filter(Boolean);
const activeSessionId=()=>document.querySelector('#itwsRtTabs [data-terminal-id].active')?.dataset?.terminalId||terminalIds()[0]||'';
const waitFor=async(test,{timeout=7000,step=80}={})=>{const started=Date.now();while(Date.now()-started<timeout){const value=test();if(value)return value;await sleep(step)}return null};
const setCodebaseStatus=(text,tone='')=>{const node=document.getElementById('scbStatus');if(node){node.textContent=text;node.dataset.tone=tone}};

function prepareEmptyWorkspace(kind){
 const api=window.SulandraDockableWorkspace;
 const panel=api?.getPanel?.(kind);
 if(!panel)return null;
 api.show?.(kind);
 panel.hidden=false;
 panel.classList.add('itws-dock-visible');
 const frame=panel.querySelector('.itws-workspace-frame');
 const loading=panel.querySelector('.itws-workspace-loading');
 const meta=panel.querySelector('.itws-dock-panel-meta');
 if(frame){
   frame.removeAttribute('src');
   frame.removeAttribute('srcdoc');
   delete frame.dataset.sessionId;
   delete frame.dataset.port;
 }
 if(meta)meta.textContent='';
 if(loading){
   loading.hidden=false;
   loading.textContent='';
   loading.setAttribute('aria-label',kind==='preview'?'Preview is empty':'IDE is empty');
 }
 window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'));
 return panel;
}

function installWorkspaceWrappers(){
 const api=window.SulandraDockableWorkspace;
 if(!api||api.__scbEmptyWorkspaceUxV1)return false;
 const originalPreview=typeof api.openPreview==='function'?api.openPreview.bind(api):null;
 const originalIde=typeof api.openIde==='function'?api.openIde.bind(api):null;
 api.openPreview=port=>{
   if(!activeSessionId())return Promise.resolve(prepareEmptyWorkspace('preview'));
   return originalPreview?Promise.resolve(originalPreview(port)):Promise.resolve(null);
 };
 api.openIde=()=>{
   if(!activeSessionId())return Promise.resolve(prepareEmptyWorkspace('ide'));
   return originalIde?Promise.resolve(originalIde()):Promise.resolve(null);
 };
 api.__scbEmptyWorkspaceUxV1=true;
 const legacy=window.SulandraWorkspacePreview;
 if(legacy){
   legacy.openPreview=port=>api.openPreview(port);
   legacy.openIde=()=>api.openIde();
 }
 return true;
}

let terminalStartPromise=null;
async function createRealTerminal(){
 if(terminalStartPromise)return terminalStartPromise;
 const pending=(async()=>{
   window.SulandraDockableWorkspace?.show?.('terminal');
   const before=terminalIds();
   setCodebaseStatus('Starting isolated terminal…','');
   const add=await waitFor(()=>document.getElementById('itwsRtNewTab'),{timeout:6000,step:80});
   if(add){
     add.click();
     const created=await waitFor(()=>{
       const ids=terminalIds();
       return ids.length>before.length?ids.find(id=>!before.includes(id))||ids.at(-1):null;
     },{timeout:7000,step:100});
     if(created){
       document.querySelector(`#itwsRtTabs [data-terminal-id="${CSS.escape(created)}"]`)?.click();
       window.SulandraCodebaseNativeGrid?.render?.();
       setCodebaseStatus(`Terminal ${Math.max(1,terminalIds().indexOf(created)+1)} connected`,'ok');
       return created;
     }
   }
   try{await Promise.resolve(window.SulandraCodebase?.openTerminal?.({layout:1}))}catch{}
   const recovered=await waitFor(()=>{
     const ids=terminalIds();
     return ids.length>before.length?ids.find(id=>!before.includes(id))||ids.at(-1):null;
   },{timeout:5000,step:100});
   if(recovered){
     document.querySelector(`#itwsRtTabs [data-terminal-id="${CSS.escape(recovered)}"]`)?.click();
     window.SulandraCodebaseNativeGrid?.render?.();
     setCodebaseStatus(`Terminal ${Math.max(1,terminalIds().indexOf(recovered)+1)} connected`,'ok');
     return recovered;
   }
   setCodebaseStatus('Terminal session could not start. The isolated terminal worker did not return a session.','bad');
   return '';
 })();
 terminalStartPromise=pending;
 try{return await pending}finally{if(terminalStartPromise===pending)terminalStartPromise=null}
}

function onDocumentClick(event){
 const target=event.target instanceof Element?event.target.closest('#scbOpenTerminal'):null;
 if(!target)return;
 const shell=document.getElementById('sulandraCodebase');
 if(!shell||shell.hidden)return;
 event.preventDefault();
 event.stopPropagation();
 event.stopImmediatePropagation();
 void createRealTerminal();
}

document.addEventListener('click',onDocumentClick,true);
const install=()=>{
 if(!installWorkspaceWrappers()){
   const observer=new MutationObserver(()=>{if(installWorkspaceWrappers())observer.disconnect()});
   observer.observe(document.documentElement,{childList:true,subtree:true});
   window.setTimeout(()=>observer.disconnect(),30000);
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

window.SulandraCodebaseSessionUx={createTerminal:createRealTerminal,openEmpty:prepareEmptyWorkspace};
})();
