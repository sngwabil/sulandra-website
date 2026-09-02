const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

const dragBefore = `async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  assert(box, 'Resize handle is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}`;
const dragAfter = `async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  assert(box, 'Resize handle is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function dragSplit(page, axis, dx, dy) {
  const host = page.locator('#itwsXtermHost');
  const box = await host.boundingBox();
  assert(box, 'Terminal split host is not visible');
  const split = await host.evaluate((node) => {
    const style = getComputedStyle(node);
    const col = Number.parseFloat(style.getPropertyValue('--scb-term-col')) || 50;
    const row = Number.parseFloat(style.getPropertyValue('--scb-term-row')) || 50;
    return { col, row };
  });
  const x = axis === 'v' ? box.x + box.width * (split.col / 100) : box.x + box.width * 0.75;
  const y = axis === 'v' ? box.y + box.height * 0.25 : box.y + box.height * (split.row / 100);
  const hit = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    return { id: node?.id || '', className: typeof node?.className === 'string' ? node.className : '', tag: node?.tagName || '' };
  }, { x, y });
  console.log('[E2E SPLIT HIT] ' + JSON.stringify({ axis, x, y, split, ...hit }));
  const expected = axis === 'v' ? 'scb-term-divider-v' : 'scb-term-divider-h';
  assert(hit.className.split(/\\s+/).includes(expected), `Expected ${expected} at visible split position; hit ${hit.className || hit.tag || 'nothing'}`);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  const during = await host.evaluate((node) => ({
    col: getComputedStyle(node).getPropertyValue('--scb-term-col').trim(),
    row: getComputedStyle(node).getPropertyValue('--scb-term-row').trim(),
    inlineCol: node.style.getPropertyValue('--scb-term-col'),
    inlineRow: node.style.getPropertyValue('--scb-term-row'),
  }));
  console.log('[E2E SPLIT DURING] ' + JSON.stringify({ axis, dx, dy, ...during }));
  await page.mouse.up();
}`;

if (!source.includes(dragBefore) && !source.includes('async function dragSplit(page, axis, dx, dy)')) {
  throw new Error('E2E drag helper contract changed');
}
source = source.replace(dragBefore, dragAfter);

const verticalBefore = "await drag(page, page.locator('.scb-term-divider-v'), 70, 0);";
const verticalAnchored = "await drag(page, page.locator('.scb-term-divider-v'), 70, 0, 0.5, 0.25);";
const verticalAfter = "await dragSplit(page, 'v', 70, 0);";
const horizontalBefore = "await drag(page, page.locator('.scb-term-divider-h'), 0, 55);";
const horizontalAnchored = "await drag(page, page.locator('.scb-term-divider-h'), 0, 55, 0.75, 0.5);";
const horizontalAfter = "await dragSplit(page, 'h', 0, 55);";

if (!source.includes(verticalBefore) && !source.includes(verticalAnchored) && !source.includes(verticalAfter)) {
  throw new Error('Vertical divider E2E contract changed');
}
if (!source.includes(horizontalBefore) && !source.includes(horizontalAnchored) && !source.includes(horizontalAfter)) {
  throw new Error('Horizontal divider E2E contract changed');
}
source = source.replace(verticalBefore, verticalAfter).replace(verticalAnchored, verticalAfter);
source = source.replace(horizontalBefore, horizontalAfter).replace(horizontalAnchored, horizontalAfter);

fs.writeFileSync(file, source, 'utf8');
console.log('Codebase E2E split drag uses terminal-host geometry and verifies the visible handle hit target.');
