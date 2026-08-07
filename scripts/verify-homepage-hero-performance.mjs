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
if (!source.includes('data-hero-first-paint="20260807-v4"')) {
  throw new Error('Homepage final static output is missing the first-paint hardening marker.');
}
if (!source.includes('<div class="hero-first-paint"') || !source.includes('<svg viewBox="0 0 1200 700"')) {
  throw new Error('Homepage is missing the inline DOM SVG that must paint before network images.');
}
if (!source.includes('id="hero-first-paint-hardening"')) {
  throw new Error('Homepage is missing final-output hero first-paint CSS.');
}
if (!source.includes('.hero-overlay{z-index:2;background:rgba(0,0,0,.14)!important')) {
  throw new Error('Homepage first paint is still using an overly dark overlay.');
}
if (!source.includes(`class="hero-slide-image" src="${first}"`) || !source.includes('fetchpriority="high" loading="eager"')) {
  throw new Error('Homepage first hero photograph is not rendered as an eager high-priority image.');
}
if (!source.includes("onload=\"this.closest('.hero').classList.add('hero-image-ready')\"")) {
  throw new Error('Homepage first image does not promote the loaded-photo state immediately.');
}
if (!source.includes('data-bg="https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8')) {
  throw new Error('Homepage second slide is not deferred.');
}
if (!source.includes('warmRemainingHeroSlides')) {
  throw new Error('Homepage deferred slideshow warmup logic is missing.');
}

console.log('Homepage hero first paint verified: inline DOM artwork is visible before network activity, primary photo is eager, and later slides are deferred.');
