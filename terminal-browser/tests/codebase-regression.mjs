import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
execFileSync(process.execPath,[path.join(repo,'scripts','fix-sulandra-codebase-editor-state.mjs')],{cwd:repo,stdio:'inherit'});
const cssPath=path.join(repo,'assets','sulandra-codebase.css');
const jsPath=path.join(repo,'assets','sulandra-codebase.js');
for(const required of [cssPath,jsPath])if(!fs.existsSync(required))throw new Error(`Missing Sulandra Codebase regression dependency: ${required}`);

const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div id="toolbar"><button type="button" id="itwsWorkspaceIdeButton" class="itws-workspace-tool">IDE</button><button type="button" id="itwsWorkspacePreviewButton" class="itws-workspace-tool">Preview</button></div><div id="workspaceHome"><div id="idePanel" hidden>IDE sentinel</div><div id="previewPanel" hidden>Preview sentinel</div></div><div id="terminalHome"><div id="itwsRealTerminal"><div id="itwsRtShell"><div id="itwsRtTabs"><button type="button" class="active" data-terminal-id="term-fixture">Terminal 1</button><button type="button" id="itwsRtNewTab">+</button></div><div id="itwsXtermHost"><div class="itws-xterm-pane active" data-session-id="term-fixture">terminal sentinel</div></div></div></div></div></body></html>';
const branchSha='1234567890abcdef1234567890abcdef12345678';
const safeBlobSha='1111111111111111111111111111111111111111';
const source='export const sulandraCodebase = true;\n';
let treeRequests=0,fileRequests=0;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
 if(url.pathname==='/api/it-solutions/codebase/tree'){
  treeRequests++;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({data:{repository:'sngwabil/sulandra-website',branch:'release/sulandra-1.0',commitSha:branchSha,treeSha:'abcdef1234567890abcdef1234567890abcdef12',entries:[
   {path:'src',type:'tree',sha:'2222222222222222222222222222222222222222',size:0},
   {path:'src/index.js',type:'blob',sha:safeBlobSha,size:source.length},
   {path:'.env.production',type:'blob',sha:'3333333333333333333333333333333333333333',size:20},
   {path:'node_modules/left-pad/index.js',type:'blob',sha:'4444444444444444444444444444444444444444',size:20},
   {path:'private.pem',type:'blob',sha:'5555555555555555555555555555555555555555',size:20},
   {path:'assets/logo.png',type:'blob',sha:'6666666666666666666666666666666666666666',size:20}
  ]}}));
 }
 if(url.pathname==='/api/it-solutions/codebase/file'){
  fileRequests++;const requested=url.searchParams.get('path');if(requested!=='src/index.js'){res.writeHead(403,{'content-type':'application/json'});return res.end(JSON.stringify({error:'blocked'}))}
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({data:{repository:'sngwabil/sulandra-website',branch:'release/sulandra-1.0',path:requested,sha:safeBlobSha,size:source.length,content:source}}));
 }
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('Codebase fixture did not bind');

