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
for(const required of [cssPath,terminalCssPath,xtermCssPath,jsPath])if(!fs.existsSync(required))throw new Error(`Missing workspace panel regression dependency: ${required}`);

const html=`<!doctype html><html><head><meta charset="utf-8"><title>Workspace panel regression</title>
<style>
html,body{margin:0;width:100%;min-height:1200px}#agent{margin-top:120px;width:100%}.agent-shell{width:100%;min-height:680px}.agent-main{min-width:0}.engineering-controls{height:150px}.itws-rt-head{min-height:92px}.itws-rt-modebar{min-height:48px}.itws-rt-input-switch{display:flex;align-items:center;gap:8px;min-height:74px;padding:8px}.itws-rt-input-switch button{flex:0 0 auto}.itws-rt-foot{min-height:34px}
</style>
</head><body class="it-chatgpt-workspace itws-enterprise-shell"><div id="agent"><div class="agent-shell"><main class="agent-main"><div class="engineering-controls">Engineering Workspace controls</div><div id="itwsRealTerminal" class="itws-real-terminal"><div class="itws-rt-head"><div><h2>Engineering Workspace</h2></div></div><div class="itws-rt-modebar"><div class="itws-rt-tools"><button>Run typecheck</button><button>Build web</button><button>Ctrl+C</button><button>Clear</button></div></div><div class="itws-rt-shell"><div id="itwsRtTabs" class="itws-rt-tabs"><button class="itws-rt-tab active" data-terminal-id="term-panel-test">Terminal 1</button></div><div class="itws-xterm-host"><div class="itws-xterm-pane active"><textarea class="xterm-helper-textarea"></textarea></div></div><div class="itws-rt-input-switch"><button>In-Terminal</button><button>Command box</button><span>Following latest output</span><button>Latest</button><button>Copy</button><button>Search</button><button>Export</button><button>Export HTML</button></div><div class="itws-rt-foot"><span>Connected worker</span></div></div></div></main></div></div></body></html>`;
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html)});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('Workspace panel fixture did not bind');

let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('https://sulandra-coding-terminal-worker-production.up.railway.app/**',async route=>{
    const request=route.request();
    if(request.url().endsWith('/workspace/ticket')&&request.method()==='POST'){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,url:'/workspace/term-panel-test/ide/?ticket=fixture'})});
      return;
    }
    await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body>Embedded workspace fixture</body></html>'});
  });
  await page.goto(`http://127.0.0.1:${address.port}/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>sessionStorage.setItem('sulandra:admin:access-token','fixture-admin-token'));
  await page.addStyleTag({path:terminalCssPath});
  await page.addStyleTag({path:xtermCssPath});
  await page.addStyleTag({path:cssPath});
  await page.addScriptTag({path:jsPath});

  await page.locator('#itwsWorkspaceIdeButton').click();
  const panel=page.locator('#itwsWorkspacePanel');
  await panel.waitFor({state:'visible'});
  if(!(await panel.evaluate(node=>node.classList.contains('itws-ide-mode'))))throw new Error('IDE did not enter dedicated IDE rail mode');
  const panelBox=await panel.boundingBox();
  const closeBox=await panel.locator('.itws-workspace-close').boundingBox();
  if(!panelBox||!closeBox)throw new Error('IDE rail or close control is not visible');
  if(panelBox.width>601)throw new Error(`IDE rail exceeded intended max width: ${panelBox.width}`);
  if(panelBox.x<0||panelBox.x+panelBox.width>1441)throw new Error(`IDE rail escaped viewport horizontally: ${JSON.stringify(panelBox)}`);
  if(panelBox.y<0||panelBox.y+panelBox.height>901)throw new Error(`IDE rail escaped viewport vertically: ${JSON.stringify(panelBox)}`);
  if(closeBox.x<panelBox.x||closeBox.x+closeBox.width>panelBox.x+panelBox.width)throw new Error('IDE close control escaped the rail header');
  const portDisplay=await panel.locator('.itws-workspace-port').evaluate(node=>getComputedStyle(node).display);
  if(portDisplay!=='none')throw new Error(`IDE mode should hide preview port controls, got display=${portDisplay}`);

  const terminalBox=await page.locator('#itwsRealTerminal').boundingBox();
  const inputSwitchBox=await page.locator('.itws-rt-input-switch').boundingBox();
  const footerBox=await page.locator('.itws-rt-foot').boundingBox();
  const ideToolBox=await page.locator('#itwsWorkspaceIdeButton').boundingBox();
  const previewToolBox=await page.locator('#itwsWorkspacePreviewButton').boundingBox();
  if(!terminalBox)throw new Error('terminal disappeared while IDE rail was open');
  if(terminalBox.y+terminalBox.height>901)throw new Error(`terminal bottom escaped the visible viewport while IDE rail was open: ${JSON.stringify(terminalBox)}`);
  for(const [name,box] of [['input toolbar',inputSwitchBox],['terminal footer',footerBox],['IDE tool',ideToolBox],['Preview tool',previewToolBox]]){
    if(!box)throw new Error(`${name} disappeared while IDE rail was open`);
    if(box.y<0||box.y+box.height>901)throw new Error(`${name} escaped the visible viewport while IDE rail was open: ${JSON.stringify(box)}`);
  }

  await panel.locator('.itws-workspace-close').click();
  if(await panel.isVisible())throw new Error('IDE X did not close the workspace rail');

  await page.locator('#itwsWorkspacePreviewButton').click();
  await panel.waitFor({state:'visible'});
  if(!(await panel.evaluate(node=>node.classList.contains('itws-preview-mode'))))throw new Error('Preview did not enter preview rail mode');
  const previewPortDisplay=await panel.locator('.itws-workspace-port').evaluate(node=>getComputedStyle(node).display);
  if(previewPortDisplay==='none')throw new Error('Preview mode unexpectedly hid the port control');
  if(!(await panel.locator('.itws-workspace-close').isVisible()))throw new Error('Preview close control is not visible');
  await panel.locator('.itws-workspace-close').click();

  console.log('Workspace panel Chrome regression passed: IDE remains viewport-bound, has a persistent X, terminal/footer tools remain visible, and Preview retains its port controls.');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
