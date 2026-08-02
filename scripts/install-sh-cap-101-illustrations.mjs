import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const coursePath = path.join(repoRoot, 'courses', 'sh-cap-101.html');
const assetDir = path.join(repoRoot, 'courses', 'assets', 'sh-cap-101');
fs.mkdirSync(assetDir, { recursive: true });

const slides = [
  ['Sulandra Health Academy','A welcoming home, dignity, safety and independence','🏛️'],
  ['Core Competencies','Autonomy, dignity, safety and active advocacy','🎯'],
  ['Historical Institutional Model','Rigid schedules and loss of individuality','📜'],
  ['Psychological Impact','How removed choices can create dependency','📉'],
  ['The Paradigm Shift','From doing for to doing with','✨'],
  ['Daily Autonomy','Personal direction and meaningful choices','🧭'],
  ['Independence Facilitation','Coaching skills instead of taking over','🤝'],
  ['Support Progression','Listen, honor, facilitate and advocate','🔄'],
  ['Active Listening','Patient, respectful communication','👂'],
  ['Flexible Routines','The person’s rhythm guides support','⏰'],
  ['Dignity of Risk','Balancing safety with ordinary freedom','⚖️'],
  ['Respectful Language','Words that preserve identity and dignity','💬'],
  ['A True Home','Belonging, comfort and personal expression','🏡'],
  ['Daily Choices','Small decisions build personal agency','☕'],
  ['Foundations Review','Person-centered principles in practice','✅'],
  ['Statutory Rights','Legal protections guide every shift','⚖️'],
  ['Dignity and Individuality','Courtesy, identity and adult respect','🌟'],
  ['Privacy and Personal Space','Knock, ask and protect private care','🚪'],
  ['Health and Nutrition Access','Timely care and informed support','🥗'],
  ['Communication and Property','Private communication and possessions','📱'],
  ['Community and Belonging','Relationships, faith, work and growth','🤝'],
  ['Consent and Refusal','Understandable information and free choice','📋'],
  ['Freedom from Restraint','Least restrictive, lawful support','⛓️'],
  ['Confidentiality','Secure records and authorized disclosure','🔒'],
  ['Rights-Driven Support','Replace convenience rules with teaching','⚖️'],
  ['Restriction Audit','Identify hidden limits in daily operations','🔍'],
  ['Guardians and Advocates','Keep the individual’s voice central','👥'],
  ['Grievance and Due Process','Safe complaints without retaliation','📬'],
  ['Mandatory Reporting','Protect immediately and report promptly','🚨'],
  ['Legal Compliance Review','Rights apply in ordinary routines','✅'],
  ['Implicit Bias','Examine automatic assumptions','🧊'],
  ['Recognizing Ableism','Reject infantilization and low expectations','🛑'],
  ['Expectations and Growth','Opportunity plus support builds skills','📈'],
  ['Cultural Humility','Curiosity, reflection and lifelong learning','🌱'],
  ['Direct Communication','Address the person and support AAC','🗣️'],
  ['Emotional Regulation','Separate staff stress from client needs','🪞'],
  ['Diversity and Inclusion','Honor identities, traditions and beliefs','🌍'],
  ['Professional Reflection','Review decisions and welcome feedback','📓'],
  ['Peer Intervention','Protect the person and coach respectfully','💬'],
  ['Mindset Integration','Turn awareness into changed behavior','✅'],
  ['Active Advocacy','Remove barriers while preserving voice','🛡️'],
  ['Build a Bridge','Move from “no” to safe problem-solving','🌉'],
  ['Community Art Class','Creative access and transportation planning','🎨'],
  ['Team Problem-Solving','Bring facts, preferences and solutions','📊'],
  ['Self-Advocacy','Help individuals speak for themselves','🌱'],
  ['Team Conflict Mitigation','Use rights, goals and objective data','⚖️'],
  ['Prevent Advocacy Fatigue','Teamwork, boundaries and recovery','🏮'],
  ['Course Synthesis','Connect rights, bias and advocacy','🗺️'],
  ['Post-Test Readiness','Fifteen questions and an 80% requirement','📝'],
  ['Final Case Review','Verify authorization before disclosure','🔐']
];

const esc = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

