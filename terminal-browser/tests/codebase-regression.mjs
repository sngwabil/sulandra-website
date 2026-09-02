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
 if(treeRequests<1||fileRequests<1)throw new Error(`Codebase did not use the authenticated same-origin source API: tree=${treeRequests}, file=${fileRequests}`);
 console.log('Sulandra Codebase Chrome regression passed: sibling control, synchronous fullscreen request, fallback shell, same-origin source API, safe filtering, real source read, persisted split layout, and real IDE/Terminal delegation verified.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
