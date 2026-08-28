import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'dist-web', 'index.html');
const first = 'https://images.unsplash.com/photo-1581578731548-c64695ce6958?auto=format&fit=crop&w=1200&q=72&fm=webp';
let source = await readFile(target, 'utf8');

const hardeningStyle = `<style id="hero-first-paint-hardening">
.hero{background:#d99a73!important}
.hero-first-paint{position:absolute;inset:0;z-index:0;display:block;overflow:hidden;background:#d99a73}
.hero-first-paint svg{display:block;width:100%;height:100%}
.hero-slideshow,.hero-slide{z-index:1}
.hero-slide-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:1!important}
.hero-overlay{z-index:2;background:rgba(0,0,0,.14)!important;transition:background .24s ease}
.hero.hero-image-ready .hero-overlay{background:rgba(0,0,0,.46)!important}
.hero-content{z-index:3!important}
</style>`;

const firstPaintMarkup = `<div class="hero-first-paint" aria-hidden="true">
<svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <linearGradient id="fp-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#efe2d6"/><stop offset=".43" stop-color="#efb38b"/><stop offset=".76" stop-color="#cf7858"/><stop offset="1" stop-color="#78564b"/>
    </linearGradient>
    <radialGradient id="fp-sun" cx="72%" cy="34%" r="38%">
      <stop offset="0" stop-color="#fff8d8"/><stop offset=".36" stop-color="#ffd4a0" stop-opacity=".78"/><stop offset="1" stop-color="#ffd4a0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fp-ground" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#74564b"/><stop offset=".52" stop-color="#9b6b55"/><stop offset="1" stop-color="#5a4540"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="700" fill="url(#fp-sky)"/>
  <rect width="1200" height="700" fill="url(#fp-sun)"/>
  <path d="M0 482 C170 430 330 500 505 458 C690 414 888 489 1200 438 L1200 700 L0 700Z" fill="url(#fp-ground)"/>
  <path d="M0 510 C220 470 380 530 600 493 C790 462 1015 520 1200 477" fill="none" stroke="#f3c5a7" stroke-opacity=".42" stroke-width="9"/>
  <g fill="#2e2928">
    <circle cx="545" cy="265" r="45"/><path d="M501 310 Q546 287 591 311 L614 510 Q558 538 490 510Z"/>
    <path d="M518 494 L486 676 L535 676 L563 515Z"/><path d="M574 510 L596 676 L644 676 L609 493Z"/>
    <circle cx="690" cy="324" r="31"/><path d="M659 356 Q691 340 725 359 L738 495 Q697 516 651 493Z"/>
    <path d="M667 486 L646 634 L682 634 L704 496Z"/><path d="M711 495 L724 634 L760 634 L738 484Z"/>
    <path d="M583 361 Q631 382 669 370 L678 390 Q630 405 576 382Z"/>
  </g>
  <g fill="#ffffff" opacity=".22"><circle cx="976" cy="143" r="110"/><circle cx="1040" cy="105" r="46"/></g>
</svg>
</div>`;

source = source.replace(/\s*<style id="hero-first-paint-hardening">[\s\S]*?<\/style>\s*/g, '\n');
source = source.replace(/\s*<div class="hero-first-paint"[\s\S]*?<\/svg>\s*<\/div>\s*/g, '\n');
source = source.replace('</head>', `${hardeningStyle}\n</head>`);

const heroAnchor = '<section class="hero" aria-labelledby="hero-title">';
if (!source.includes(heroAnchor)) throw new Error('Homepage hero section was not found in dist-web/index.html.');
source = source.replace(heroAnchor, `<section class="hero" aria-labelledby="hero-title" data-hero-first-paint="20260807-v4">\n      ${firstPaintMarkup}`);

// Guarantee the first photograph is a real eager image, but never hide the inline SVG while it downloads.
const oldFirstBackground = new RegExp(`<div class="hero-slide active" style="background-image:url\\(['\"]https://images\\.unsplash\\.com/photo-1581578731548-c64695ce6958[^'\"]*['\"]\\)"><\\/div>`);
source = source.replace(oldFirstBackground, `<div class="hero-slide active"><img class="hero-slide-image" src="${first}" alt="" fetchpriority="high" loading="eager" decoding="async" onload="this.closest('.hero').classList.add('hero-image-ready')"></div>`);

source = source.replace(/<img class="hero-slide-image"([^>]*?)>/, (match, attrs) => {
  let revised = attrs;
  if (!/fetchpriority=/.test(revised)) revised += ' fetchpriority="high"';
  if (!/loading=/.test(revised)) revised += ' loading="eager"';
  if (!/decoding=/.test(revised)) revised += ' decoding="async"';
  if (!/onload=/.test(revised)) revised += ' onload="this.closest(\'.hero\').classList.add(\'hero-image-ready\')"';
  return `<img class="hero-slide-image"${revised}>`;
});

await writeFile(target, source, 'utf8');
console.log('Homepage hero final output hardened: inline SVG scene paints before any network image and the remote photograph never exposes a blank dark panel.');

// Publish the two navigation/data-scope repairs after all normal static installers
// have run, then let the global SIA installer remain the last HTML mutation.
await import('./fix-owner-onboarding-pay-benefits.mjs');

// Apply the grounded IT Agent state renderer after dist-web exists so the live
// static publication distinguishes approval, PR-open/in-progress, completed,
// retrying, and failed work instead of calling every response a success.
await import('./fix-it-agent-grounded-results.mjs');

// This is deliberately the final static-page mutation in build:web. Publish the
// same authenticated Ask SIA copilot drawer after all other HTML finalizers so
// every Sulandra HTML destination receives one stable shared assistant surface.
await import('./install-global-sia-copilot.mjs');