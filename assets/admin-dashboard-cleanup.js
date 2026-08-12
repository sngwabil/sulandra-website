(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  const clean = () => {
    document.getElementById('sulandraOwnerConsoleButton')?.remove();
    document.getElementById('sulandraOwnerConsole')?.remove();
    document.querySelectorAll('.dashboard-page-dots').forEach((node) => node.remove());
    document.querySelectorAll('.dashboard-slide-head .badge').forEach((node) => {
      const text = String(node.textContent || '').trim();
      if (/^[123]\s*\/\s*3$/.test(text)) node.remove();
    });
    document.querySelectorAll('body *').forEach((node) => {
      if (node.children.length) return;
      const text = String(node.textContent || '').trim();
      if (/^[123]\s*\/\s*3$/.test(text)) node.remove();
      if (/^Enterprise Owner$/i.test(text) && (node.closest('#sulandraOwnerConsoleButton,#sulandraOwnerConsole') || node.style.position === 'fixed')) node.remove();
    });
  };
  clean();
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;clean()});
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
