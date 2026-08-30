/* IT_AGENT_HEADER_POLISH_V1
   Presentation-only header decorator. It keeps the existing Status Board action
   and status sources intact while applying stable classes for centered title and
   live connected-state styling. */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_HEADER_POLISH__)return;
  window.__SULANDRA_IT_HEADER_POLISH__=true;

  const decorate=()=>{
    const head=document.querySelector('#agent .agent-head');
    if(!head)return false;

    const title=head.querySelector('div:first-child h2');
    if(title){
      title.classList.add('itws-agent-centered-title');
      if(title.textContent?.trim()!=='Sulandra IT Agent')title.textContent='Sulandra IT Agent';
    }

    const statusBoard=document.getElementById('itwsActivity');
    if(statusBoard){
      statusBoard.classList.add('itws-status-compact');
      statusBoard.title='Status Board';
      statusBoard.setAttribute('aria-label','Status Board');
    }

    head.querySelectorAll('.agent-status .pill').forEach(pill=>{
      const text=String(pill.textContent||'').replace(/\s+/g,' ').trim();
      const connected=/\bCONNECTED\b/i.test(text);
      pill.classList.toggle('itws-live-connected',connected);
      if(connected)pill.setAttribute('aria-label',`${text}. Live connection active.`);
      else if(pill.getAttribute('aria-label')?.endsWith('Live connection active.'))pill.removeAttribute('aria-label');
    });
    return true;
  };

  const boot=()=>{
    decorate();
    const root=document.getElementById('agent')||document.body;
    if(!root)return;
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;decorate()});
    });
    observer.observe(root,{childList:true,subtree:true,characterData:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
