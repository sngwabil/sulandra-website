/* SIA_GLOBAL_COPILOT_V1 */
(function(){
  'use strict';

  if (window.__SIA_GLOBAL_COPILOT_V1__) return;
  window.__SIA_GLOBAL_COPILOT_V1__ = true;
  if (window.top !== window.self) return;
  if (/\/sia\.html$/i.test(window.location.pathname)) return; // Standalone SIA is already the full assistant workspace.

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const TOKEN_KEYS = ['sulandra:admin:access-token','sulandra:employee:access-token'];
  const VERSION = '20260826-global-copilot-1';
  const state = {
    token: '', profile: null, status: null, conversationId: '', attached: null,
    busy: false, booted: false, errors: [], loadingNotice: false, uiNotice: '',
  };

  const el = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cleanText = (value, max=240) => String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi,'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]')
    .replace(/([?&](?:token|code|key|secret|password|session)=[^&#\s]+)/gi,'[REDACTED_QUERY]')
    .replace(/\s+/g,' ').trim().slice(0,max);

  function getToken(){
    for (const storage of [window.sessionStorage, window.localStorage]) {
      try {
        for (const key of TOKEN_KEYS) {
          const value = storage.getItem(key);
          if (value) return value;
        }
      } catch {}
    }
    return '';
  }

  function appForPath(pathname){
    const path = String(pathname || '').toLowerCase();
    const map = [
      ['/employee-portal.html','Employee Portal'],['/employee-login.html','Employee Sign In'],
      ['/admin-login.html','Administrator Sign In'],['/admin-operations.html','Administrator Operations'],['/admin.html','Administrator Portal'],
      ['/scheduling.html','Scheduling'],['/my-work.html','My Work'],['/employee360.html','Employee 360'],
      ['/education-portal.html','Education Portal'],['/intranet.html','Intranet Portal'],['/time-attendance.html','Time & Attendance'],
      ['/spire/client-station.html','SPIRE Client Station'],['/spire/master.html','SPIRE Clinical'],['/spire/flowsheets.html','SPIRE Flowsheets'],
      ['/spire/secure-chat.html','SPIRE Secure Chat'],['/spire.html','SPIRE'],['/notifications.html','Notifications'],
      ['/employee-directory.html','Employee Directory'],['/payroll.html','Payroll'],['/benefits.html','Benefits'],
      ['/health-safety.html','Health & Safety'],['/support.html','Support'],['/careers.html','Careers'],
    ];
    const found = map.find(([needle]) => path.endsWith(needle) || path === needle);
    if (found) return found[1];
    const title = cleanText(document.title.replace(/\s*[|–—-]\s*Sulandra.*$/i,''),120);
    return title || 'Sulandra Platform';
  }

  function safeSection(){
    const allowed = /^(Dashboard|Summary|MAR|TAR|Orders|Notes|Results|Flowsheets?|LDA|Client Station|Secure Chat|Scheduling|My Work|My Workplace|My Performance|My Documents|My Pay & Benefits|My Assets|Notifications|Employee Directory|Workforce|Onboarding|Careers|People|Compliance|Company|Operations|Education|Learning|Policies|Reports?)$/i;
    const candidates = Array.from(document.querySelectorAll('[aria-selected="true"],.tab.active,.active[data-tab],.nav-link.active,[role="tab"].active')).slice(0,20);
    for (const node of candidates) {
      if (node.closest('#sia-copilot-root')) continue;
      const text = cleanText(node.textContent,80);
      if (allowed.test(text)) return text;
    }
    return '';
  }

  function safeHref(raw){
    try {
      const url = new URL(String(raw), window.location.origin);
      if (!['http:','https:'].includes(url.protocol)) return null;
      return url.href;
    } catch { return null; }
  }

  function inlineMarkdown(text){
    const links = [];
    let source = String(text ?? '').replace(/\[([^\]\n]{1,160})\]\(([^)\s]{1,500})\)/g, (full,label,url) => {
      const href = safeHref(url);
      if (!href) return `${label} (${url})`;
      const index = links.push({label,href}) - 1;
      return `\u0000SIALINK${index}\u0000`;
    });
    source = escapeHtml(source);
    source = source.replace(/`([^`\n]+)`/g,'<code>$1</code>');
    source = source.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
    source = source.replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
    source = source.replace(/\u0000SIALINK(\d+)\u0000/g, (_full,index) => {
      const link = links[Number(index)];
      return link ? `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>` : '';
    });
    return source;
  }

  function renderMarkdown(text){
    const lines = String(text ?? '').replace(/\r\n?/g,'\n').split('\n');
    const out = [];
    let inCode = false, code = [], listType = '', listItems = [];
    const flushList = () => {
      if (!listType || !listItems.length) return;
      out.push(`<${listType}>${listItems.map((item)=>`<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`);
      listType=''; listItems=[];
    };
    const flushCode = () => {
      if (!inCode) return;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      inCode=false; code=[];
    };
    for (let i=0;i<lines.length;i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) { if (inCode) flushCode(); else { flushList(); inCode=true; } continue; }
      if (inCode) { code.push(line); continue; }
      if (i+1<lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {
        flushList();
        const headers=line.replace(/^\||\|$/g,'').split('|').map((c)=>c.trim());
        const rows=[]; i+=2;
        while(i<lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(lines[i].replace(/^\||\|$/g,'').split('|').map((c)=>c.trim())); i++; }
        i--;
        out.push(`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>${headers.map((h)=>`<th style="text-align:left;border-bottom:1px solid rgba(154,178,222,.28);padding:6px">${inlineMarkdown(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row)=>`<tr>${headers.map((_h,idx)=>`<td style="border-bottom:1px solid rgba(154,178,222,.12);padding:6px;vertical-align:top">${inlineMarkdown(row[idx]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const heading=line.match(/^(#{1,3})\s+(.+)$/); if (heading) { flushList(); out.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); continue; }
      const bullet=line.match(/^\s*[-*+]\s+(.+)$/); if (bullet) { if(listType && listType!=='ul') flushList(); listType='ul'; listItems.push(bullet[1]); continue; }
      const number=line.match(/^\s*\d+[.)]\s+(.+)$/); if (number) { if(listType && listType!=='ol') flushList(); listType='ol'; listItems.push(number[1]); continue; }
      flushList();
      if (!line.trim()) { out.push(''); continue; }
      out.push(`<p>${inlineMarkdown(line)}</p>`);
    }
    flushList(); flushCode();
    return out.join('');
  }

  function recordClientError(value){
    const text = cleanText(value,180);
    if (!text || /ResizeObserver loop/i.test(text)) return;
    if (!state.errors.includes(text)) state.errors.unshift(text);
    state.errors = state.errors.slice(0,5);
    setNotice('SIA noticed a page error. I can help inspect it.');
  }
  window.addEventListener('error',(event)=>recordClientError(event.message || 'Page script error'));
  window.addEventListener('unhandledrejection',(event)=>recordClientError(event.reason?.message || event.reason || 'Unhandled page error'));

  function buildRoot(){
    const root=document.createElement('div'); root.id='sia-copilot-root'; root.dataset.version=VERSION;
    root.innerHTML=`
      <button class="siax-launcher" id="siaxLauncher" type="button" aria-haspopup="dialog" aria-controls="siaxDrawer" aria-expanded="false"><span class="siax-launcher-mark">Ask SIA</span><span class="siax-launcher-badge" id="siaxLauncherBadge">!</span></button>
      <div class="siax-scrim" id="siaxScrim"></div>
      <aside class="siax-drawer" id="siaxDrawer" role="dialog" aria-modal="true" aria-label="Ask SIA copilot">
        <header class="siax-head"><div class="siax-brand"><div class="siax-brand-row"><span class="siax-wordmark">SIA</span><span class="siax-online" id="siaxOnline"></span></div><div class="siax-subtitle" id="siaxSubtitle">Your Sulandra copilot</div></div><button class="siax-icon-btn" id="siaxNew" type="button" title="New conversation" aria-label="New SIA conversation">＋</button><a class="siax-icon-btn" href="/sia.html" target="_blank" rel="noopener noreferrer" title="Open full SIA" aria-label="Open full SIA">↗</a><button class="siax-icon-btn" id="siaxClose" type="button" aria-label="Close SIA">×</button></header>
        <div class="siax-persona"><div class="siax-persona-copy"><strong id="siaxPerson">Personal SIA profile</strong><span id="siaxContext">${escapeHtml(appForPath(location.pathname))} · ${escapeHtml(location.pathname)}</span></div><span class="siax-chip" id="siaxProfileChip">Second eye</span></div>
        <div class="siax-quickbar" id="siaxQuickbar"><button class="siax-quick" type="button" data-prompt="What am I looking at on this page and what can I do here?">What is this page?</button><button class="siax-quick" type="button" data-prompt="Help me complete what I am working on here, one step at a time.">Help me do this</button><button class="siax-quick" type="button" data-prompt="This page is not working as expected. Help me troubleshoot it using the current page context.">Troubleshoot page</button><button class="siax-quick" type="button" data-prompt="Based on my current Sulandra context, what should I do next?">What next?</button></div>
        <div class="siax-notice" id="siaxNotice"></div>
        <div class="siax-log" id="siaxLog" aria-live="polite"></div>
        <div class="siax-attach-preview" id="siaxAttachPreview"><span id="siaxAttachName"></span><button id="siaxRemoveAttach" type="button">Remove</button></div>
        <footer class="siax-compose"><div class="siax-compose-box"><button class="siax-action" id="siaxAttach" type="button" title="Attach screenshot" aria-label="Attach screenshot">＋</button><textarea id="siaxInput" rows="1" maxlength="12000" placeholder="Ask SIA about this page…" aria-label="Ask SIA"></textarea><button class="siax-send" id="siaxSend" type="button" aria-label="Send to SIA">↑</button><input id="siaxFile" type="file" accept="image/png,image/jpeg,image/webp" hidden /></div><div class="siax-privacy"><strong>Never share passwords, API keys, MFA codes, or patient/client clinical information.</strong> SIA automatically receives only safe page metadata, not form values or clinical content.</div></footer>
      </aside>`;
    document.body.appendChild(root);
    return root;
  }

  const root=buildRoot(), launcher=el('siaxLauncher'), log=el('siaxLog'), input=el('siaxInput'), send=el('siaxSend'), file=el('siaxFile');

  function setNotice(text, actionLabel, action){
    state.uiNotice=text || '';
    const notice=el('siaxNotice');
    if (!text) { notice.className='siax-notice'; notice.textContent=''; launcher.classList.remove('has-notice'); return; }
    launcher.classList.add('has-notice');
    notice.className='siax-notice show';
    notice.innerHTML=`<strong>Second eye:</strong> ${escapeHtml(text)}${actionLabel ? ` <button type="button" id="siaxNoticeAction">${escapeHtml(actionLabel)}</button>`:''}`;
    if (actionLabel && action) el('siaxNoticeAction')?.addEventListener('click',action,{once:true});
  }

  function showGuest(){
    log.innerHTML=`<div class="siax-guest"><div class="siax-guest-card"><h3>Sign in for your personal SIA copilot</h3><p>Ask SIA follows your authenticated Sulandra employee identity, role, conversations, and safe application context across the platform. Sign in first so SIA can keep the correct employee boundary.</p><div class="siax-guest-actions"><a class="primary" href="/employee-login.html?returnTo=${encodeURIComponent(location.pathname+location.search)}">Employee Sign In</a><a href="/admin-login.html">Admin Sign In</a></div></div></div>`;
    el('siaxPerson').textContent='SIA support'; el('siaxProfileChip').textContent='Sign in';
    input.disabled=true; send.disabled=true; el('siaxAttach').disabled=true;
  }

  async function api(path,options={}){
    state.token=getToken();
    if(!state.token) throw Object.assign(new Error('Authentication required'),{status:401});
    const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{}),Authorization:`Bearer ${state.token}`};
    const response=await fetch(API_BASE+path,{...options,headers});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(payload.error||payload.message||`Request failed (${response.status})`);error.status=response.status;throw error;}
    return payload.data ?? payload;
  }

  function currentPageContext(){
    const section=safeSection();
    const errors=state.errors.length ? ` Recent browser-side error signals: ${state.errors.join(' | ')}` : '';
    const longLoad=state.loadingNotice ? ' A loading indicator has remained visible longer than expected.' : '';
    return {
      page: location.pathname+location.search,
      supportWorkspacePage: location.pathname+location.search,
      application: appForPath(location.pathname),
      environment: 'production',
      symptom: cleanText(`Current page title: ${document.title}.${section?` Current section: ${section}.`:''}${longLoad}${errors}`,1400),
    };
  }

  async function ensureProfile(){
    const pageContext=currentPageContext();
    const result=await api('/api/sia/profile/context',{method:'POST',body:JSON.stringify({page:pageContext.page,application:pageContext.application,pageTitle:document.title})});
    state.profile=result.profile;
    const identity=state.profile?.identitySnapshot || {};
    const prefs=state.profile?.preferences || {};
    const display=prefs.preferredName || identity.displayName || identity.employeeUsername || identity.workEmail || 'Your SIA copilot';
    el('siaxPerson').textContent=`SIA for ${display}`;
    el('siaxProfileChip').textContent=prefs.responseStyle ? `${String(prefs.responseStyle).toLowerCase()} mode` : 'Second eye';
    el('siaxSubtitle').textContent=`${pageContext.application} · personal employee copilot`;
    el('siaxContext').textContent=`${pageContext.application}${safeSection()?` · ${safeSection()}`:''} · ${location.pathname}`;
    return state.profile;
  }

  function assistantMessage(text){
    const wrap=document.createElement('div'); wrap.className='siax-msg assistant';
    wrap.innerHTML=`<div class="siax-avatar">SIA</div><div class="siax-bubble">${renderMarkdown(text)}<button class="siax-copy" type="button">Copy</button></div>`;
    wrap.querySelector('.siax-copy').addEventListener('click',async(event)=>{try{await navigator.clipboard.writeText(text);event.currentTarget.textContent='Copied';setTimeout(()=>event.currentTarget.textContent='Copy',1200);}catch{}});
    log.appendChild(wrap); log.scrollTop=log.scrollHeight; return wrap;
  }
  function userMessage(text){
    const wrap=document.createElement('div'); wrap.className='siax-msg user';
    const bubble=document.createElement('div'); bubble.className='siax-bubble'; bubble.textContent=text;
    wrap.appendChild(bubble); log.appendChild(wrap); log.scrollTop=log.scrollHeight;
  }
  function thinking(){
    const wrap=document.createElement('div'); wrap.className='siax-msg assistant'; wrap.id='siaxThinking';
    wrap.innerHTML='<div class="siax-avatar">SIA</div><div class="siax-thinking"><span>Thinking</span><i></i><i></i><i></i></div>'; log.appendChild(wrap); log.scrollTop=log.scrollHeight;
  }
  function emptyState(){
    log.innerHTML=`<div class="siax-empty"><div class="siax-empty-inner"><strong>Your second eye across Sulandra</strong><p>I know which Sulandra application you are using, your authenticated role and employee identity, and your own SIA conversation history. I can guide, troubleshoot, explain, and help you find the next safe step without reading form values or clinical content automatically.</p><div class="siax-empty-note">Ask naturally: “How do I do this?”, “Why is this spinning?”, “Where is my schedule?”, or attach a non-sensitive screenshot.</div></div></div>`;
  }

  async function loadConversation(id){
    if(!id){state.conversationId='';emptyState();return;}
    const data=await api('/api/sia/conversations/'+encodeURIComponent(id)); state.conversationId=id; log.innerHTML='';
    for(const message of data.messages||[]){if(message.role==='assistant')assistantMessage(message.content);else userMessage(message.content);}
    if(!(data.messages||[]).length)emptyState();
  }

  async function boot(){
    state.token=getToken();
    if(!state.token){showGuest();return;}
    input.disabled=false;send.disabled=false;el('siaxAttach').disabled=false;
    try{
      const [profile,status,conversations]=await Promise.all([ensureProfile(),api('/api/sia/status'),api('/api/sia/conversations')]);
      state.profile=profile;state.status=status;el('siaxOnline').style.background=status.configured?'var(--siax-green)':'#f2b84b';
      const latest=(conversations.conversations||[])[0]; if(latest?.id) await loadConversation(latest.id); else emptyState();
      state.booted=true;
    }catch(error){
      if(error.status===401){showGuest();return;}
      log.innerHTML='';assistantMessage(`I could not initialize your personal SIA profile right now: **${cleanText(error.message,180)}**\n\nYou can still open the full [SIA workspace](/sia.html) or try again in a moment.`);
    }
  }

  function openDrawer(){root.classList.add('siax-open');launcher.setAttribute('aria-expanded','true');setNotice('');if(!state.booted)boot();setTimeout(()=>input?.focus(),180);}
  function closeDrawer(){root.classList.remove('siax-open');launcher.setAttribute('aria-expanded','false');launcher.focus();}
  launcher.addEventListener('click',openDrawer);el('siaxClose').addEventListener('click',closeDrawer);el('siaxScrim').addEventListener('click',closeDrawer);
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&root.classList.contains('siax-open'))closeDrawer();});
  el('siaxNew').addEventListener('click',()=>{state.conversationId='';emptyState();input.focus();});

  function autoGrow(){input.style.height='auto';input.style.height=Math.min(150,Math.max(40,input.scrollHeight))+'px';}
  input.addEventListener('input',autoGrow); input.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}});
  el('siaxQuickbar').addEventListener('click',(event)=>{const button=event.target.closest('[data-prompt]');if(button){input.value=button.dataset.prompt;autoGrow();sendMessage();}});

  async function fileToAttachment(selected){
    if(!selected)return null;
    if(!['image/png','image/jpeg','image/webp'].includes(selected.type))throw new Error('Use a PNG, JPG, or WEBP screenshot.');
    if(selected.size>5_000_000)throw new Error('Screenshot is too large. Keep it under 5 MB.');
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Unable to read screenshot.'));reader.readAsDataURL(selected);});
    return {name:cleanText(selected.name,180)||'screenshot.png',mimeType:selected.type,dataUrl};
  }
  function showAttachment(){const preview=el('siaxAttachPreview');if(state.attached){preview.classList.add('show');el('siaxAttachName').textContent=`Screenshot: ${state.attached.name}`;}else{preview.classList.remove('show');el('siaxAttachName').textContent='';}}
  el('siaxAttach').addEventListener('click',()=>file.click());el('siaxRemoveAttach').addEventListener('click',()=>{state.attached=null;file.value='';showAttachment();});
  file.addEventListener('change',async()=>{try{state.attached=await fileToAttachment(file.files?.[0]);showAttachment();}catch(error){setNotice(cleanText(error.message,160));}});
  document.addEventListener('paste',async(event)=>{if(!root.classList.contains('siax-open'))return;const item=Array.from(event.clipboardData?.items||[]).find((entry)=>entry.type.startsWith('image/'));if(!item)return;try{state.attached=await fileToAttachment(item.getAsFile());showAttachment();setNotice('Screenshot attached from clipboard.');}catch(error){setNotice(cleanText(error.message,160));}});
  el('siaxDrawer').addEventListener('dragover',(event)=>event.preventDefault());el('siaxDrawer').addEventListener('drop',async(event)=>{event.preventDefault();const selected=event.dataTransfer?.files?.[0];if(!selected)return;try{state.attached=await fileToAttachment(selected);showAttachment();setNotice('Screenshot attached.');}catch(error){setNotice(cleanText(error.message,160));}});

  async function sendMessage(){
    const text=input.value.trim(); if((!text&&!state.attached)||state.busy)return;
    state.token=getToken(); if(!state.token){showGuest();return;}
    state.busy=true;send.disabled=true;input.disabled=true;const shown=text||'Please inspect this screenshot and help me with what I am seeing.';userMessage(shown);input.value='';autoGrow();thinking();
    const attachment=state.attached;state.attached=null;file.value='';showAttachment();
    try{
      const data=await api('/api/sia/chat',{method:'POST',body:JSON.stringify({conversationId:state.conversationId||undefined,message:shown,attachment:attachment||undefined,context:currentPageContext()})});
      el('siaxThinking')?.remove();state.conversationId=data.conversationId||state.conversationId;assistantMessage(data.answer||'SIA did not return a response.');
      ensureProfile().catch(()=>{});
    }catch(error){el('siaxThinking')?.remove();assistantMessage(`I could not complete that request: **${cleanText(error.message,180)}**\n\nIf the page itself is failing, tell me what you see or attach a non-sensitive screenshot and I’ll continue from there.`);}
    finally{state.busy=false;send.disabled=false;input.disabled=false;input.focus();}
  }
  send.addEventListener('click',sendMessage);

  function detectLongLoading(){
    if(document.hidden||root.classList.contains('siax-open'))return;
    const selectors='[aria-busy="true"],.loading,.loader,.spinner,.loading-spinner,[data-loading="true"]';
    const found=Array.from(document.querySelectorAll(selectors)).find((node)=>{
      if(node.closest('#sia-copilot-root'))return false;
      const style=getComputedStyle(node),box=node.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&box.width>=18&&box.height>=18;
    });
    if(found&&!state.loadingNotice){state.loadingNotice=true;setNotice('This page appears to have been loading for a while.','Troubleshoot',()=>{openDrawer();input.value='This page appears to be stuck loading. Help me troubleshoot the current page using the context you have.';autoGrow();sendMessage();});}
    if(!found)state.loadingNotice=false;
  }
  setTimeout(()=>{detectLongLoading();setInterval(detectLongLoading,6000);},12000);

  // Create/update the employee's server-side SIA profile quietly on authenticated pages,
  // even if they do not open the drawer. No page form values or clinical content are sent.
  setTimeout(()=>{state.token=getToken();if(state.token)ensureProfile().catch(()=>{});},1800);
})();
