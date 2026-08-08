(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  const clean = () => {
    document.getElementById('sulandraOwnerConsoleButton')?.remove();
    document.getElementById('sulandraOwnerConsole')?.remove();
    document.querySelectorAll('body *').forEach((node) => {
      if (node.children.length) return;
      const text = String(node.textContent || '').trim();
      if (/^[123]\s*\/\s*3$/.test(text)) {
        node.style.display = 'none';
        node.setAttribute('aria-hidden','true');
      }
    });
  };
  clean();
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;clean()});
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
