import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'dist-web', 'admin.html');
let html = await readFile(adminPath, 'utf8');

html = html.replace(/\s*<!-- modern-admin-shell:start -->[\s\S]*?<!-- modern-admin-shell:end -->\s*/g, '\n');
for (const asset of [
  'admin-live-dashboard',
  'sulandra-enterprise-owner',
  'admin-service-home-management-v2',
  'admin-platform-routing',
  'admin-dashboard-cleanup',
]) {
  html = html.replace(new RegExp(`\\s*<script[^>]+src=["']\\/assets\\/${asset}\\.js[^>]*><\\/script>\\s*`, 'g'), '\n');
}

if (!/http-equiv=["']Cache-Control["']/i.test(html)) {
  html = html.replace('</head>', '  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">\n</head>');
}

const shell = `
<!-- modern-admin-shell:start -->
<style id="modern-admin-shell-styles">
html,body{width:100%;max-width:none;margin:0;padding:0;overflow-x:hidden}
body{min-height:100vh}
.sulandra-platform-bar{width:100%;height:58px;background:#083a67;color:#fff;border-bottom:4px solid #d4a72c;display:flex;align-items:center;gap:16px;padding:0 clamp(12px,2vw,28px);font-family:Segoe UI,Arial,sans-serif;position:relative;z-index:1250;overflow:hidden}
.sulandra-platform-title{font-weight:900;font-size:17px;white-space:nowrap;flex:0 0 auto}.sulandra-news-window{position:relative;overflow:hidden;flex:1;height:100%;display:flex;align-items:center;mask-image:linear-gradient(90deg,transparent 0,#000 3%,#000 97%,transparent 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 3%,#000 97%,transparent 100%)}
.sulandra-news-track{display:flex;align-items:center;width:max-content;min-width:max-content;white-space:nowrap;will-change:transform;animation:sulandraNewsTicker 70s linear infinite}.sulandra-news-window:hover .sulandra-news-track{animation-play-state:paused}.sulandra-news-item{display:inline-flex;align-items:center;gap:9px;color:#fff;text-decoration:none;font-weight:750;font-size:14px;padding-right:42px}.sulandra-news-item:before{content:'●';color:#22c55e;font-size:9px}.sulandra-news-source{font-size:11px;font-weight:700;opacity:.72;margin-left:2px}.sulandra-news-label{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#bfeaff;white-space:nowrap;flex:0 0 auto}
@keyframes sulandraNewsTicker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.pulse-dot{animation:sulandraLiveBlink 1.15s ease-in-out infinite!important;transform-origin:center}
@keyframes sulandraLiveBlink{0%,100%{opacity:1;box-shadow:0 0 0 4px rgba(34,197,94,.16),0 0 14px rgba(34,197,94,.8)}50%{opacity:.28;box-shadow:0 0 0 9px rgba(34,197,94,.04),0 0 2px rgba(34,197,94,.2)}}
.weather-mini-clock{position:absolute;right:112px;top:23px;text-align:right;color:#fff;line-height:1.08;text-shadow:0 1px 3px rgba(0,0,0,.18);pointer-events:none}.weather-mini-clock strong{display:block;font-size:20px;font-weight:950;letter-spacing:-.4px}.weather-mini-clock span{display:block;font-size:9px;font-weight:800;opacity:.78;text-transform:uppercase;letter-spacing:.06em;margin-top:3px}
header,.alert-bar,.main-nav,main,.top-nav,.nav-links,.container{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}.container{padding-left:clamp(12px,1.3vw,26px)!important;padding-right:clamp(12px,1.3vw,26px)!important}.top-nav{padding-left:clamp(12px,1.3vw,26px)!important;padding-right:clamp(12px,1.3vw,26px)!important}
@media(max-width:720px){.sulandra-platform-bar{height:52px;padding:0 10px;gap:10px}.sulandra-platform-title{font-size:13px}.sulandra-news-label{display:none}.sulandra-news-item{font-size:12px;padding-right:28px}.weather-mini-clock{right:105px;top:25px}.weather-mini-clock strong{font-size:16px}}
</style>
<script>
(function(){
  const NEWS_REFRESH_MS=10*60*1000;
  const NEWS_RSS='https://news.google.com/rss/search?q=Dayton%20Ohio%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen';
  const NEWS_JSON='https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(NEWS_RSS);
  const fallback=[
    {title:'Live local headlines for Dayton and the Miami Valley are loading…',link:'/news.html',source:'Sulandra News'},
    {title:'News ticker refreshes automatically as local headlines update.',link:'/news.html',source:'Live News'}
  ];
  const escapeHtml=(value)=>String(value||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const normalizeSource=(item)=>item.author||item.source||String(item.title||'').split(' - ').slice(-1)[0]||'Local News';
  const normalizeTitle=(item)=>{
    const raw=String(item.title||'Local news update').trim();
    const parts=raw.split(' - ');return parts.length>1?parts.slice(0,-1).join(' - '):raw;
  };
  function tickerMarkup(items){
    const clean=(items&&items.length?items:fallback).slice(0,12).map((item)=>({title:normalizeTitle(item),link:item.link||'/news.html',source:normalizeSource(item)}));
    const once=clean.map((item)=>'<a class="sulandra-news-item" href="'+escapeHtml(item.link)+'" target="_blank" rel="noopener"><span>'+escapeHtml(item.title)+'</span><span class="sulandra-news-source">'+escapeHtml(item.source)+'</span></a>').join('');
    return once+once;
  }
  async function loadNews(){
    const track=document.getElementById('sulandraNewsTrack');if(!track)return;
    try{
      const response=await fetch(NEWS_JSON,{cache:'no-store'});if(!response.ok)throw new Error('news unavailable');
      const data=await response.json();const items=Array.isArray(data.items)?data.items:[];
      track.innerHTML=tickerMarkup(items);
      track.style.animationDuration=Math.max(55,Math.min(125,items.length*9))+'s';
    }catch(_){track.innerHTML=tickerMarkup(fallback)}
  }
  function mount(){
    let bar=document.querySelector('.sulandra-platform-bar');
    if(!bar){bar=document.createElement('nav');bar.className='sulandra-platform-bar';bar.setAttribute('aria-label','Sulandra Health local news');document.body.insertBefore(bar,document.body.firstChild)}
    bar.innerHTML='<span class="sulandra-platform-title">Sulandra Health Platform</span><span class="sulandra-news-label">Local News</span><div class="sulandra-news-window" aria-live="polite"><div class="sulandra-news-track" id="sulandraNewsTrack">'+tickerMarkup(fallback)+'</div></div>';
    loadNews();setInterval(loadNews,NEWS_REFRESH_MS);
    installWeatherClock();
  }
  function installWeatherClock(){
    const attach=()=>{
      const weather=document.querySelector('.live-card[data-widget-id="weather"]');if(!weather)return;
      let clock=weather.querySelector('.weather-mini-clock');
      if(!clock){clock=document.createElement('div');clock.className='weather-mini-clock';clock.innerHTML='<strong>--:--</strong><span>Local time</span>';weather.appendChild(clock)}
      const value=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date());
      const valueNode=clock.querySelector('strong');
      if(valueNode&&valueNode.textContent!==value)valueNode.textContent=value;
    };
    // Do not observe DOM mutations here. Updating the clock text itself is a DOM
    // mutation; observing the entire document caused a self-triggering microtask
    // loop on Safari/iPad and could freeze Admin at "Live: connecting…".
    attach();
    setTimeout(attach,250);
    setTimeout(attach,750);
    setInterval(attach,1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
</script>
<script src="/assets/sulandra-enterprise-owner.js?v=20260808-admin-profile-owner-v1"></script>
<script src="/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v4"></script>
<script src="/assets/admin-service-home-management-v2.js?v=20260808-admin-command-center-v4"></script>
<script src="/assets/admin-platform-routing.js?v=20260808-daily-scheduling-v2"></script>
<script src="/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1"></script>
<!-- modern-admin-shell:end -->`;

html = html.replace('</body>', `${shell}\n</body>`);
await writeFile(adminPath, html, 'utf8');
console.log('Modern Sulandra Admin is canonical in dist-web with live Command Center, blinking Live status, continuously updating Dayton local-news ticker, non-blocking weather-card local clock, Service Homes, dedicated Scheduling, Time & Attendance, Employee 360 Documents/Audit routing and Spire entry.');
