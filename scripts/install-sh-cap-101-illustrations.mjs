import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const coursePath = path.join(repoRoot, 'courses', 'sh-cap-101.html');
const assetDir = path.join(repoRoot, 'courses', 'assets', 'sh-cap-101', 'photos');
fs.mkdirSync(assetDir, { recursive: true });

const photoSources = {
  communication: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1600&q=82',
  teamwork: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=82',
  meeting: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1600&q=82',
  support: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1600&q=82',
  learning: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=82',
  coaching: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1600&q=82',
  professional: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1600&q=82',
  advocacy: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1600&q=82'
};

async function installPhotos() {
  for (const [name, url] of Object.entries(photoSources)) {
    const output = path.join(assetDir, `${name}.jpg`);
    const response = await fetch(url, { headers: { 'User-Agent': 'Sulandra-Health-Course-Builder/1.0' } });
    if (!response.ok) throw new Error(`Unable to download ${name}: ${response.status}`);
    fs.writeFileSync(output, Buffer.from(await response.arrayBuffer()));
  }
}

await installPhotos();

let html = fs.readFileSync(coursePath, 'utf8');
const marker = 'SH_CAP_101_ILLUSTRATIONS_V1';

const css = `
/* ${marker} */
body.presentation-ready{background:linear-gradient(135deg,#e6fffb 0%,#f8fafc 48%,#fff7ed 100%)}
.portal-wrapper{position:relative;isolation:isolate}
.slide-pane.active{animation:deckEnter .55s cubic-bezier(.2,.8,.2,1)}
@keyframes deckEnter{from{opacity:0;transform:translateX(28px) scale(.985)}to{opacity:1;transform:none}}
.content-pane{scroll-behavior:smooth}
.slide-pane h2,.slide-pane h3,.slide-pane p,.slide-pane li{overflow-wrap:anywhere;word-break:normal}
.course-illustration{position:relative;margin:22px 0 30px;border-radius:18px;overflow:hidden;background:#0f172a;box-shadow:0 18px 45px rgba(15,23,42,.2);border:1px solid rgba(15,118,110,.28)}
.course-illustration img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;transform:scale(1.01);transition:transform 8s ease}
.slide-pane.active .course-illustration img{transform:scale(1.08)}
.course-illustration::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 42%,rgba(2,6,23,.86) 100%);pointer-events:none}
.course-illustration figcaption{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:30px 26px 20px;color:#fff;font-size:.96rem;line-height:1.45;font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,.55)}
.course-illustration .photo-label{display:block;margin-bottom:5px;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;color:#99f6e4}
.visual-card.is-illustrated{display:none}
.deck-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.deck-action{border:1px solid #0f766e;background:#fff;color:#0f766e;padding:8px 12px;border-radius:7px;font-weight:700;cursor:pointer}
.deck-action.active,.deck-action:hover{background:#0f766e;color:#fff}
body.course-presenting{padding:0;background:#020617}
body.course-presenting .portal-wrapper{max-width:none;width:100vw;height:100vh;border-radius:0}
body.course-presenting .content-pane{max-height:none;min-height:0;flex:1;display:flex;align-items:center}
body.course-presenting .slide-pane.active{width:min(1200px,100%);margin:auto}
body.course-presenting .deck-nav-bar,body.course-presenting .lms-footer{padding-left:4vw;padding-right:4vw}
@media(max-width:700px){.course-illustration{margin:16px 0 22px;border-radius:12px}.course-illustration figcaption{padding:40px 16px 14px;font-size:.82rem}.deck-actions{width:100%}.deck-action{flex:1}}
@media print{.course-illustration{box-shadow:none}.course-illustration::after{display:none}.course-illustration figcaption{position:static;color:#334155;text-shadow:none;background:#f8fafc}}
`;

if (/\/\* SH_CAP_101_ILLUSTRATIONS_V1 \*\/[\s\S]*?(?=<\/style>)/.test(html)) {
  html = html.replace(/\/\* SH_CAP_101_ILLUSTRATIONS_V1 \*\/[\s\S]*?(?=<\/style>)/, css);
} else {
  html = html.replace('</style>', `${css}</style>`);
}

