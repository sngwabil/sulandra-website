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
if (!source.includes(`background:#555 url('${first}') center/cover no-repeat`)) {
  throw new Error('Homepage hero does not use the first image as its immediate CSS background.');
}
const eagerBackgrounds = [...source.matchAll(/class="hero-slide(?: active)?" style="background-image:/g)];
if (eagerBackgrounds.length > 1) {
  throw new Error(`Homepage eagerly requests ${eagerBackgrounds.length} slideshow images; only the first may compete with initial rendering.`);
}
if (!source.includes('data-bg="https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8')) {
  throw new Error('Homepage second slide is not deferred.');
}
if (!source.includes('warmRemainingHeroSlides')) {
  throw new Error('Homepage deferred slideshow warmup logic is missing.');
}

console.log('Homepage hero performance verified: first image is prioritized and later slides do not block initial rendering.');
