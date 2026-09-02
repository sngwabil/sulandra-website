import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const cssPath=path.join(repo,'assets/sulandra-codebase.css');
const jsPath=path.join(repo,'assets/sulandra-codebase.js');
for(const required of [cssPath,jsPath])if(!fs.existsSync(required))throw new Error(`Missing Sulandra Codebase regression dependency: ${required}`);

const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div id="toolbar"><button type="button" id="itwsWorkspaceIdeButton" class="itws-workspace-tool">IDE</button><button type="button" id="itwsWorkspacePreviewButton" class="itws-workspace-tool">Preview</button></div><div id="itwsRealTerminal">terminal sentinel</div></body></html>';
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html)});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('Codebase fixture did not bind');

let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const branchSha='1234567890abcdef1234567890abcdef12345678';
 const treeSha='abcdef1234567890abcdef1234567890abcdef12';
 const safeBlobSha='1111111111111111111111111111111111111111';
 const source='export const sulandraCodebase = true;\n';
 await page.route('https://api.github.com/repos/sngwabil/sulandra-website/**',async route=>{
  const url=route.request().url();
  if(url.includes('/branches/release%2Fsulandra-1.0'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({commit:{sha:branchSha,commit:{tree:{sha:treeSha}}}})});
  if(url.includes(`/git/trees/${treeSha}`))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tree:[
   {path:'src',type:'tree',sha:'2222222222222222222222222222222222222222'},
   {path:'src/index.js',type:'blob',sha:safeBlobSha,size:source.length},
   {path:'.env.production',type:'blob',sha:'3333333333333333333333333333333333333333',size:20},
   {path:'node_modules/left-pad/index.js',type:'blob',sha:'4444444444444444444444444444444444444444',size:20},
   {path:'private.pem',type:'blob',sha:'5555555555555555555555555555555555555555',size:20},
   {path:'assets/logo.png',type:'blob',sha:'6666666666666666666666666666666666666666',size:20}
  ]})});
  if(url.includes(`/git/blobs/${safeBlobSha}`))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({encoding:'base64',size:source.length,content:Buffer.from(source).toString('base64')})});
  return route.fulfill({status:404,contentType:'application/json',body:'{}'});
 });
 await page.goto(`http://127.0.0.1:${address.port}/`);
 await page.evaluate(()=>{
  window.__codebaseOrder=[];
  document.documentElement.requestFullscreen=()=>{window.__codebaseOrder.push('fullscreen');return Promise.reject(new Error('fixture fullscreen denied'))};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(...args)=>{window.__codebaseOrder.push('fetch');return nativeFetch(...args)};
  window.__workspaceCalls=[];
  window.SulandraDockableWorkspace={openIde:()=>window.__workspaceCalls.push('ide'),show:id=>window.__workspaceCalls.push(`show:${id}`)};
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
 if((await page.locator('#scbInspectorState').innerText())!=='Read-only source snapshot')throw new Error('Source viewer did not report truthful read-only mode');
 const splitter=page.locator('.scb-splitter[data-side="left"]');const box=await splitter.boundingBox();if(!box)throw new Error('Codebase splitter is missing');await page.mouse.move(box.x+2,box.y+100);await page.mouse.down();await page.mouse.move(box.x+52,box.y+100,{steps:3});await page.mouse.up();const layout=await page.evaluate(()=>localStorage.getItem('sulandra:codebase:layout-v1')||'');if(!layout.includes('"left"'))throw new Error('Codebase split layout was not persisted');
 await page.locator('#scbOpenIde').click();if(await shell.isVisible())throw new Error('Opening real IDE did not leave Codebase surface');let calls=await page.evaluate(()=>window.__workspaceCalls.slice());if(!calls.includes('ide'))throw new Error(`Codebase did not delegate editing to real IDE: ${JSON.stringify(calls)}`);
 await codebaseButton.click();await shell.waitFor({state:'visible'});await page.locator('#scbOpenTerminal').click();calls=await page.evaluate(()=>window.__workspaceCalls.slice());if(!calls.includes('show:terminal'))throw new Error(`Codebase did not delegate execution to real terminal: ${JSON.stringify(calls)}`);
 console.log('Sulandra Codebase Chrome regression passed: sibling control, synchronous fullscreen request, fallback shell, safe repository filtering, real source read, persisted split layout, and real IDE/Terminal delegation verified.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
