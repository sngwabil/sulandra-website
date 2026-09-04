import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const repairPath=path.join(repo,'assets','codebase-preview-terminal-input-fix.js');
if(!fs.existsSync(repairPath))throw new Error(`Missing standalone Codebase input repair: ${repairPath}`);

const html=`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;background:#06101a;color:#fff;font-family:system-ui}
#fixture{display:grid;grid-template-columns:1fr 360px;height:100vh}
#workspace{padding:16px}.terminal-view{height:180px;background:#000;margin-bottom:20px}.CodeMirror{height:180px;background:#111827;padding:12px}
#view-preview{position:relative;height:100%;min-height:0;background:#000}.row{display:flex;gap:8px;padding:8px}.xterm{height:100%;background:#000}
</style></head><body>
<div id="fixture"><main id="workspace"><input id="normalInput" value=""><div id="xterm-container-term1" class="terminal-view"></div><div id="cm-wrapper" class="CodeMirror"></div></main>
<section id="view-preview"><div><h2>Preview</h2><div><button type="button">dock</button></div></div><div class="row">Port <input id="preview-port" value="3000"><button id="fixtureOpen" type="button" onclick="updatePreviewPort()">Open</button></div><iframe id="railway-preview-iframe"></iframe></section></div>
<div id="status-line-col"></div>
<script>
let openTabs=[{id:'term1',type:'terminal',sessionId:'session-codebase-1'},{id:'code1',type:'code'}];
let activeEditors={};
let activeTerminals={};
window.__sent=[];window.__editorValue='';window.__fetchCount=0;
const termElement=document.createElement('div');termElement.className='xterm';termElement.innerHTML='<div class="xterm-screen">terminal fixture</div>';
const fakeWs={readyState:1,send:data=>window.__sent.push(String(data))};
activeTerminals.term1={element:termElement,options:{cursorBlink:false},focus(){},__sulandraWs:fakeWs,__sulandraFitAddon:{fit(){}}};
const wrapper=document.getElementById('cm-wrapper');
activeEditors.code1={
 getWrapperElement:()=>wrapper,
 focus(){},
 replaceSelection(text){window.__editorValue+=String(text)},
 execCommand(command){window.__editorValue+='['+command+']'}
};
const RAILWAY_CONFIG={PREVIEW_URL:'https://preview.invalid',getToken:()=> 'fixture-token'};
window.fetch=async()=>{window.__fetchCount+=1;return new Response(JSON.stringify({url:'/preview-live'}),{status:200,headers:{'content-type':'application/json'}})};
function initXterm(){return activeTerminals.term1}
function renderWorkspace(){}
function focusEditor(){}
</script></body></html>`;

const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html)});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('Standalone Codebase input fixture did not bind');

let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.goto(`http://127.0.0.1:${address.port}/`);
 await page.addScriptTag({path:repairPath});
 await page.waitForTimeout(260);

 const previewIdle=await page.evaluate(()=>({
  state:document.getElementById('railway-preview-iframe')?.dataset?.codebasePreviewState,
  srcdoc:document.getElementById('railway-preview-iframe')?.getAttribute('srcdoc')||'',
  fetchCount:window.__fetchCount
 }));
 if(previewIdle.state!=='idle'||!previewIdle.srcdoc.includes('linear-gradient')||previewIdle.fetchCount!==0)throw new Error(`Preview did not start on the dark idle surface: ${JSON.stringify(previewIdle)}`);

 // This reproduces the automatic call made when a terminal session becomes ready.
 await page.evaluate(()=>window.updatePreviewPort());
 await page.waitForTimeout(60);
 const afterTerminalStart=await page.evaluate(()=>({state:document.getElementById('railway-preview-iframe')?.dataset?.codebasePreviewState,fetchCount:window.__fetchCount,srcdoc:document.getElementById('railway-preview-iframe')?.getAttribute('srcdoc')||''}));
 if(afterTerminalStart.state!=='idle'||afterTerminalStart.fetchCount!==0||!afterTerminalStart.srcdoc.includes('linear-gradient'))throw new Error(`Terminal startup navigated Preview away from dark idle state: ${JSON.stringify(afterTerminalStart)}`);

 const terminal=page.locator('#xterm-container-term1');
 await terminal.click();
 await page.keyboard.type('echo keyboard-ok');
 await page.keyboard.press('Enter');
 const sent=await page.evaluate(()=>window.__sent.join(''));
 if(!sent.includes('echo keyboard-ok')||!sent.endsWith('\r'))throw new Error(`Standalone terminal keyboard fallback did not deliver input: ${JSON.stringify(sent)}`);

 const editor=page.locator('#cm-wrapper');
 await editor.click();
 await page.waitForTimeout(40);
 await page.keyboard.type('HTML edit works');
 const editorValue=await page.evaluate(()=>window.__editorValue);
 if(editorValue!=='HTML edit works')throw new Error(`Standalone editor keyboard fallback did not deliver input: ${JSON.stringify(editorValue)}`);

 const normal=page.locator('#normalInput');
 await normal.click();
 await page.keyboard.type('abc123');
 if((await normal.inputValue())!=='abc123')throw new Error('Input repair swallowed keyboard events outside terminal/editor surfaces');

 // The production repair deliberately normalizes the legacy Preview button ID.
 await page.locator('#codebase-preview-open').click();
 await page.waitForFunction(()=>window.__fetchCount===1);
 await page.waitForTimeout(60);
 const afterOpen=await page.evaluate(()=>({state:document.getElementById('railway-preview-iframe')?.dataset?.codebasePreviewState,fetchCount:window.__fetchCount,src:document.getElementById('railway-preview-iframe')?.getAttribute('src')||'',status:document.getElementById('status-line-col')?.textContent||''}));
 if(afterOpen.state!=='live'||afterOpen.fetchCount!==1||afterOpen.src!=='/preview-live')throw new Error(`Explicit Preview Open did not activate live preview: ${JSON.stringify(afterOpen)}`);

 console.log('Standalone Codebase Chrome input regression passed: terminal keys, editor keys, normal inputs, dark idle Preview, terminal-start Preview isolation, and explicit Preview Open verified.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
