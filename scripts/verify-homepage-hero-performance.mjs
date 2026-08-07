import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'dist-web', 'index.html'), 'utf8');

const first = 'https://images.unsplash.com/photo-1581578731548-c64695ce6958?auto=format&fit=crop&w=1200&q=72&fm=webp';
if (!source.includes(`rel="preload" as="image" href="${first}" fetchpriority="high"`)) {
  throw new Error('Homepage first hero image is not preloaded with high priority.');
}
if (!source.includes('rel="preconnect" href="https://images.unsplash.com"')) {
  throw new Error('Homepage is missing the Unsplash preconnect hint.');
}
if (!source.includes('data:image/svg+xml;base64,')) {
  throw new Error('Homepage hero is missing the Safari-safe embedded first-paint image.');
}
if (!source.includes(`class="hero-slide-image" src="${first}"`) || !source.includes('fetchpriority="high" loading="eager"')) {
  throw new Error('Homepage first hero photograph is not rendered as an eager high-priority image.');
}
if (!source.includes('.hero.hero-image-ready .hero-overlay{background:rgba(0,0,0,.46)}')) {
  throw new Error('Homepage does not keep the initial placeholder brighter until the real image is ready.');
}
if (!source.includes("hero?.classList.add('hero-image-ready')")) {
  throw new Error('Homepage does not promote the full hero photograph after it loads.');
}
if (source.includes('background:#555')) {
  throw new Error('Homepage still contains the retired dark hero fallback.');
}
const eagerBackgrounds = [...source.matchAll(/class="hero-slide(?: active)?" style="background-image:/g)];
if (eagerBackgrounds.length > 0) {
  throw new Error(`Homepage still eagerly requests ${eagerBackgrounds.length} slideshow background image(s); hero photographs must use the prioritized first image plus deferred data-bg slides.`);
}
if (!source.includes('data-bg="https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8')) {
  throw new Error('Homepage second slide is not deferred.');
}
if (!source.includes('warmRemainingHeroSlides')) {
  throw new Error('Homepage deferred slideshow warmup logic is missing.');
}

console.log('Homepage hero performance verified: Safari-safe embedded scene paints immediately, full image fades in when ready, and later slides are deferred.');
