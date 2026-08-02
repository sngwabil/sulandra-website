/* SH-CAP-101 Instructional Visual Engine
   Converts decorative visual placeholders into teaching graphics.
   Designed for courses/sh-cap-101.html.
*/
(() => {
  'use strict';

  const styles = `
  .teaching-visual{margin:22px 0 28px;border:1px solid #cbd5e1;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 16px 40px rgba(15,23,42,.12)}
  .teaching-visual__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff}
  .teaching-visual__head strong{font-size:.82rem;letter-spacing:.08em;text-transform:uppercase}.teaching-visual__type{font-size:.74rem;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.16)}
  .teaching-visual__body{padding:22px}.teaching-visual h4{margin:0 0 10px;color:#0f766e;font-size:1.05rem}.teaching-visual p{margin:0;color:#334155}
  .tv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.tv-card{padding:16px;border:1px solid #dbe5e3;border-radius:14px;background:#f8fafc}.tv-card b{display:block;margin-bottom:6px;color:#0f766e}
  .tv-pillars{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.tv-pillar{padding:16px 12px;text-align:center;border-radius:14px;background:#f0fdfa;border:1px solid #99f6e4}.tv-pillar span{display:block;font-size:1.8rem;margin-bottom:7px}.tv-pillar b{color:#115e59}
  .tv-timeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;position:relative}.tv-timeline:before{content:"";position:absolute;left:8%;right:8%;top:23px;height:4px;background:#99f6e4}.tv-step{position:relative;text-align:center;padding:0 10px}.tv-step i{position:relative;z-index:1;display:grid;place-items:center;width:48px;height:48px;margin:0 auto 10px;border-radius:50%;background:#0f766e;color:#fff;font-style:normal;font-weight:800}.tv-step b{display:block;color:#115e59}.tv-step small{display:block;margin-top:5px;color:#475569;line-height:1.35}
  .tv-compare{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tv-side{padding:18px;border-radius:14px}.tv-side.bad{background:#fef2f2;border:1px solid #fecaca}.tv-side.good{background:#f0fdf4;border:1px solid #bbf7d0}.tv-side h4{display:flex;gap:8px;align-items:center}.tv-side ul{margin:8px 0 0;padding-left:20px}.tv-side li{margin:5px 0}
  .tv-flow{display:flex;align-items:stretch;gap:10px}.tv-flow__step{flex:1;padding:16px 12px;text-align:center;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe}.tv-flow__step b{display:block;color:#1d4ed8;margin-bottom:5px}.tv-arrow{align-self:center;font-size:1.4rem;color:#0f766e;font-weight:900}
  .tv-scene{position:relative;min-height:265px;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#dff7f2,#eef6ff)}.tv-room{position:absolute;inset:0;background:linear-gradient(180deg,transparent 67%,#cbd5e1 68%)}.tv-person{position:absolute;bottom:42px;width:72px;height:142px}.tv-person:before{content:"";display:block;width:48px;height:48px;margin:auto;border-radius:50%;background:#8b5e3c}.tv-person:after{content:"";display:block;width:72px;height:92px;margin-top:2px;border-radius:24px 24px 10px 10px;background:#0f766e}.tv-person.client{left:20%}.tv-person.dsp{right:24%;transform:scale(.9) translateY(14px)}.tv-person.dsp:after{background:#2563eb}.tv-callout{position:absolute;max-width:220px;padding:10px 12px;border-radius:12px;background:#fff;border:1px solid #cbd5e1;box-shadow:0 8px 24px rgba(15,23,42,.12);font-size:.78rem;line-height:1.35;color:#334155}.tv-callout b{display:block;color:#0f766e}.tv-callout.one{left:3%;top:18px}.tv-callout.two{right:3%;top:24px}.tv-callout.three{right:7%;bottom:18px}
  .tv-decision{display:grid;gap:12px;justify-items:center}.tv-question{padding:14px 20px;border-radius:14px;background:#0f766e;color:#fff;font-weight:800;text-align:center}.tv-branches{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%}.tv-branch{padding:16px;border-radius:14px;border:1px solid #cbd5e1;background:#f8fafc}.tv-branch b{display:block;margin-bottom:6px;color:#115e59}
  .tv-caption{padding:14px 18px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:.88rem;color:#334155}.tv-caption strong{color:#0f766e}
  .visual-card.is-illustrated,.course-illustration{display:none!important}
  @media(max-width:760px){.tv-pillars,.tv-timeline{grid-template-columns:1fr 1fr;gap:12px}.tv-timeline:before{display:none}.tv-grid,.tv-compare,.tv-branches{grid-template-columns:1fr}.tv-flow{flex-direction:column}.tv-arrow{transform:rotate(90deg)}.tv-scene{min-height:330px}.tv-callout{max-width:165px}.teaching-visual__body{padding:16px}}
  `;

  const modes = ['hero','pillars','timeline','scene','compare','flow','scenario','process','decision','scene'];

  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sentence = text => esc((text || '').replace(/\s+/g,' ').trim());

  function titleOf(slide){ return slide.querySelector('h2')?.textContent.replace(/^Slide\s+\d+\s*:\s*/i,'').trim() || 'Client Rights in Practice'; }
  function sourceText(slide){
    const visual = slide.querySelector('.visual-text p');
    const paragraphs = [...slide.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean);
    return visual?.textContent.trim() || paragraphs[0] || 'Use respectful, person-centered support that protects the individual’s rights.';
  }

  function header(label,type){return `<div class="teaching-visual__head"><strong>${esc(label)}</strong><span class="teaching-visual__type">${esc(type)}</span></div>`;}
  function caption(label,text){return `<div class="tv-caption"><strong>${esc(label)}</strong> ${sentence(text)}</div>`;}

  function hero(title,text){return `${header('Course Focus','Hero learning graphic')}<div class="teaching-visual__body"><div class="tv-pillars"><div class="tv-pillar"><span>🧭</span><b>Autonomy</b></div><div class="tv-pillar"><span>🤝</span><b>Dignity</b></div><div class="tv-pillar"><span>🔒</span><b>Privacy</b></div><div class="tv-pillar"><span>🛡️</span><b>Advocacy</b></div><h4 style="grid-column:1/-1;text-align:center;margin-top:8px">${esc(title)}</h4></div></div>${caption('Learning connection:',text)}`;}
  function pillars(title,text){return `${header('Four Core Competencies','Professional infographic')}<div class="teaching-visual__body"><div class="tv-pillars"><div class="tv-pillar"><span>💬</span><b>Listen</b></div><div class="tv-pillar"><span>🗳️</span><b>Offer Choice</b></div><div class="tv-pillar"><span>✅</span><b>Verify Consent</b></div><div class="tv-pillar"><span>📣</span><b>Advocate</b></div></div></div>${caption('Why this matters:',text)}`;}
  function timeline(title,text){return `${header('How Practice Changed','Historical timeline')}<div class="teaching-visual__body"><div class="tv-timeline"><div class="tv-step"><i>1</i><b>Control</b><small>Staff-directed routines</small></div><div class="tv-step"><i>2</i><b>Rights</b><small>Recognition of civil rights</small></div><div class="tv-step"><i>3</i><b>Community</b><small>Home and community inclusion</small></div><div class="tv-step"><i>4</i><b>Partnership</b><small>Person-directed support</small></div></div></div>${caption('Key lesson:',text)}`;}
  function scene(title,text,index){const confidentiality=/privacy|confidential|hipaa|record|information/i.test(title+' '+text);const dignity=/dignity|respect|knock|dress|personal care/i.test(title+' '+text);let calls=confidentiality?['Verify authorization','Check consent documentation','Contact the supervisor before release']:dignity?['Knock and wait','Explain each step','Protect privacy and participation']:['Meet at eye level','Offer meaningful choices','Wait for the person’s response'];return `${header(index%2?'Notice the Interaction':'Correct Practice','Annotated human scene')}<div class="teaching-visual__body"><div class="tv-scene"><div class="tv-room"></div><div class="tv-person client"></div><div class="tv-person dsp"></div><div class="tv-callout one"><b>1. ${esc(calls[0])}</b>The DSP begins with respect rather than assumption.</div><div class="tv-callout two"><b>2. ${esc(calls[1])}</b>The person receives clear information and an opportunity to participate.</div><div class="tv-callout three"><b>3. ${esc(calls[2])}</b>The least restrictive, rights-protecting response is used.</div></div></div>${caption('What is happening?',text)}`;}
  function compare(title,text){return `${header('Correct Practice vs. Incorrect Practice','Split-screen comparison')}<div class="teaching-visual__body"><div class="tv-compare"><div class="tv-side bad"><h4>✕ Incorrect Practice</h4><ul><li>Assumes instead of asking</li><li>Uses staff convenience as the priority</li><li>Rushes or speaks over the person</li><li>Shares information without verification</li></ul></div><div class="tv-side good"><h4>✓ Correct Practice</h4><ul><li>Explains the situation clearly</li><li>Offers meaningful choices</li><li>Waits for informed participation</li><li>Documents and escalates appropriately</li></ul></div></div></div>${caption('Apply it to this lesson:',text)}`;}
  function flow(title,text){return `${header('Rights-Protecting Response','Workflow diagram')}<div class="teaching-visual__body"><div class="tv-flow"><div class="tv-flow__step"><b>1. Pause</b>Do not act on assumption</div><span class="tv-arrow">→</span><div class="tv-flow__step"><b>2. Explain</b>Use plain language</div><span class="tv-arrow">→</span><div class="tv-flow__step"><b>3. Ask</b>Obtain the person’s input</div><span class="tv-arrow">→</span><div class="tv-flow__step"><b>4. Act</b>Use the least restrictive option</div><span class="tv-arrow">→</span><div class="tv-flow__step"><b>5. Record</b>Document and report</div></div></div>${caption('Use this workflow when:',text)}`;}
  function scenario(title,text){return `${header('Clinical Scenario','Guided practice')}<div class="teaching-visual__body"><div class="tv-grid"><div class="tv-card"><b>Situation</b>${sentence(text)}</div><div class="tv-card"><b>DSP Responsibility</b>Pause, protect immediate safety, explain options, and involve the person.</div><div class="tv-card"><b>Rights Check</b>Is the action respectful, authorized, necessary, and least restrictive?</div><div class="tv-card"><b>Next Step</b>Document objective facts and contact the correct supervisor or reporting authority.</div></div></div>${caption('Professional judgment:',`The goal is not merely to complete a task. The goal is to protect rights while providing safe support.`)}`;}
  function process(title,text){return `${header('Person-Centered Support Process','Illustrated process map')}<div class="teaching-visual__body"><div class="tv-timeline"><div class="tv-step"><i>1</i><b>Observe</b><small>Notice preferences and communication</small></div><div class="tv-step"><i>2</i><b>Ask</b><small>Invite meaningful participation</small></div><div class="tv-step"><i>3</i><b>Support</b><small>Provide only needed assistance</small></div><div class="tv-step"><i>4</i><b>Review</b><small>Confirm the person is satisfied</small></div></div></div>${caption('Practice standard:',text)}`;}
  function decision(title,text){return `${header('What Should the DSP Do?','Decision tree')}<div class="teaching-visual__body"><div class="tv-decision"><div class="tv-question">Is there an immediate danger or a potential rights restriction?</div><div class="tv-branches"><div class="tv-branch"><b>Immediate danger: YES</b>Protect the person, call emergency support when required, notify supervision, and document facts.</div><div class="tv-branch"><b>Immediate danger: NO</b>Pause, explain choices, verify consent or authorization, and use the least restrictive solution.</div></div><div class="tv-question">When uncertain: stop and escalate—never guess with another person’s rights.</div></div></div>${caption('Apply the decision:',text)}`;}

  function render(mode,title,text,index){
    const map={hero,pillars,timeline,scene,compare,flow,scenario,process,decision};
    return (map[mode] || scene)(title,text,index);
  }

  function enhance(){
    if(document.documentElement.dataset.shCapVisuals==='ready') return;
    document.documentElement.dataset.shCapVisuals='ready';
    const style=document.createElement('style');style.id='sh-cap-101-instructional-styles';style.textContent=styles;document.head.appendChild(style);
    const slides=[...document.querySelectorAll('.slide-pane')];
    slides.slice(0,50).forEach((slide,index)=>{
      const anchor=slide.querySelector('.visual-card,.course-illustration');
      if(!anchor) return;
      const title=titleOf(slide),text=sourceText(slide),mode=modes[index%10];
      const visual=document.createElement('section');visual.className=`teaching-visual teaching-visual--${mode}`;visual.setAttribute('aria-label',`${title} instructional visual`);visual.innerHTML=render(mode,title,text,index);
      anchor.insertAdjacentElement('afterend',visual);
      anchor.classList.add('is-illustrated');
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,120));
  else setTimeout(enhance,120);
  new MutationObserver(()=>{if(!document.documentElement.dataset.shCapVisuals) enhance();}).observe(document.documentElement,{childList:true,subtree:true});
})();
