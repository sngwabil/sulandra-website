/* IT_AGENT_ACTION_CENTER_TAB_V1
   Presents the existing Action Center as a normal workspace view instead of a floating drawer. */
(()=>{
  if(window.__SULANDRA_IT_ACTION_CENTER_TAB__)return;
  window.__SULANDRA_IT_ACTION_CENTER_TAB__=true;

  const installStyles=()=>{
    if(document.getElementById('itws-action-center-tab-style'))return;
    const style=document.createElement('style');
    style.id='itws-action-center-tab-style';
    style.textContent=`
      body.it-chatgpt-workspace .itws-activity-toggle{display:none!important}
      body.it-chatgpt-workspace .itws-drawer-backdrop{display:none!important}
      body.it-chatgpt-workspace #itwsActionCenterView{padding:28px!important;background:#fafbfc!important;min-height:100%!important;overflow:auto!important}
      body.it-chatgpt-workspace .itws-action-center-wrap{width:min(1120px,100%)!important;margin:0 auto!important}
      body.it-chatgpt-workspace .itws-action-center-panel{position:static!important;inset:auto!important;width:100%!important;max-width:none!important;max-height:none!important;overflow:visible!important;transform:none!important;transition:none!important;z-index:auto!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important}
      body.it-chatgpt-workspace .itws-action-center-panel>h2{font-size:24px!important;letter-spacing:-.025em!important;margin:0 0 4px!important;color:#202123!important}
      body.it-chatgpt-workspace .itws-action-center-panel>p{margin:0 0 20px!important;color:#72757a!important;font-size:13px!important}
      body.it-chatgpt-workspace .itws-action-center-panel .action-list{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))!important;gap:12px!important}
      body.it-chatgpt-workspace .itws-action-center-panel .action{margin:0!important;box-shadow:none!important;background:#fff!important;border:1px solid #e3e6e8!important}
      body.it-chatgpt-workspace .itws-action-center-panel .agent-note{margin-top:18px!important}
      body.it-chatgpt-workspace .itws-action-center-panel>h3{margin-top:22px!important}
      @media(max-width:700px){body.it-chatgpt-workspace #itwsActionCenterView{padding:18px 14px!important}body.it-chatgpt-workspace .itws-action-center-panel .action-list{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  };

  const ready=()=>{
    const sidebar=document.querySelector('.itws-sidebar');
    const nav=sidebar?.querySelector('.itws-nav');
    const content=document.querySelector('.itws-content');
    const agent=document.getElementById('agent');
    const actionCenter=agent?.querySelector('.agent-shell>aside')||document.querySelector('#itwsActionCenterView .itws-action-center-panel');
    if(!sidebar||!nav||!content||!agent||!actionCenter)return;

    installStyles();
    document.getElementById('itwsActivity')?.remove();
    document.querySelector('.itws-drawer-backdrop')?.remove();

    let view=document.getElementById('itwsActionCenterView');
    if(!view){
      view=document.createElement('section');
      view.id='itwsActionCenterView';
      view.className='view hidden itws-action-center-view';
      const wrap=document.createElement('div');
      wrap.className='itws-action-center-wrap';
      view.appendChild(wrap);
      agent.insertAdjacentElement('afterend',view);
    }
    const wrap=view.querySelector('.itws-action-center-wrap')||view;
    actionCenter.classList.remove('card','itws-open');
    actionCenter.classList.add('itws-action-center-panel');
    if(actionCenter.parentElement!==wrap)wrap.appendChild(actionCenter);

    let actionButton=nav.querySelector('[data-itws-view="action-center"]');
    if(!actionButton){
      actionButton=document.createElement('button');
      actionButton.type='button';
      actionButton.dataset.itwsView='action-center';
      actionButton.textContent='Action Center';
      const agentButton=nav.querySelector('[data-itws-view="agent"]');
      if(agentButton)agentButton.insertAdjacentElement('afterend',actionButton);else nav.prepend(actionButton);
    }

    actionButton.addEventListener('click',()=>{
      content.querySelectorAll('.view').forEach(section=>section.classList.add('hidden'));
      view.classList.remove('hidden');
      nav.querySelectorAll('[data-itws-view]').forEach(button=>button.classList.toggle('active',button===actionButton));
      sidebar.classList.remove('open');
      content.scrollTop=0;
    });
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
