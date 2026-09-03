/* SULANDRA_IT_STATUS_BOARD_V1 */
(()=>{
  'use strict';
  if(window.__SULANDRA_IT_STATUS_BOARD_V1__)return;
  window.__SULANDRA_IT_STATUS_BOARD_V1__=true;

  const OPEN_KEY='sulandra:it-agent:status-board-open-v1';
  const priorFetch=window.fetch.bind(window);
  let board=null,body=null,shell=null,toggle=null,current=null;

  const clean=(value,max=500)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const icon=status=>status==='done'?'✓':status==='waiting'?'!':status==='error'?'×':'';
  const storedOpen=()=>{try{return localStorage.getItem(OPEN_KEY)!=='0'}catch{return true}};

  function setOpen(open,persist=true){
    if(!board||!shell)return;
    board.hidden=!open;
    shell.classList.toggle('it-status-board-closed',!open);
    if(toggle){toggle.textContent=open?'Status Board Open':'Open Status Board';toggle.setAttribute('aria-expanded',open?'true':'false')}
    if(persist){try{localStorage.setItem(OPEN_KEY,open?'1':'0')}catch{}}
  }

  function rehomeActionCenter(){
    const overview=document.getElementById('overview');
    if(!overview||!shell)return;
    const aside=[...shell.children].find(node=>node.matches?.('aside.card')&&/Action Center/i.test(node.querySelector('h2')?.textContent||''));
    if(aside&&!overview.contains(aside)){
      aside.classList.add('it-status-action-center');
      overview.appendChild(aside);
    }
    const tab=document.querySelector('.tab[data-view="overview"]');
    if(tab&&/Operations Overview/i.test(tab.textContent||''))tab.textContent='Operations';
  }

  function install(){
    const agent=document.getElementById('agent');
    shell=agent?.querySelector('.agent-shell')||null;
    const main=shell?.querySelector('.agent-main')||null;
    if(!agent||!shell||!main)return false;
    if(document.getElementById('itAgentStatusBoard')){
      board=document.getElementById('itAgentStatusBoard');
      body=board.querySelector('.it-status-board-body');
      return true;
    }

    rehomeActionCenter();
    shell.classList.add('it-status-layout');

    board=document.createElement('aside');
    board.id='itAgentStatusBoard';
    board.className='it-status-board';
    board.setAttribute('aria-label','IT Agent Status Board');
    board.innerHTML=`<div class="it-status-board-head"><strong>Status Board</strong><span class="it-status-board-badge">Operational trace</span><button type="button" class="it-status-board-close" aria-label="Close Status Board" title="Close Status Board">×</button></div><div class="it-status-board-body"><div class="it-status-board-empty">Live request progress will appear here. This board shows operational status, API activity, action state, and returned evidence only; private model reasoning is never displayed.</div></div><div class="it-status-board-foot">Status Board remains open until you close it. Closing it does not stop the IT Agent or hide Action Center under Operations.</div>`;
    shell.appendChild(board);
    body=board.querySelector('.it-status-board-body');
    board.querySelector('.it-status-board-close').onclick=()=>setOpen(false,true);

    toggle=document.createElement('button');
    toggle.type='button';
    toggle.id='itStatusBoardToggle';
    toggle.className='it-status-board-toggle';
    toggle.onclick=()=>setOpen(board.hidden,true);
    const head=main.querySelector('.agent-head');
    const status=head?.querySelector('.agent-status');
    if(status)status.appendChild(toggle);else head?.appendChild(toggle);
    setOpen(storedOpen(),false);
    return true;
  }

  function ensure(){
    if(install())return;
    const observer=new MutationObserver(()=>{if(install())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),20000);
  }

  function startTrace(kind){
    if(!install())return null;
    body.innerHTML='';
    const trace=document.createElement('div');
    trace.className='it-status-trace';
    trace.innerHTML=`<div class="it-status-trace-title">${kind==='execute'?'Executing approved IT action':'Sulandra IT Agent request'}</div>`;
    body.appendChild(trace);
    current={kind,trace,steps:new Map(),finished:false,started:Date.now()};
    addStep(current,'request',kind==='execute'?'Execution request sent':'Request sent to Sulandra IT Agent','running',kind==='execute'?'Waiting for the controlled execution endpoint to return current action evidence.':'Waiting for the authenticated IT Agent endpoint to return a grounded response or proposal.');
    return current;
  }

  function addStep(trace,key,label,status='running',detail=''){
    if(!trace||trace.finished)return;
    let row=trace.steps.get(key);
    if(!row){
      row=document.createElement('div');
      row.className='it-status-step';
      row.innerHTML='<span class="it-status-step-icon"></span><span><div class="it-status-step-label"></div><div class="it-status-step-detail"></div></span>';
      trace.steps.set(key,row);
      trace.trace.appendChild(row);
    }
    row.className=`it-status-step ${status}`;
    row.querySelector('.it-status-step-icon').textContent=icon(status);
    row.querySelector('.it-status-step-label').textContent=clean(label,220);
    const detailNode=row.querySelector('.it-status-step-detail');
    detailNode.textContent=clean(detail,700);
    detailNode.style.display=detail?'block':'none';
    if(body)body.scrollTop=body.scrollHeight;
  }

  function finish(trace,failed=false){
    if(!trace||trace.finished)return;
    trace.finished=true;
    const title=trace.trace.querySelector('.it-status-trace-title');
    if(title)title.textContent=failed?'IT Agent activity stopped':trace.kind==='execute'?'Execution activity complete':'IT Agent activity complete';
  }

  function responseData(payload){return payload?.data??payload??{}}

  function describePayload(trace,payload){
    const data=responseData(payload);
    if(Array.isArray(data.proposals)&&data.proposals.length){
      const approvals=data.proposals.filter(row=>row?.approvalRequired===true).length;
      addStep(trace,'proposal',`${data.proposals.length} action proposal${data.proposals.length===1?'':'s'} prepared`,'done',approvals?`${approvals} proposal${approvals===1?' requires':'s require'} owner approval before execution.`:'The proposal state was returned without an approval-required flag.');
    }
    if(data.id&&data.status){
      addStep(trace,'action-state',`Action state: ${clean(data.status,80)}`,'done',clean(data.result?.message||data.message||'',500));
    }
    if(data.reply)addStep(trace,'reply','Final conversational response returned','done','The response was returned to the IT Agent conversation.');
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    const chat=method==='POST'&&url.includes('/api/it-solutions/agent/chat');
    const execute=method==='POST'&&/\/api\/it-solutions\/agent\/actions\/[^/]+\/execute(?:\?|$)/.test(url);
    const actions=method==='GET'&&/\/api\/it-solutions\/agent\/actions(?:\?|$)/.test(url);
    const trace=(chat||execute)?startTrace(execute?'execute':'chat'):current;

    if(chat||execute)addStep(trace,'network',execute?'Calling controlled execution API':'Calling authenticated IT Agent API','running','No private reasoning is exposed; this board records only request and response state.');
    try{
      const response=await priorFetch(input,init);
      if(chat||execute){
        addStep(trace,'request',execute?'Execution request accepted by server':'Request accepted by server','done',`HTTP ${response.status}`);
        addStep(trace,'network','Server response received',response.ok?'done':'error',`HTTP ${response.status}`);
        let payload={};try{payload=await response.clone().json()}catch{}
        if(response.ok){
          describePayload(trace,payload);
          addStep(trace,'complete',execute?'Execution result returned':'Agent result returned','done',execute?'The controlled endpoint returned its current execution result.':'The conversation received its final response or prepared action state.');
          finish(trace,false);
        }else{
          const data=responseData(payload);
          addStep(trace,'error','Request stopped before completion','error',clean(data.error||data.message||`HTTP ${response.status}`,600));
          finish(trace,true);
        }
      }else if(actions&&trace&&!trace.finished&&response.ok){
        addStep(trace,'actions-refresh','Action records refreshed','done','Action Center state was refreshed from the authenticated backend.');
      }
      return response;
    }catch(error){
      if(chat||execute){addStep(trace,'error','Network request stopped','error',clean(error?.message||error,600));finish(trace,true)}
      throw error;
    }
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();
