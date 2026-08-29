/* Final chat-first behavior polish for Sulandra IT Agent. */
(()=>{
  if(window.__SULANDRA_IT_CHATGPT_POLISH__)return;
  window.__SULANDRA_IT_CHATGPT_POLISH__=true;

  const init=()=>{
    if(!document.body.classList.contains('it-chatgpt-workspace'))return;

    const drawer=document.querySelector('#agent .agent-shell>aside')||document.querySelector('.itws-action-drawer');
    if(drawer){
      drawer.classList.add('itws-action-drawer');
      if(drawer.parentElement!==document.body)document.body.appendChild(drawer);
      if(!drawer.querySelector('.itws-drawer-close')){
        const close=document.createElement('button');
        close.type='button';
        close.className='itws-drawer-close';
        close.setAttribute('aria-label','Close activity');
        close.title='Close activity';
        close.textContent='×';
        close.addEventListener('click',()=>{
          drawer.classList.remove('itws-open');
          document.querySelector('.itws-drawer-backdrop')?.classList.remove('open');
        });
        drawer.prepend(close);
      }
    }

    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      drawer?.classList.remove('itws-open');
      document.querySelector('.itws-drawer-backdrop')?.classList.remove('open');
      document.querySelector('.itws-sidebar')?.classList.remove('open');
    });

    /* Existing artifact storage remains durable, but the composer should show only files
       selected for the current outgoing turn. Clear that current-turn selection once the
       chat request succeeds, matching normal chat attachment behavior. */
    const previousFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:String(input?.url||'');
      const response=await previousFetch(input,init);
      if(url.includes('/api/it-solutions/agent/chat')&&response.ok){
        setTimeout(()=>{
          try{
            if(typeof selectedArtifactIds!=='undefined')selectedArtifactIds=[];
            if(typeof renderArtifacts==='function')renderArtifacts();
          }catch{}
        },0);
      }
      return response;
    };

    /* Re-label selected attachment controls as remove buttons even after legacy renderer
       refreshes, so uploaded previews never look like they still need to be attached. */
    const normalizeAttachmentControls=()=>{
      document.querySelectorAll('#agentArtifacts .artifact-row').forEach(row=>{
        const control=row.querySelector('[data-select-artifact]');
        if(!control)return;
        const selected=row.classList.contains('selected');
        control.textContent=selected?'×':'+';
        control.setAttribute('aria-label',selected?'Remove from this message':'Attach to this message');
        control.title=control.getAttribute('aria-label')||'';
      });
    };
    const list=document.getElementById('agentArtifacts');
    if(list){new MutationObserver(normalizeAttachmentControls).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});normalizeAttachmentControls()}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});
  else setTimeout(init,0);
})();
