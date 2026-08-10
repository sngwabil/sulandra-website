import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-business-path-uat.spec.mjs');
let source=await readFile(target,'utf8');

function replaceExact(from,to,label){
  if(source.includes(to))return;
  if(!source.includes(from))throw new Error(`Round-twenty business UAT anchor missing: ${label}`);
  source=source.replace(from,to);
}

replaceExact(
  "const intakesRail=page.locator('[data-rail=\"intakes\"]');if(await intakesRail.isVisible().catch(()=>false))await intakesRail.click();await clickVisible(page,'[data-open-episode]');await expect.poll(()=>state.episode).toBe(true);",
  "const intakesRail=page.locator('[data-rail=\"intakes\"]');await expect(intakesRail).toBeVisible();await intakesRail.click();await expect(page.locator('#intakesRail')).toBeVisible();const openEpisodeButton=page.locator('#intakesRail [data-open-episode]').first();await expect(openEpisodeButton).toBeVisible();await openEpisodeButton.click();await expect.poll(()=>state.episode).toBe(true);",
  'Home Health visible Intakes rail before Open Episode',
);

await writeFile(target,source,'utf8');
console.log('Applied round-twenty business UAT correction: Home Health opens an episode only after the visible Intakes rail is active.');
