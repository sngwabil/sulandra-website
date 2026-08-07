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

// Inline lightweight image placeholder. This is painted from the HTML itself with no
// network request, so the hero never flashes as a dark empty rectangle while the real
// photograph is still crossing the network.
const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a79c94"/>
      <stop offset=".56" stop-color="#978982"/>
      <stop offset="1" stop-color="#62534d"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#65554d"/>
      <stop offset=".55" stop-color="#8b6c5b"/>
      <stop offset="1" stop-color="#4d403b"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1200" height="700" fill="url(#sky)"/>
  <ellipse cx="860" cy="275" rx="390" ry="170" fill="#d2b39d" opacity=".32" filter="url(#blur)"/>
  <rect y="470" width="1200" height="230" fill="url(#ground)"/>
  <g fill="#4a3b36" opacity=".88" filter="url(#blur)">
    <circle cx="565" cy="285" r="54"/><rect x="518" y="325" width="94" height="238" rx="40"/>
    <circle cx="690" cy="320" r="35"/><rect x="659" y="352" width="62" height="178" rx="28"/>
    <rect x="596" y="380" width="110" height="24" rx="12" transform="rotate(-11 596 380)"/>
  </g>
</svg>`;
const placeholder = `data:image/svg+xml,${encodeURIComponent(placeholderSvg)}`;

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

// Render the first photograph as an actual high-priority image element. While it is
// loading, the inline SVG placeholder below is already visible behind it.
source = source.replace(
  `<div class="hero-slide active" style="background-image:url('${first}')"></div>`,
  `<div class="hero-slide active"><img class="hero-slide-image" src="${first}" alt="" fetchpriority="high" loading="eager" decoding="async"></div>`,
);

source = source.replace(
  /\.hero\{position:relative;min-height:550px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;background:[^}]*\}/,
  `.hero{position:relative;min-height:550px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;background:#8f8178 url("${placeholder}") center/cover no-repeat}`,
);

if (!source.includes('.hero-slide-image{')) {
  source = source.replace(
    `.hero-slide{background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}`,
    `.hero-slide{background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}.hero-slide-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
  );
}

const oldSlideshow = `const slides=[...document.querySelectorAll('.hero-slide')];let current=0;if(slides.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{slides[current].classList.remove('active');current=(current+1)%slides.length;slides[current].classList.add('active')},5000)}`;
const newSlideshow = `const slides=[...document.querySelectorAll('.hero-slide')];let current=0;
    const hydrateHeroSlide=(slide)=>{const bg=slide?.dataset?.bg;if(!bg)return;const image=new Image();image.decoding='async';image.onload=()=>{slide.style.backgroundImage=\`url("\${bg}")\`;delete slide.dataset.bg};image.src=bg};
    const warmRemainingHeroSlides=()=>slides.slice(1).forEach((slide,index)=>setTimeout(()=>hydrateHeroSlide(slide),700+(index*700)));
    if(document.readyState==='complete')warmRemainingHeroSlides();else window.addEventListener('load',warmRemainingHeroSlides,{once:true});
    if(slides.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{const next=(current+1)%slides.length;hydrateHeroSlide(slides[next]);slides[current].classList.remove('active');current=next;slides[current].classList.add('active')},5000)}`;
if (source.includes(oldSlideshow)) source = source.replace(oldSlideshow, newSlideshow);

await writeFile(target, source, 'utf8');
console.log('Homepage hero optimized with an inline instant-paint image placeholder, eager first photograph, and deferred later slides.');
