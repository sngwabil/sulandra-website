import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'index.html');
let source = await readFile(target, 'utf8');

const firstOld = "https://images.unsplash.com/photo-1581578731548-c64695ce6958?auto=format&fit=crop&w=1500&q=80";
const secondOld = "https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?auto=format&fit=crop&w=1500&q=80";
const thirdOld = "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1500&q=80";
const first = "https://images.unsplash.com/photo-1581578731548-c64695ce6958?auto=format&fit=crop&w=1200&q=72&fm=webp";
const second = "https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?auto=format&fit=crop&w=1200&q=72&fm=webp";
const third = "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1200&q=72&fm=webp";

// Safari-safe, zero-network first-paint image. Keep this deliberately bright and
// recognizable so a slow remote photograph never looks like an empty dark rectangle.
const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8c7bd"/>
      <stop offset=".38" stop-color="#e7b18e"/>
      <stop offset=".72" stop-color="#cf7c58"/>
      <stop offset="1" stop-color="#76564b"/>
    </linearGradient>
    <radialGradient id="sun" cx="70%" cy="42%" r="38%">
      <stop offset="0" stop-color="#fff1c8" stop-opacity=".94"/>
      <stop offset=".42" stop-color="#ffd09d" stop-opacity=".56"/>
      <stop offset="1" stop-color="#ffd09d" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#493d39"/>
      <stop offset=".5" stop-color="#775a4d"/>
      <stop offset="1" stop-color="#3a3331"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="700" fill="url(#sky)"/>
  <rect width="1200" height="700" fill="url(#sun)"/>
  <path d="M0 470 C210 430 320 485 505 452 C690 420 865 472 1200 430 L1200 700 L0 700Z" fill="url(#ground)"/>
  <g fill="#342c2a" opacity=".94">
    <circle cx="565" cy="263" r="42"/>
    <path d="M522 305 Q565 284 608 305 L625 500 Q568 530 505 500Z"/>
    <path d="M535 490 L502 660 L548 660 L577 510Z"/><path d="M588 497 L606 660 L650 660 L618 488Z"/>
    <circle cx="700" cy="313" r="29"/>
    <path d="M672 342 Q702 330 731 344 L742 485 Q704 504 663 482Z"/>
    <path d="M679 478 L658 620 L693 620 L711 487Z"/><path d="M716 486 L729 620 L763 620 L742 478Z"/>
    <path d="M598 355 Q641 374 680 365 L687 383 Q640 397 594 375Z"/>
  </g>
  <g fill="#ffffff" opacity=".18"><circle cx="980" cy="150" r="95"/><circle cx="1040" cy="118" r="45"/></g>
</svg>`;
const placeholder = `data:image/svg+xml;base64,${Buffer.from(placeholderSvg).toString('base64')}`;

source = source
  .replaceAll(firstOld, first)
  .replaceAll(secondOld, second)
  .replaceAll(thirdOld, third);

const performanceHints = `
  <link rel="dns-prefetch" href="//images.unsplash.com">
  <link rel="preconnect" href="https://images.unsplash.com" crossorigin>
  <link rel="preload" as="image" href="${first}" fetchpriority="high">
`;
if (!source.includes(`rel="preload" as="image" href="${first}"`)) {
  source = source.replace('</head>', `${performanceHints}</head>`);
}

// Defer slideshow images that are not visible at first paint.
source = source.replace(
  `<div class="hero-slide" style="background-image:url('${second}')"></div>`,
  `<div class="hero-slide" data-bg="${second}"></div>`,
);
source = source.replace(
  `<div class="hero-slide" style="background-image:url('${third}')"></div>`,
  `<div class="hero-slide" data-bg="${third}"></div>`,
);

// The local data-URI scene is always visible first. The full photograph fades in only
// after its bytes have decoded; this avoids a black/gray flash on iOS Safari.
source = source.replace(
  `<div class="hero-slide active" style="background-image:url('${first}')"></div>`,
  `<div class="hero-slide active"><img class="hero-slide-image" src="${first}" alt="" fetchpriority="high" loading="eager" decoding="async"></div>`,
);

source = source.replace(
  /\.hero\{position:relative;min-height:550px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;background:[^}]*\}/,
  `.hero{position:relative;min-height:550px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;background:#cf8a67 url("${placeholder}") center/cover no-repeat}`,
);

if (!source.includes('.hero-slide-image{')) {
  source = source.replace(
    `.hero-slide{background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}`,
    `.hero-slide{background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}.hero-slide-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .28s ease}.hero.hero-image-ready .hero-slide-image{opacity:1}`,
  );
}

source = source.replace(
  `.hero-overlay{position:absolute;inset:0;background:rgba(0,0,0,.46)}`,
  `.hero-overlay{position:absolute;inset:0;background:rgba(0,0,0,.24);transition:background .28s ease}.hero.hero-image-ready .hero-overlay{background:rgba(0,0,0,.46)}`,
);

const oldSlideshow = `const slides=[...document.querySelectorAll('.hero-slide')];let current=0;if(slides.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{slides[current].classList.remove('active');current=(current+1)%slides.length;slides[current].classList.add('active')},5000)}`;
const newSlideshow = `const slides=[...document.querySelectorAll('.hero-slide')];let current=0;
    const hero=document.querySelector('.hero'),firstHeroImage=document.querySelector('.hero-slide-image');
    const markHeroReady=()=>hero?.classList.add('hero-image-ready');
    if(firstHeroImage){if(firstHeroImage.complete&&firstHeroImage.naturalWidth)markHeroReady();else firstHeroImage.addEventListener('load',markHeroReady,{once:true});}
    const hydrateHeroSlide=(slide)=>{const bg=slide?.dataset?.bg;if(!bg)return;const image=new Image();image.decoding='async';image.onload=()=>{slide.style.backgroundImage=\`url("\${bg}")\`;delete slide.dataset.bg};image.src=bg};
    const warmRemainingHeroSlides=()=>slides.slice(1).forEach((slide,index)=>setTimeout(()=>hydrateHeroSlide(slide),700+(index*700)));
    if(document.readyState==='complete')warmRemainingHeroSlides();else window.addEventListener('load',warmRemainingHeroSlides,{once:true});
    if(slides.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{const next=(current+1)%slides.length;hydrateHeroSlide(slides[next]);slides[current].classList.remove('active');current=next;slides[current].classList.add('active')},5000)}`;
if (source.includes(oldSlideshow)) source = source.replace(oldSlideshow, newSlideshow);

await writeFile(target, source, 'utf8');
console.log('Homepage hero uses a Safari-safe embedded first-paint scene, low initial overlay, eager primary photograph, and deferred later slides.');
