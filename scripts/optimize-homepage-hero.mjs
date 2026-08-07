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

source = source
  .replaceAll(firstOld, first)
  .replaceAll(secondOld, second)
  .replaceAll(thirdOld, third);

const performanceHints = `
  <link rel="dns-prefetch" href="//images.unsplash.com">
  <link rel="preconnect" href="https://images.unsplash.com" crossorigin>
  <link rel="preload" as="image" href="${first}" fetchpriority="high">
`;
if (!source.includes('rel="preload" as="image"') || !source.includes(first)) {
  source = source.replace('</head>', `${performanceHints}</head>`);
}

source = source.replace(
  `<div class="hero-slide" style="background-image:url('${second}')"></div>`,
  `<div class="hero-slide" data-bg="${second}"></div>`,
);
source = source.replace(
  `<div class="hero-slide" style="background-image:url('${third}')"></div>`,
  `<div class="hero-slide" data-bg="${third}"></div>`,
);

source = source.replace(
  `.hero{position:relative;min-height:550px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;background:#555}`,
  `.hero{position:relative;min-height:550px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;background:#555 url('${first}') center/cover no-repeat}`,
);

const oldSlideshow = `const slides=[...document.querySelectorAll('.hero-slide')];let current=0;if(slides.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{slides[current].classList.remove('active');current=(current+1)%slides.length;slides[current].classList.add('active')},5000)}`;
const newSlideshow = `const slides=[...document.querySelectorAll('.hero-slide')];let current=0;
    const hydrateHeroSlide=(slide)=>{const bg=slide?.dataset?.bg;if(!bg)return;const image=new Image();image.decoding='async';image.onload=()=>{slide.style.backgroundImage=\`url("\${bg}")\`;delete slide.dataset.bg};image.src=bg};
    const warmRemainingHeroSlides=()=>slides.slice(1).forEach((slide,index)=>setTimeout(()=>hydrateHeroSlide(slide),350+(index*550)));
    if(document.readyState==='complete')warmRemainingHeroSlides();else window.addEventListener('load',warmRemainingHeroSlides,{once:true});
    if(slides.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{const next=(current+1)%slides.length;hydrateHeroSlide(slides[next]);slides[current].classList.remove('active');current=next;slides[current].classList.add('active')},5000)}`;
if (source.includes(oldSlideshow)) source = source.replace(oldSlideshow, newSlideshow);

await writeFile(target, source, 'utf8');
console.log('Homepage hero optimized: first image preloaded at high priority and later slides deferred until after initial load.');
