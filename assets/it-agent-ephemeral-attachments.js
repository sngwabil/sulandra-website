/* Sulandra IT Agent temporary chat attachments.
   User-selected/pasted files remain in browser memory until the chat request is sent.
   They are not posted to /artifacts/upload and are not written to Railway object storage. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_EPHEMERAL_ATTACHMENTS__)return;
  window.__SULANDRA_IT_EPHEMERAL_ATTACHMENTS__=true;

  const state={files:[],objectUrls:new Map(),maxFiles:8,maxEach:15*1024*1024};
  const imageExt={
    'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif',
    'image/heic':'heic','image/heif':'heif'
  };
  const humanBytes=value=>{const n=Number(value||0);return n>=1048576?`${(n/1048576).toFixed(1)} MB`:n>=1024?`${Math.round(n/1024)} KB`:`${n} B`};
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
  const keyFor=file=>`${file.name}:${file.size}:${file.lastModified}:${file.type}`;
  const note=message=>{
    const node=document.getElementById('itwsEphemeralNote');
    if(node)node.textContent=message||'';
  };

  function normalizedFile(file){
    if(!(file instanceof File))return null;
    let name=String(file.name||'').trim();
    if(!name||!name.includes('.')){
      const ext=imageExt[String(file.type||'').toLowerCase()]||'bin';
      name=`pasted-image-${Date.now()}.${ext}`;
      try{return new File([file],name,{type:file.type||'application/octet-stream',lastModified:Date.now()})}catch{return file}
    }
    return file;
  }

  function clearFiles(){
    for(const url of state.objectUrls.values())try{URL.revokeObjectURL(url)}catch{}
    state.objectUrls.clear();
    state.files=[];
    render();
  }

  function removeFile(index){
    const file=state.files[index];
    if(!file)return;
    const key=keyFor(file),url=state.objectUrls.get(key);
    if(url)try{URL.revokeObjectURL(url)}catch{}
    state.objectUrls.delete(key);
    state.files.splice(index,1);
    render();
  }

  function render(){
    const strip=document.getElementById('itwsPendingAttachments');
    if(!strip)return;
    strip.innerHTML='';
    state.files.forEach((file,index)=>{
      const card=document.createElement('div');card.className='itws-ephemeral-card';
      const thumb=document.createElement('div');thumb.className='itws-ephemeral-thumb';
      if(String(file.type||'').startsWith('image/')){
        const key=keyFor(file);let url=state.objectUrls.get(key);
        if(!url){url=URL.createObjectURL(file);state.objectUrls.set(key,url)}
        const img=document.createElement('img');img.src=url;img.alt='';thumb.appendChild(img);
      }else thumb.textContent=(String(file.name||'FILE').split('.').pop()||'FILE').slice(0,4).toUpperCase();
      const name=document.createElement('strong');name.className='itws-ephemeral-name';name.textContent=file.name;
      const meta=document.createElement('span');meta.className='itws-ephemeral-meta';meta.textContent=humanBytes(file.size);
      const remove=document.createElement('button');remove.type='button';remove.className='itws-ephemeral-remove';remove.setAttribute('aria-label',`Remove ${file.name}`);remove.textContent='×';
      remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();removeFile(index)});
      card.append(thumb,name,meta,remove);strip.appendChild(card);
    });
    note(state.files.length?`${state.files.length} temporary attachment${state.files.length===1?'':'s'} — sent for this message only.`:'');
  }

  function addFiles(files){
    const candidates=Array.from(files||[]).map(normalizedFile).filter(Boolean);
    if(!candidates.length)return;
    const known=new Set(state.files.map(keyFor));
    for(const file of candidates){
      if(state.files.length>=state.maxFiles){note(`Up to ${state.maxFiles} temporary attachments can be sent at once.`);break}
      if(file.size>state.maxEach){note(`${file.name} is larger than the 15 MB temporary attachment limit.`);continue}
      const key=keyFor(file);if(known.has(key))continue;
      known.add(key);state.files.push(file);
    }
    render();
  }

  function fileBase64(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||'').split(',').pop()||'');
      reader.onerror=()=>reject(reader.error||new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function payloads(){
    return Promise.all(state.files.map(async file=>({
      fileName:file.name,
      mimeType:file.type||'application/octet-stream',
      fileDataBase64:await fileBase64(file),
    })));
  }

  function installComposer(){
    const form=document.getElementById('agentForm')||document.querySelector('.agent-compose');
    const prompt=document.getElementById('agentPrompt');
    const originalInput=document.getElementById('agentFileInput');
    const originalAttach=document.getElementById('agentAttach');
    if(!form||!prompt||!originalInput||!originalAttach)return false;

    if(!document.getElementById('itwsPendingAttachments')){
      const strip=document.createElement('div');strip.id='itwsPendingAttachments';strip.setAttribute('aria-live','polite');
      form.insertBefore(strip,form.firstChild);
    }
    if(!document.getElementById('itwsEphemeralNote')){
      const status=document.createElement('span');status.id='itwsEphemeralNote';status.className='itws-ephemeral-note';status.setAttribute('aria-live','polite');form.appendChild(status);
    }

    // Replace the old upload controls to remove their immediate-backend-upload listeners.
    const input=originalInput.cloneNode(false);input.value='';
    input.accept='image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.csv,.md,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
    originalInput.replaceWith(input);
    const attach=originalAttach.cloneNode(true);originalAttach.replaceWith(attach);
    attach.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();input.click()},true);
    input.addEventListener('change',event=>{event.stopImmediatePropagation();addFiles(input.files);input.value=''},true);

    prompt.addEventListener('paste',event=>{
      const items=Array.from(event.clipboardData?.items||[]);
      const files=items.filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
      if(files.length){event.preventDefault();event.stopImmediatePropagation();addFiles(files)}
    },true);

    document.getElementById('itwsNewChat')?.addEventListener('click',clearFiles,true);
    render();
    return true;
  }

  // Keep prior persisted uploads out of the composer. Generated artifacts remain available.
  const previousFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||input||'');
    const method=String(init?.method||((typeof Request!=='undefined'&&input instanceof Request)?input.method:'GET')||'GET').toUpperCase();

    if(url.includes('/api/it-solutions/agent/chat')&&method==='POST'&&state.files.length){
      try{
        const body=JSON.parse(String(init?.body||'{}'));
        body.attachments=await payloads();
        const response=await previousFetch(input,{...(init||{}),headers:{...(init?.headers||{}),'Content-Type':'application/json'},body:JSON.stringify(body)});
        if(response.ok)clearFiles();
        return response;
      }catch(error){note(error instanceof Error?error.message:'Unable to prepare temporary attachments.');throw error}
    }

    const response=await previousFetch(input,init);
    if(url.includes('/api/it-solutions/agent/artifacts')&&method==='GET'&&!url.includes('/content')){
      try{
        const copy=response.clone();const payload=await copy.json();
        if(Array.isArray(payload?.data?.artifacts)){
          payload.data.artifacts=payload.data.artifacts.filter(artifact=>String(artifact?.sourceType||'').toUpperCase()!=='UPLOAD');
          return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:new Headers(response.headers)});
        }
      }catch{}
    }
    return response;
  };

  const start=()=>{
    if(installComposer())return;
    let attempts=0;const timer=setInterval(()=>{attempts+=1;if(installComposer()||attempts>80)clearInterval(timer)},100);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
