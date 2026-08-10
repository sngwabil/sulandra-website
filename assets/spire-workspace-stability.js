(() => {
  'use strict';
  let timer=0;
  function reconcile(){
    const completion=window.SpireWorkspaceCompletion;
    if(!completion)return;
    const chart=document.getElementById('spireChartWorkspace');
    const generic=document.getElementById('spireGenericWorkspace');
    const chartActive=chart?.classList.contains('active');
    if(chartActive){
      // A patient chart is its own workspace. Do not let the previously selected
      // global nav button (for example Orders) mask the active chart tab.
      document.querySelectorAll('.spire-global-nav [data-workspace].active').forEach(node=>node.classList.remove('active'));
      const tab=document.querySelector('.chart-tabs [data-chart-tab].active')?.dataset.chartTab||'';
      const body=document.getElementById('spireChartTabBody');
      const ready=(tab==='notes'&&body?.querySelector('.spwc-note-layout'))||(tab==='plan'&&body?.querySelector('.spwc-plan-grid'))||(tab==='wrap-up'&&body?.querySelector('.spwc-wrap-grid'));
      if(['notes','plan','wrap-up'].includes(tab)&&!ready)completion.renderCurrent(true);
      return;
    }
    if(!generic?.classList.contains('active'))return;
    const workspace=document.querySelector('.spire-global-nav [data-workspace].active')?.dataset.workspace||'';
    const ready=(workspace==='tasks'&&generic.querySelector('[data-task-search]'))||(workspace==='orders'&&generic.querySelector('[data-order-search]'))||(workspace==='reports'&&generic.querySelector('[data-report-days]'))||(workspace==='tools'&&generic.querySelector('.spwc-tools-grid'));
    if(['tasks','orders','reports','tools'].includes(workspace)&&!ready)completion.renderCurrent(true);
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(reconcile,75)}
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',reconcile,{once:true});
  window.addEventListener('spire:workspace-preferences-updated',schedule);
  if(document.readyState!=='loading')schedule();
})();