let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(`http://127.0.0.1:${address.port}/`);
 await page.evaluate(()=>{
  window.__codebaseOrder=[];
  document.documentElement.requestFullscreen=()=>{window.__codebaseOrder.push('fullscreen');return Promise.reject(new Error('fixture fullscreen denied'))};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(...args)=>{window.__codebaseOrder.push('fetch');return nativeFetch(...args)};
  window.__workspaceCalls=[];
  window.SulandraDockableWorkspace={
   openIde:()=>{window.__workspaceCalls.push('ide');document.querySelector('#idePanel').hidden=false},
   openPreview:()=>{window.__workspaceCalls.push('preview');document.querySelector('#previewPanel').hidden=false},
   openTerminal:()=>window.__workspaceCalls.push('terminal'),
   show:id=>window.__workspaceCalls.push(`show:${id}`),
   getPanel:mode=>document.querySelector(mode==='ide'?'#idePanel':mode==='preview'?'#previewPanel':null)
  };
 });
 await page.addStyleTag({path:cssPath});
 await page.addScriptTag({path:jsPath});
 const codebaseButton=page.locator('#itwsSulandraCodebaseButton');
 await codebaseButton.waitFor({state:'visible'});
 if((await page.locator('#toolbar > button').allTextContents()).join('|')!=='IDE|Preview|Codebase')throw new Error('Codebase was not installed as a sibling Engineering Workspace control');
 await codebaseButton.click();
 const shell=page.locator('#sulandraCodebase');
 await shell.waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#scbStatus')?.textContent?.includes('safe source entries'));
 const order=await page.evaluate(()=>window.__codebaseOrder.slice());
 if(order[0]!=='fullscreen'||!order.includes('fetch')||order.indexOf('fullscreen')>order.indexOf('fetch'))throw new Error(`Fullscreen request did not precede asynchronous source loading: ${JSON.stringify(order)}`);
 if(!(await page.locator('#scbFullscreen').isVisible()))throw new Error('Fullscreen denial fallback did not expose Enter Full Screen control');
 const policy=await page.evaluate(()=>({env:window.SulandraCodebase.isBlockedPath('.env.production'),nodeModules:window.SulandraCodebase.isBlockedPath('node_modules/pkg/index.js'),traversal:window.SulandraCodebase.normalizePath('../server.js'),safe:window.SulandraCodebase.isBlockedPath('src/index.js')}));
 if(!policy.env||!policy.nodeModules||policy.traversal!==null||policy.safe)throw new Error(`Codebase source policy regression: ${JSON.stringify(policy)}`);
 const treeText=(await page.locator('#scbTree').innerText()).toLowerCase();
 if(!treeText.includes('src')||treeText.includes('.env')||treeText.includes('node_modules')||treeText.includes('private.pem')||treeText.includes('logo.png'))throw new Error(`Explorer exposed a blocked source entry: ${treeText}`);
 await page.locator('[data-path="src"][data-type="tree"]').click();
 await page.locator('[data-path="src/index.js"][data-type="blob"]').click();
 await page.waitForFunction(()=>document.querySelector('#scbCode')?.textContent?.includes('sulandraCodebase'));
 if((await page.locator('#scbInspectorState').innerText())!=='Live editor · release source loaded')throw new Error('Source viewer did not report the live editable source state');
 if(await page.locator('#scbEdit').isDisabled())throw new Error('Edit remained disabled after a source file loaded');
 if(await page.locator('#scbSave').isDisabled())throw new Error('Save remained disabled after a source file loaded');
 await page.locator('#scbEdit').click();
 const editor=page.locator('#scbEditorInput');
 await editor.waitFor({state:'visible'});
 await editor.fill(`${source}// fixture edit\n`);
 if((await page.locator('#scbInspectorState').innerText())!=='Editing workspace draft')throw new Error('Inline editor did not report workspace draft state');
 if((await page.locator('#scbDirty').innerText())!=='UNSAVED')throw new Error('Inline editor did not surface the unsaved draft indicator');
 await page.locator('#scbEdit').click();
 if(!(await page.locator('#scbCode').innerText()).includes('fixture edit'))throw new Error('View mode did not retain the inline editor draft');
 const splitter=page.locator('.scb-splitter[data-side="left"]');const box=await splitter.boundingBox();if(!box)throw new Error('Codebase splitter is missing');await page.mouse.move(box.x+2,box.y+100);await page.mouse.down();await page.mouse.move(box.x+52,box.y+100,{steps:3});await page.mouse.up();const layout=await page.evaluate(()=>localStorage.getItem('sulandra:codebase:layout-v2')||'');if(!layout.includes('"left"'))throw new Error('Codebase split layout was not persisted');
 const beforeDockUrl=page.url();
 await page.locator('#scbOpenIde').click();
 await page.locator('#scbDockMount #idePanel.scb-embedded-workspace-panel').waitFor({state:'visible'});
 if(!(await shell.isVisible()))throw new Error('Opening IDE hid the Codebase surface instead of embedding the panel');
 if(page.url()!==beforeDockUrl)throw new Error(`Opening embedded IDE navigated the top-level page: ${beforeDockUrl} -> ${page.url()}`);
 let calls=await page.evaluate(()=>window.__workspaceCalls.slice());
 if(!calls.includes('ide'))throw new Error(`Codebase did not open the real IDE panel: ${JSON.stringify(calls)}`);
 const ideDockTab=page.locator('.scb-dock-tab[data-dock="ide"]');
 if(!(await ideDockTab.evaluate(node=>node.classList.contains('active'))))throw new Error('IDE dock tab did not become active');
 await ideDockTab.click();
 if(!(await shell.evaluate(node=>node.classList.contains('scb-dock-closed'))))throw new Error('Clicking the active IDE dock tab did not close the right dock');
 if(await ideDockTab.evaluate(node=>node.classList.contains('active')))throw new Error('Closed IDE dock tab remained highlighted');
 await page.locator('#scbOpenTerminal').click();
 await page.waitForFunction(()=>document.querySelector('#scbTerminalMount #itwsRealTerminal.scb-terminal-integrated'));
 if(!(await shell.isVisible()))throw new Error('Opening Terminal hid the Codebase surface');
 if(page.url()!==beforeDockUrl)throw new Error(`Opening integrated Terminal navigated the top-level page: ${beforeDockUrl} -> ${page.url()}`);
 calls=await page.evaluate(()=>window.__workspaceCalls.slice());
 if(!calls.includes('terminal'))throw new Error(`Codebase did not activate the real terminal runtime: ${JSON.stringify(calls)}`);
 if((await page.locator('#scbStatus').innerText())!=='1 terminal pane active inside Codebase')throw new Error('Integrated terminal did not report its active in-Codebase state');
 if(treeRequests<1||fileRequests<1)throw new Error(`Codebase did not use the authenticated same-origin source API: tree=${treeRequests}, file=${fileRequests}`);
 console.log('Sulandra Codebase Chrome regression passed: sibling control, synchronous fullscreen request, safe same-origin source loading, inline editable workspace state, persisted split layout, embedded IDE dock behavior, and integrated terminal continuity verified.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}