slides.forEach(([title, subtitle, icon], index) => {
  const n = index + 1;
  const accentX = 80 + ((n * 73) % 720);
  const accentY = 70 + ((n * 47) % 260);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="title desc">
<title id="title">Slide ${n}: ${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecfeff"/><stop offset="0.55" stop-color="#f0fdfa"/><stop offset="1" stop-color="#fff7ed"/></linearGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#14b8a6"/></linearGradient>
  <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-opacity="0.18"/></filter>
</defs>
<rect width="1200" height="675" rx="36" fill="url(#bg)"/>
<circle cx="${accentX}" cy="${accentY}" r="150" fill="#99f6e4" opacity="0.28"/>
<circle cx="1040" cy="100" r="120" fill="#fbbf24" opacity="0.16"/>
<path d="M0 530 C260 430 390 660 650 535 C850 440 980 470 1200 390 V675 H0Z" fill="#0f766e" opacity="0.08"/>
<g filter="url(#shadow)"><rect x="70" y="70" width="1060" height="535" rx="30" fill="#ffffff" opacity="0.96"/></g>
<rect x="70" y="70" width="18" height="535" rx="9" fill="url(#brand)"/>
<g transform="translate(150 145)">
  <circle cx="125" cy="125" r="112" fill="url(#brand)"/>
  <circle cx="125" cy="125" r="92" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.55"/>
  <text x="125" y="158" text-anchor="middle" font-size="92" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${icon}</text>
</g>
<text x="445" y="190" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#0f766e" letter-spacing="2">SULANDRA HEALTH TRAINING ACADEMY</text>
<text x="445" y="270" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800" fill="#134e4a">${esc(title)}</text>
<foreignObject x="445" y="300" width="610" height="150"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Arial,sans-serif;font-size:28px;line-height:1.4;color:#475569;font-weight:500">${esc(subtitle)}</div></foreignObject>
<g transform="translate(445 485)"><rect width="405" height="58" rx="29" fill="#ccfbf1"/><text x="202" y="38" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#115e59">SH-CAP-101 • SLIDE ${n} OF 50</text></g>
</svg>`;
  fs.writeFileSync(path.join(assetDir, `slide-${String(n).padStart(2,'0')}.svg`), svg);
});

let html = fs.readFileSync(coursePath, 'utf8');
const marker = 'SH_CAP_101_ILLUSTRATIONS_V1';
if (!html.includes(marker)) {
  const css = `\n/* ${marker} */\n.course-illustration{margin:20px 0 28px}.course-illustration img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:14px;box-shadow:0 10px 28px rgba(15,118,110,.16);border:1px solid #99f6e4}.course-illustration figcaption{margin-top:8px;color:#64748b;font-size:.82rem;line-height:1.45}.visual-card.is-illustrated{display:none}@media(max-width:700px){.course-illustration{margin:16px 0 22px}.course-illustration img{border-radius:10px}}\n`;
  html = html.replace('</style>', `${css}</style>`);
  const enhancer = `\n<script data-enhancement="${marker}">\n(function(){\n function enhance(){\n  for(let n=1;n<=50;n++){\n   const slide=document.getElementById('slide-'+n); if(!slide||slide.dataset.illustrated==='1') continue;\n   const card=slide.querySelector('.visual-card');\n   const h2=slide.querySelector('h2');\n   const caption=card?.querySelector('.visual-text p')?.textContent || 'Sulandra Health educational illustration for this lesson.';\n   const title=card?.querySelector('.visual-text h4')?.textContent?.replace(/^Visual Illustration:\\s*/,'') || h2?.textContent || ('Slide '+n);\n   const fig=document.createElement('figure'); fig.className='course-illustration';\n   const img=document.createElement('img'); img.src='/courses/assets/sh-cap-101/slide-'+String(n).padStart(2,'0')+'.svg'; img.alt=title; img.loading=n<3?'eager':'lazy'; img.decoding='async';\n   const fc=document.createElement('figcaption'); fc.textContent=caption; fig.append(img,fc);\n   if(card){card.before(fig);card.classList.add('is-illustrated');}else if(h2){h2.after(fig);}else{slide.prepend(fig);}\n   slide.dataset.illustrated='1';\n  }\n }\n document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,0));\n const observer=new MutationObserver(enhance); observer.observe(document.documentElement,{childList:true,subtree:true});\n setTimeout(enhance,50);\n})();\n</script>\n`;
  html = html.replace('</body>', `${enhancer}</body>`);
  fs.writeFileSync(coursePath, html);
}

console.log(`Installed ${slides.length} SH-CAP-101 illustrations and linked them to the course.`);
