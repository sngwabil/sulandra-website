/* IT_AGENT_UI_REGRESSION_REPAIR_V2
   Browser-only repairs for the Administrator IT Agent presentation.
   Status Board and Action Center are intentionally separate surfaces. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_UI_REGRESSION_REPAIR__)return;
  window.__SULANDRA_IT_UI_REGRESSION_REPAIR__=true;

  const qs=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const qsa=(selector,root=document)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const chat=()=>document.getElementById('agentChat')||qs('.chat-log')||qs('.agent-chat');
  const composer=()=>document.getElementById('agentForm')||qs('.agent-compose');
  const prompt=()=>document.getElementById('agentPrompt');
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

  let fallback=null;
  let fallbackTimer=null;
  let pendingImageCard=null;
  let pendingImageTimer=null;
  const renderedArtifacts=new Set();

  function syncConversationState(){
    const root=chat();
    if(!root)return;
    const hasUser=Boolean(qs('.bubble.user,.chat-bubble.user',root));
    const realMessages=qsa('.bubble,.chat-bubble',root).filter(node=>!node.closest('.itws-empty')).length;
    document.body.classList.toggle('itws-has-conversation',hasUser||realMessages>1);
  }

  function syncComposerClearance(){
    const form=composer();
    const root=chat();
    if(!form||!root)return;
    const height=Math.ceil(form.getBoundingClientRect().height||0);
    const clearance=Math.max(150,Math.min(430,height+58));
    document.body.style.setProperty('--itws-composer-clearance',`${clearance}px`);
    const vv=window.visualViewport;
    let keyboardInset=0;
    if(vv&&vv.height<window.innerHeight*.82)keyboardInset=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
    document.body.style.setProperty('--itws-keyboard-inset',`${keyboardInset}px`);
  }

  function removeFallback(){
    if(fallbackTimer){clearInterval(fallbackTimer);fallbackTimer=null}
    fallback?.remove();fallback=null;
  }

  function startFallback(){
    removeFallback();
    window.setTimeout(()=>{
      const root=chat();
      if(!root||qs('.sulandra-live-activity:not(.finished)',root))return;
      const node=document.createElement('div');
      node.className='itws-progress-fallback';
      node.setAttribute('role','status');
      node.setAttribute('aria-live','polite');
      node.innerHTML='<div class="itws-progress-fallback-card"><span class="itws-progress-spinner"></span><span><strong>Sulandra IT Agent is working</strong><br><small>Processing this request…</small></span></div>';
      root.appendChild(node);fallback=node;
      const started=Date.now();
      fallbackTimer=setInterval(()=>{
        if(!fallback?.isConnected)return removeFallback();
        if(qs('.sulandra-live-activity:not(.finished)',root))return removeFallback();
        const seconds=Math.floor((Date.now()-started)/1000);
        const small=qs('small',fallback);
        if(small)small.textContent=seconds>=20?`Still working · ${seconds}s`:seconds>=7?`Working through the request · ${seconds}s`:`Processing this request · ${seconds}s`;
      },1000);
      root.scrollTop=root.scrollHeight;
    },120);
  }

  function imageIntent(text){
    const value=clean(text).toLowerCase();
    return /\b(generate|create|make|design|render)\b.{0,70}\b(image|graphic|poster|illustration|picture|meme|landscape|portrait)\b/.test(value)||/\b(image|graphic|poster|illustration|picture|meme)\b.{0,50}\b(generate|create|make|design|render)\b/.test(value);
  }

  function removePendingImage(){
    if(pendingImageTimer){clearTimeout(pendingImageTimer);pendingImageTimer=null}
    pendingImageCard?.remove();pendingImageCard=null;
  }

  function startPendingImage(){
    removePendingImage();
    window.setTimeout(()=>{
      const root=chat();if(!root)return;
      const card=document.createElement('div');
      card.className='itws-inline-artifact itws-inline-artifact-pending';
      card.dataset.itwsPendingGeneratedImage='1';
      card.innerHTML='<span class="itws-progress-spinner"></span><span><strong>Generating image</strong><br><small>The preview will replace this card when the image is ready.</small></span>';
      root.appendChild(card);pendingImageCard=card;root.scrollTop=root.scrollHeight;
      pendingImageTimer=setTimeout(()=>{
        if(pendingImageCard?.isConnected){const small=qs('small',pendingImageCard);if(small)small.textContent='Image generation is taking longer than expected. The request is still being checked.'}
      },45000);
    },160);
  }

  function artifactKind(row){
    const text=clean(row?.textContent).toUpperCase();
    if(text.includes('GENERATED_IMAGE'))return'image';
    if(text.includes('GENERATED_PDF'))return'pdf';
    return'';
  }
  const artifactId=row=>row?.dataset?.artifact||qs('[data-select-artifact]',row)?.dataset?.selectArtifact||'';
  const artifactName=row=>clean(qs('strong',row)?.textContent)||'Generated artifact';

  async function inlineArtifact(row){
    const id=artifactId(row),kind=artifactKind(row);if(!id||!kind||renderedArtifacts.has(id))return;
    renderedArtifacts.add(id);
    const root=chat();if(!root)return;
    const name=artifactName(row);
    const card=document.createElement('div');card.className='itws-inline-artifact';card.dataset.itwsArtifact=id;
    const meta=document.createElement('div');meta.className='itws-inline-artifact-meta';
    const label=document.createElement('strong');label.textContent=name;meta.appendChild(label);
    const open=document.createElement('button');open.type='button';open.textContent='Open';open.onclick=()=>qs('[data-open-artifact]',row)?.click();meta.appendChild(open);
    if(kind==='image'){
      const loading=document.createElement('div');loading.className='itws-inline-artifact-pending';loading.innerHTML='<span class="itws-progress-spinner"></span><span>Loading generated image…</span>';card.append(loading,meta);
    }else{
      const body=document.createElement('div');body.className='itws-inline-artifact-pending';body.innerHTML='<span style="font-size:24px">PDF</span><span>Generated document ready</span>';card.append(body,meta);
      const download=document.createElement('button');download.type='button';download.textContent='Download';download.onclick=()=>qs('[data-download-artifact]',row)?.click();meta.appendChild(download);
    }
    if(kind==='image'&&pendingImageCard?.isConnected){pendingImageCard.replaceWith(card);pendingImageCard=null;if(pendingImageTimer){clearTimeout(pendingImageTimer);pendingImageTimer=null}}
    else root.appendChild(card);
    root.scrollTop=root.scrollHeight;

    if(kind==='image'&&typeof fetchArtifactBlob==='function'){
      try{
        const result=await fetchArtifactBlob(id,false);if(!card.isConnected)return;
        const url=URL.createObjectURL(result.blob);const img=document.createElement('img');img.src=url;img.alt=name;img.onload=()=>setTimeout(()=>URL.revokeObjectURL(url),60000);qs('.itws-inline-artifact-pending',card)?.replaceWith(img);
      }catch{const loading=qs('.itws-inline-artifact-pending',card);if(loading)loading.textContent='Generated image is ready. Use Open to view it.'}
    }
  }

  function renderGeneratedArtifacts(){
    const store=document.getElementById('agentArtifacts');if(!store)return;
    qsa('.artifact-row',store).forEach(row=>void inlineArtifact(row));
  }

  function installObservers(){
    const root=chat();const form=composer();const store=document.getElementById('agentArtifacts');
    if(root){
      new MutationObserver(records=>{
        syncConversationState();
        const added=records.flatMap(record=>Array.from(record.addedNodes||[])).filter(node=>node instanceof HTMLElement);
        if(added.some(node=>node.matches?.('.sulandra-live-activity')||qs('.sulandra-live-activity',node)))removeFallback();
        const agentReply=added.find(node=>node.matches?.('.bubble.agent,.chat-bubble.agent,.chat-bubble.assistant')||qs('.bubble.agent,.chat-bubble.agent,.chat-bubble.assistant',node));
        if(agentReply){removeFallback();const text=clean(agentReply.textContent);if(/^IT Agent error:/i.test(text))removePendingImage()}
      }).observe(root,{childList:true,subtree:true});
    }
    if(store){new MutationObserver(renderGeneratedArtifacts).observe(store,{childList:true,subtree:true,characterData:true});renderGeneratedArtifacts()}
    if(form&&typeof ResizeObserver!=='undefined')new ResizeObserver(syncComposerClearance).observe(form);
    window.addEventListener('resize',syncComposerClearance,{passive:true});
    window.visualViewport?.addEventListener('resize',syncComposerClearance,{passive:true});
    window.visualViewport?.addEventListener('scroll',syncComposerClearance,{passive:true});
  }

  function installSendGuard(){
    const send=document.getElementById('agentSend')||document.getElementById('askAgentBtn');if(!send)return;
    send.addEventListener('click',()=>{
      const text=prompt()?.value||'';if(!clean(text))return;
      document.body.classList.add('itws-has-conversation');
      startFallback();if(imageIntent(text))startPendingImage();setTimeout(syncComposerClearance,40);
    },true);
  }

  function installPolicyStudioLauncher(){
    if(document.getElementById('itwsPolicyStudio'))return;
    const host=qs('.examples')||qs('.agent-head')||qs('header');
    if(!host)return;
    const link=document.createElement('a');
    link.id='itwsPolicyStudio';
    link.href='/policy-studio.html';
    link.className=host.classList?.contains('examples')?'example':'btn secondary';
    link.textContent='Policy Studio · templates & publishing';
    link.title='Create enterprise or company-specific Sulandra policy drafts from governed templates';
    link.style.textDecoration='none';
    host.appendChild(link);
  }

  function start(){
    document.body.classList.add('itws-regression-repair');
    syncConversationState();syncComposerClearance();installSendGuard();installObservers();installPolicyStudioLauncher();
    document.getElementById('itwsNewChat')?.addEventListener('click',()=>{removeFallback();removePendingImage();renderedArtifacts.clear();document.body.classList.remove('itws-has-conversation');setTimeout(syncComposerClearance,30)},true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();