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
const dragAfter = `async function drag(page, locator, dx, dy, anchorX = 0.5, anchorY = 0.5) {
  const box = await locator.boundingBox();
  assert(box, 'Resize handle is not visible');
  const x = box.x + box.width * anchorX;
  const y = box.y + box.height * anchorY;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}`;

if (!source.includes(dragBefore) && !source.includes(dragAfter)) {
  throw new Error('E2E drag helper contract changed');
}
source = source.replace(dragBefore, dragAfter);

const verticalBefore = "await drag(page, page.locator('.scb-term-divider-v'), 70, 0);";
const verticalAfter = "await drag(page, page.locator('.scb-term-divider-v'), 70, 0, 0.5, 0.25);";
const horizontalBefore = "await drag(page, page.locator('.scb-term-divider-h'), 0, 55);";
const horizontalAfter = "await drag(page, page.locator('.scb-term-divider-h'), 0, 55, 0.75, 0.5);";

if (!source.includes(verticalBefore) && !source.includes(verticalAfter)) {
  throw new Error('Vertical divider E2E contract changed');
}
if (!source.includes(horizontalBefore) && !source.includes(horizontalAfter)) {
  throw new Error('Horizontal divider E2E contract changed');
}
source = source.replace(verticalBefore, verticalAfter);
source = source.replace(horizontalBefore, horizontalAfter);

fs.writeFileSync(file, source, 'utf8');
console.log('Codebase E2E divider anchors moved away from the 4-way handle intersection.');
