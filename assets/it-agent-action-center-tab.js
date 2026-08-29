/* IT_AGENT_ACTION_CENTER_TAB_V2
   Keeps Action Center as its own operational workspace under Operations.
   It is intentionally separate from the chat Status Board. */
(()=>{
  if(window.__SULANDRA_IT_ACTION_CENTER_TAB__)return;
  window.__SULANDRA_IT_ACTION_CENTER_TAB__=true;

  const installStyles=()=>{
    if(document.getElementById('itws-action-center-tab-style'))return;
    const style=document.createElement('style');
    style.id='itws-action-center-tab-style';
    style.textContent=`
      body.it-chatgpt-workspace #itwsActionCenterView{padding:28px!important;background:#fafbfc!important;min-height:100%!important;overflow:auto!important}
      body.it-chatgpt-workspace .itws-action-center-wrap{width:min(1120px,100%)!important;margin:0 auto!important}
      body.it-chatgpt-workspace .itws-action-center-panel{position:static!important;inset:auto!important;width:100%!important;max-width:none!important;max-height:none!important;overflow:visible!important;transform:none!important;transition:none!important;z-index:auto!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important}
      body.it-chatgpt-workspace .itws-action-center-panel>h2{font-size:24px!important;letter-spacing:-.025em!important;margin:0 0 4px!important;color:#202123!important}
      body.it-chatgpt-workspace .itws-action-center-panel>p{margin:0 0 20px!important;color:#72757a!important;font-size:13px!important}
      body.it-chatgpt-workspace .itws-action-center-panel .action-list{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))!important;gap:12px!important}
      body.it-chatgpt-workspace .itws-action-center-panel .action{margin:0!important;box-shadow:none!important;background:#fff!important;border:1px solid #e3e6e8!important}
      body.it-chatgpt-workspace .itws-action-center-panel .agent-note{margin-top:18px!important}
      body.it-chatgpt-workspace .itws-action-center-panel>h3{margin-top:22px!important}
      body.it-chatgpt-workspace .itws-nav [data-itws-view="action-center"]{margin-left:18px!important;padding-left:15px!important;font-size:11.5px!important;font-weight:600!important;position:relative}
      body.it-chatgpt-workspace .itws-nav [data-itws-view="action-center"]::before{content:'↳';position:absolute;left:2px;color:#8a8b90;font-weight:500}
      @media(max-width:700px){body.it-chatgpt-workspace #itwsActionCenterView{padding:18px 14px!important}body.it-chatgpt-workspace .itws-action-center-panel .action-list{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  };

  const ready=()=>{
    const sidebar=document.querySelector('.itws-sidebar');
    const nav=sidebar?.querySelector('.itws-nav');
    const content=document.querySelector('.itws-content');
    const agent=document.getElementById('agent');
    const actionCenter=agent?.querySelector('.agent-shell>aside:not(.itws-status-board-drawer)')||document.querySelector('#itwsActionCenterView .itws-action-center-panel')||document.querySelector('#agentActions')?.closest('aside');
    if(!sidebar||!nav||!content||!agent||!actionCenter)return;

    installStyles();

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
    actionCenter.classList.remove('card','itws-open','itws-status-board-drawer');
    actionCenter.classList.add('itws-action-center-panel');
    const title=actionCenter.querySelector('h2');if(title)title.textContent='Action Center';
    const intro=actionCenter.querySelector('p');if(intro)intro.textContent='Review operational actions, approvals, execution evidence, and connected capabilities.';
    if(actionCenter.parentElement!==wrap)wrap.appendChild(actionCenter);

    let actionButton=nav.querySelector('[data-itws-view="action-center"]');
    if(!actionButton){
      actionButton=document.createElement('button');
      actionButton.type='button';
      actionButton.dataset.itwsView='action-center';
      actionButton.textContent='Action Center';
      actionButton.className='itws-operation-subnav';
      const operationsButton=nav.querySelector('[data-itws-view="overview"]');
      if(operationsButton)operationsButton.insertAdjacentElement('afterend',actionButton);else nav.prepend(actionButton);
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
