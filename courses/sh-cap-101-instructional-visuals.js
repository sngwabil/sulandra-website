/* SH-CAP-101 Instructional Visual Engine
   Purpose-built teaching visuals for SH-CAP-101.
*/
(() => {
  'use strict';

  const styles = `
  .teaching-visual{margin:22px 0 28px;border:1px solid #cbd5e1;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 16px 40px rgba(15,23,42,.12)}
  .teaching-visual__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff}
  .teaching-visual__head strong{font-size:.82rem;letter-spacing:.08em;text-transform:uppercase}.teaching-visual__type{font-size:.74rem;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16)}
  .teaching-visual__body{padding:22px}.teaching-visual h4{margin:0 0 10px;color:#0f766e;font-size:1.05rem}.teaching-visual p{margin:0;color:#334155}
  .tv-caption{padding:14px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:.9rem;color:#334155}.tv-caption strong{color:#0f766e}
  .tv-pillars{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.tv-pillar{padding:18px 12px;text-align:center;border-radius:14px;background:#f0fdfa;border:1px solid #99f6e4}.tv-pillar span{display:block;font-size:2rem;margin-bottom:7px}.tv-pillar b{color:#115e59}.tv-pillar small{display:block;margin-top:5px;line-height:1.35;color:#475569}
  .tv-timeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;position:relative}.tv-timeline:before{content:"";position:absolute;left:8%;right:8%;top:23px;height:4px;background:#99f6e4}.tv-step{position:relative;text-align:center;padding:0 10px}.tv-step i{position:relative;z-index:1;display:grid;place-items:center;width:48px;height:48px;margin:0 auto 10px;border-radius:50%;background:#0f766e;color:#fff;font-style:normal;font-weight:800}.tv-step b{display:block;color:#115e59}.tv-step small{display:block;margin-top:5px;color:#475569;line-height:1.35}
  .tv-compare{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tv-side{padding:18px;border-radius:14px}.tv-side.bad{background:#fef2f2;border:1px solid #fecaca}.tv-side.good{background:#f0fdf4;border:1px solid #bbf7d0}.tv-side h4{display:flex;gap:8px;align-items:center}.tv-side ul{margin:8px 0 0;padding-left:20px}.tv-side li{margin:5px 0}
  .tv-flow{display:flex;align-items:stretch;gap:10px}.tv-flow__step{flex:1;padding:16px 12px;text-align:center;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe}.tv-flow__step b{display:block;color:#1d4ed8;margin-bottom:5px}.tv-arrow{align-self:center;font-size:1.4rem;color:#0f766e;font-weight:900}
  .tv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tv-card{padding:16px;border:1px solid #dbe5e3;border-radius:14px;background:#f8fafc}.tv-card b{display:block;margin-bottom:6px;color:#0f766e}
  .tv-decision{display:grid;gap:12px;justify-items:center}.tv-question{padding:14px 20px;border-radius:14px;background:#0f766e;color:#fff;font-weight:800;text-align:center}.tv-branches{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%}.tv-branch{padding:16px;border-radius:14px;border:1px solid #cbd5e1;background:#f8fafc}.tv-branch b{display:block;margin-bottom:6px;color:#115e59}
  .tv-scene{position:relative;min-height:340px;border-radius:16px;overflow:hidden;background:linear-gradient(180deg,#dff7f2 0 70%,#cbd5e1 70% 100%);border:1px solid #bae6d8}.tv-window{position:absolute;right:28px;top:26px;width:120px;height:92px;border:10px solid #fff;background:linear-gradient(#bfdbfe,#dcfce7)}
  .tv-person{position:absolute;bottom:58px;width:82px;height:170px}.tv-person:before{content:"";display:block;width:52px;height:52px;margin:auto;border-radius:50%;background:#9a6947}.tv-person:after{content:"";display:block;width:82px;height:112px;margin-top:4px;border-radius:28px 28px 12px 12px;background:#0f766e}.tv-person.client{left:16%}.tv-person.dsp{right:16%}.tv-person.dsp:after{background:#2563eb}.tv-person.kneel{transform:translateY(34px) scale(.88)}.tv-callout{position:absolute;max-width:220px;padding:10px 12px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;box-shadow:0 8px 24px rgba(15,23,42,.12);font-size:.78rem;line-height:1.35;color:#334155}.tv-callout b{display:block;color:#0f766e}.tv-callout.one{left:3%;top:18px}.tv-callout.two{right:3%;top:24px}.tv-callout.three{right:6%;bottom:18px}.tv-callout.four{left:6%;bottom:18px}
  .visual-card,.course-illustration{display:none!important}
  @media(max-width:760px){.tv-pillars,.tv-timeline,.tv-grid,.tv-compare,.tv-branches{grid-template-columns:1fr}.tv-timeline:before{display:none}.tv-flow{flex-direction:column}.tv-arrow{transform:rotate(90deg)}.tv-scene{min-height:420px}.tv-callout{max-width:165px}.teaching-visual__body{padding:16px}}
  `;

  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clean = text => esc((text || '').replace(/\s+/g,' ').trim());
  const header = (label,type) => `<div class="teaching-visual__head"><strong>${esc(label)}</strong><span class="teaching-visual__type">${esc(type)}</span></div>`;
  const caption = (label,text) => `<div class="tv-caption"><strong>${esc(label)}</strong> ${clean(text)}</div>`;

  function visualFor(index,title,text){
    const mode=index%5;
    if(mode===0) return `${header('Notice the Interaction','Acted teaching scene')}<div class="teaching-visual__body"><div class="tv-scene"><div class="tv-window"></div><div class="tv-person client"></div><div class="tv-person dsp kneel"></div><div class="tv-callout one"><b>Start with respect</b>The DSP approaches at eye level and explains before acting.</div><div class="tv-callout two"><b>Invite participation</b>The person receives meaningful choices and time to respond.</div><div class="tv-callout three"><b>Protect rights</b>The final action is necessary, authorized, and least restrictive.</div></div></div>${caption('What is happening?',text)}`;
    if(mode===1) return `${header('Core Teaching Points','Professional infographic')}<div class="teaching-visual__body"><div class="tv-pillars"><div class="tv-pillar"><span>👂</span><b>Listen</b><small>Understand before responding.</small></div><div class="tv-pillar"><span>🗳️</span><b>Offer Choice</b><small>Use real, meaningful options.</small></div><div class="tv-pillar"><span>✅</span><b>Verify</b><small>Check consent and authorization.</small></div><div class="tv-pillar"><span>📣</span><b>Advocate</b><small>Document and escalate concerns.</small></div></div></div>${caption('Learning connection:',text)}`;
    if(mode===2) return `${header('How the Practice Works','Illustrated process map')}<div class="teaching-visual__body"><div class="tv-timeline"><div class="tv-step"><i>1</i><b>Observe</b><small>Notice the person’s communication and preferences.</small></div><div class="tv-step"><i>2</i><b>Explain</b><small>Use clear, respectful language.</small></div><div class="tv-step"><i>3</i><b>Support</b><small>Provide only the assistance actually needed.</small></div><div class="tv-step"><i>4</i><b>Review</b><small>Confirm the person is satisfied and safe.</small></div></div></div>${caption('Apply this process:',text)}`;
    if(mode===3) return `${header('Correct Practice vs. Incorrect Practice','Split-screen comparison')}<div class="teaching-visual__body"><div class="tv-compare"><div class="tv-side bad"><h4>✕ Incorrect</h4><ul><li>Assumes instead of asking</li><li>Rushes or speaks over the person</li><li>Prioritizes staff convenience</li><li>Acts without checking authorization</li></ul></div><div class="tv-side good"><h4>✓ Correct</h4><ul><li>Explains the situation</li><li>Offers meaningful choices</li><li>Allows response time</li><li>Documents and escalates appropriately</li></ul></div></div></div>${caption('Apply it to this slide:',text)}`;
    return `${header('What Should the DSP Do?','Decision tree')}<div class="teaching-visual__body"><div class="tv-decision"><div class="tv-question">Is there immediate danger or a possible rights restriction?</div><div class="tv-branches"><div class="tv-branch"><b>YES</b>Protect the person, obtain emergency help when required, notify supervision, and document facts.</div><div class="tv-branch"><b>NO</b>Pause, explain choices, verify consent or authorization, and use the least restrictive solution.</div></div><div class="tv-question">When uncertain: stop and escalate—never guess with another person’s rights.</div></div></div>${caption('Use this decision:',text)}`;
  }

  function enhance(){
    const slides=[...document.querySelectorAll('.slide-pane')];
    if(!slides.length) return;
    let style=document.getElementById('sh-cap-101-instructional-styles');
    if(!style){style=document.createElement('style');style.id='sh-cap-101-instructional-styles';style.textContent=styles;document.head.appendChild(style);}
    slides.slice(0,50).forEach((slide,index)=>{
      if(slide.querySelector('.teaching-visual')) return;
      const title=slide.querySelector('h2')?.textContent || `Slide ${index+1}`;
      const text=[...slide.querySelectorAll('p')].map(p=>p.textContent.trim()).find(Boolean) || title;
      const target=slide.querySelector('h2');
      if(!target) return;
      const visual=document.createElement('section');
      visual.className='teaching-visual';
      visual.setAttribute('aria-label',`${title} instructional visual`);
      visual.innerHTML=visualFor(index,title,text);
      target.insertAdjacentElement('afterend',visual);
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,0));
  else setTimeout(enhance,0);
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
})();