const enhancer = `
<script data-enhancement="${marker}">
(function(){
 const photoMap={
  communication:new Set([1,2,9,12,20,22,24,35,36]),
  teamwork:new Set([8,21,27,34,37,38,39,44,46]),
  meeting:new Set([16,17,28,29,30,41,42,45,48,49]),
  support:new Set([3,4,5,6,10,11,13,14,15,18,19,23,25,26,31,32,33]),
  learning:new Set([7,40]),
  coaching:new Set([43,47]),
  professional:new Set([]),
  advocacy:new Set([50])
 };
 function photoFor(n){for(const [name,set] of Object.entries(photoMap))if(set.has(n))return name;return ['support','communication','teamwork','meeting'][n%4];}
 function enhanceSlides(){
  for(let n=1;n<=50;n++){
   const slide=document.getElementById('slide-'+n);if(!slide||slide.dataset.photoEnhanced==='1')continue;
   const card=slide.querySelector('.visual-card');const h2=slide.querySelector('h2');
   const title=card?.querySelector('.visual-text h4')?.textContent?.replace(/^Visual Illustration:\s*/,'')||h2?.textContent||('Slide '+n);
   const caption=card?.querySelector('.visual-text p')?.textContent||'A realistic human-centered support scene demonstrating this lesson in practice.';
   const fig=document.createElement('figure');fig.className='course-illustration';
   const img=document.createElement('img');img.src='/courses/assets/sh-cap-101/photos/'+photoFor(n)+'.jpg';img.alt=title;img.loading=n<=3?'eager':'lazy';img.decoding='async';
   const fc=document.createElement('figcaption');fc.innerHTML='<span class="photo-label">Real-world practice</span>'+caption;
   fig.append(img,fc);if(card){card.before(fig);card.classList.add('is-illustrated');}else if(h2){h2.after(fig);}else{slide.prepend(fig);}slide.dataset.photoEnhanced='1';
  }
 }
 function addPresentationControls(){
  const nav=document.querySelector('.deck-nav-bar');if(!nav||nav.querySelector('.deck-actions'))return;
  const actions=document.createElement('div');actions.className='deck-actions';
  const present=document.createElement('button');present.type='button';present.className='deck-action';present.textContent='Present';
  const auto=document.createElement('button');auto.type='button';auto.className='deck-action';auto.textContent='Auto Play';let timer=null;
  present.addEventListener('click',async()=>{document.body.classList.toggle('course-presenting');present.classList.toggle('active',document.body.classList.contains('course-presenting'));if(document.body.classList.contains('course-presenting')&&document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();}catch(e){}}else if(document.fullscreenElement){try{await document.exitFullscreen();}catch(e){}}});
  auto.addEventListener('click',()=>{if(timer){clearInterval(timer);timer=null;auto.classList.remove('active');auto.textContent='Auto Play';return;}auto.classList.add('active');auto.textContent='Stop Auto Play';timer=setInterval(()=>{const next=document.getElementById('next-btn');if(!next||next.style.display==='none'||next.disabled){clearInterval(timer);timer=null;auto.classList.remove('active');auto.textContent='Auto Play';return;}next.click();},10000);});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){document.body.classList.remove('course-presenting');present.classList.remove('active');}});
  actions.append(present,auto);nav.append(actions);
 }
 function enhance(){document.body.classList.add('presentation-ready');enhanceSlides();addPresentationControls();}
 document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,0));new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});setTimeout(enhance,80);
})();
</script>
`;

const scriptPattern = new RegExp('<script data-enhancement="' + marker + '">[\\s\\S]*?<\\/script>');
if (scriptPattern.test(html)) html = html.replace(scriptPattern, enhancer);
else html = html.replace('</body>', `${enhancer}</body>`);

fs.writeFileSync(coursePath, html);
console.log('Installed real-person training photography and PowerPoint-style presentation controls for SH-CAP-101.');
