import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const cssPath=path.join(repo,'assets/it-agent-workspace-preview.css');
const terminalCssPath=path.join(repo,'assets/it-agent-real-terminal.css');
const xtermCssPath=path.join(repo,'assets/it-agent-xterm-emulator.css');
const jsPath=path.join(repo,'assets/it-agent-workspace-preview.js');
for(const required of [cssPath,terminalCssPath,xtermCssPath,jsPath])if(!fs.existsSync(required))throw new Error(`Missing dockable workspace regression dependency: ${required}`);

const html=`<!doctype html><html><head><meta charset="utf-8"><title>Dockable workspace regression</title>
<style>html,body{margin:0;width:100%;min-height:1000px}#agent{width:100%}.agent-shell,.agent-main{width:100%;min-width:0}.itws-rt-head{min-height:80px}.itws-rt-modebar{min-height:44px}.itws-rt-input-switch{display:flex;align-items:center;gap:8px;min-height:58px;padding:8px}.itws-rt-foot{min-height:34px}</style>
</head><body class="it-chatgpt-workspace itws-enterprise-shell"><div id="agent"><div class="agent-shell"><main class="agent-main"><div id="itwsEngineeringTerminal"><div id="itwsRealTerminal" class="itws-real-terminal"><div class="itws-rt-head"><h2>Engineering Workspace</h2></div><div class="itws-rt-modebar"><button>Run typecheck</button></div><div class="itws-rt-shell"><div id="itwsRtTabs" class="itws-rt-tabs"><button class="itws-rt-tab active" data-terminal-id="term-dock-test">Terminal 1</button></div><div class="itws-xterm-host"><div class="itws-xterm-pane active" id="terminalIdentity"><textarea class="xterm-helper-textarea"></textarea></div></div><div class="itws-rt-input-switch"><button>In-Terminal</button><button>Command box</button></div><div class="itws-rt-foot"><span>Connected worker</span></div></div></div></div></main></div></div></body></html>`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html)});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();if(!address||typeof address==='string')throw new Error('Dockable workspace fixture did not bind');

let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  let ticketCalls=0;
  await page.route('https://sulandra-coding-terminal-worker-production.up.railway.app/**',async route=>{
    const request=route.request();
    if(request.url().endsWith('/workspace/ticket')&&request.method()==='POST'){
      ticketCalls+=1;
      const body=request.postDataJSON();
      const suffix=body.port?`proxy/${body.port}/`:'ide/';
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,url:`/workspace/term-dock-test/${suffix}?ticket=fixture-${ticketCalls}`})});return;
    }
    await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body>Embedded workspace fixture</body></html>'});
  });
  await page.goto(`http://127.0.0.1:${address.port}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>sessionStorage.setItem('sulandra:admin:access-token','fixture-admin-token'));
  await page.addStyleTag({path:terminalCssPath});await page.addStyleTag({path:xtermCssPath});await page.addStyleTag({path:cssPath});await page.addScriptTag({path:jsPath});

  const dock=page.locator('#itwsDockableWorkspace');await dock.waitFor({state:'visible'});
  const terminal=page.locator('.itws-dock-panel[data-panel-id="terminal"]');
  if(!(await terminal.isVisible()))throw new Error('Terminal panel was not docked');
  const terminalIdentity=await page.evaluate(()=>document.getElementById('terminalIdentity'));

  await page.locator('#itwsWorkspaceIdeButton').click();
  const ide=page.locator('.itws-dock-panel[data-panel-id="ide"]');await ide.waitFor({state:'visible'});
  const ideFrame=ide.locator('iframe');await ideFrame.waitFor({state:'visible'});
  const ideHandle=await ideFrame.elementHandle();
  if(!ideHandle)throw new Error('IDE iframe missing');

  await page.locator('#itwsWorkspacePreviewButton').click();
  const preview=page.locator('.itws-dock-panel[data-panel-id="preview"]');await preview.waitFor({state:'visible'});
  const previewFrame=preview.locator('iframe');const previewHandle=await previewFrame.elementHandle();if(!previewHandle)throw new Error('Preview iframe missing');
  if((await page.locator('.itws-dock-splitter').count())!==2)throw new Error('Three visible panels should create two splitters');

  const terminalBefore=await terminal.boundingBox();const ideBefore=await ide.boundingBox();
  if(!terminalBefore||!ideBefore)throw new Error('Docked panel geometry unavailable');
  const splitter=page.locator('.itws-dock-splitter').first();const splitBox=await splitter.boundingBox();if(!splitBox)throw new Error('Splitter missing');
  await page.mouse.move(splitBox.x+splitBox.width/2,splitBox.y+80);await page.mouse.down();await page.mouse.move(splitBox.x+90,splitBox.y+80,{steps:4});await page.mouse.up();
  const terminalAfter=await terminal.boundingBox();const ideAfter=await ide.boundingBox();
  if(!terminalAfter||!ideAfter||terminalAfter.width<=terminalBefore.width+40)throw new Error('Dragging splitter did not enlarge Terminal');
  if(ideAfter.width>=ideBefore.width-20)throw new Error('Dragging splitter did not reflow adjacent IDE panel');

  await terminal.locator('.itws-dock-maximize').click();
  const maxBox=await terminal.boundingBox();if(!maxBox||maxBox.width<1430||maxBox.height<890)throw new Error(`Terminal maximize did not fill viewport: ${JSON.stringify(maxBox)}`);
  await terminal.locator('.itws-dock-close').click();
  if(await terminal.evaluate(node=>node.classList.contains('itws-panel-maximized')))throw new Error('Maximized terminal X did not restore it');
  const sameTerminal=await page.evaluate(node=>node===document.getElementById('terminalIdentity'),terminalIdentity);
  if(!sameTerminal)throw new Error('Terminal DOM instance was recreated during maximize/restore');

  await ide.locator('.itws-dock-maximize').click();await page.keyboard.press('Escape');
  if(await ide.evaluate(node=>node.classList.contains('itws-panel-maximized')))throw new Error('Escape did not restore maximized IDE');
  const sameIde=await ideFrame.evaluate((node,original)=>node===original,ideHandle).catch(()=>false);
  if(!sameIde)throw new Error('IDE iframe was recreated during maximize/restore');

  await preview.locator('.itws-dock-maximize').click();await preview.locator('.itws-dock-close').click();
  const samePreview=await previewFrame.evaluate((node,original)=>node===original,previewHandle).catch(()=>false);
  if(!samePreview)throw new Error('Preview iframe was recreated during maximize/restore');
  await preview.locator('.itws-dock-close').click();
  if(await preview.isVisible())throw new Error('Docked Preview X did not hide the panel');
  if((await page.locator('.itws-dock-splitter').count())!==1)throw new Error('Closing Preview did not reflow to one splitter');

  const stored=await page.evaluate(()=>localStorage.getItem('sulandra:engineering-workspace-layout-v2')||'');
  if(/ticket|fixture-admin-token|workspace\/term-dock-test/i.test(stored))throw new Error('Persisted layout leaked a ticket, token or authenticated frame URL');

  const callsBefore=ticketCalls;
  await page.locator('#itwsWorkspaceIdeButton').click();
  await ide.locator('.itws-dock-maximize').click();await ide.locator('.itws-dock-close').click();
  if(ticketCalls!==callsBefore)throw new Error('Maximize/restore unexpectedly requested a fresh workspace ticket');

  console.log('Dockable workspace Chrome regression passed: independent Terminal/IDE/Preview panels resize together, maximize/restore preserves DOM state, close reflows space, Escape restores, and persisted layout contains no auth URLs.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
