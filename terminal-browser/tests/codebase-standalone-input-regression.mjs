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
#terminal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.terminal-view .xterm{height:100%;background:#000}
#view-preview{position:relative;height:100%;min-height:0;background:#000}.row{display:flex;gap:8px;padding:8px}
</style></head><body>
<div id="fixture"><main id="workspace"><input id="normalInput" value=""><div id="terminal-grid"><div id="xterm-container-term1" class="terminal-view"></div></div><div id="cm-wrapper" class="CodeMirror"></div></main>
<section id="view-preview"><div><h2>Preview</h2><div><button type="button">dock</button></div></div><div class="row">Port <input id="preview-port" value="3000"><button id="fixtureOpen" type="button" onclick="updatePreviewPort()">Open</button></div><iframe id="railway-preview-iframe"></iframe></section></div>
<div id="status-line-col"></div>
<script>
let openTabs=[{id:'term1',type:'terminal',sessionId:'session-codebase-1'},{id:'code1',type:'code'}];
let activeEditors={};
let activeTerminals={};
window.__sent=[];window.__sent2=[];window.__editorValue='';window.__fetchCount=0;window.__wsMessages=[];
const termElement=document.createElement('div');termElement.className='xterm';termElement.innerHTML='<div class="xterm-screen">terminal-1-stable-marker</div>';
const fakeWs={readyState:1,onmessage:event=>window.__wsMessages.push(event.data),send:data=>window.__sent.push(String(data))};
activeTerminals.term1={element:termElement,options:{cursorBlink:false},focus(){},__sulandraWs:fakeWs,__sulandraFitAddon:{fit(){}}};
const wrapper=document.getElementById('cm-wrapper');
activeEditors.code1={getWrapperElement:()=>wrapper,focus(){},replaceSelection(text){window.__editorValue+=String(text)},execCommand(command){window.__editorValue+='['+command+']'}};
const RAILWAY_CONFIG={PREVIEW_URL:'https://preview.invalid',getToken:()=> 'fixture-token'};
window.fetch=async()=>{window.__fetchCount+=1;return new Response(JSON.stringify({url:'/preview-live'}),{status:200,headers:{'content-type':'application/json'}})};
function initXterm(){return activeTerminals.term1}
function renderWorkspace(){
 const grid=document.getElementById('terminal-grid');
 grid.innerHTML='';
 for(const tab of openTabs.filter(item=>item.type==='terminal')){
  const node=document.createElement('div');node.id='xterm-container-'+tab.id;node.className='terminal-view';grid.appendChild(node);
 }
}
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

 const previewIdle=await page.evaluate(()=>({state:document.getElementById('railway-preview-iframe')?.dataset?.codebasePreviewState,srcdoc:document.getElementById('railway-preview-iframe')?.getAttribute('srcdoc')||'',fetchCount:window.__fetchCount}));
 if(previewIdle.state!=='idle'||!previewIdle.srcdoc.includes('linear-gradient')||previewIdle.fetchCount!==0)throw new Error(`Preview did not start on the dark idle surface: ${JSON.stringify(previewIdle)}`);

 await page.evaluate(()=>window.updatePreviewPort());
 await page.waitForTimeout(60);
 const afterTerminalStart=await page.evaluate(()=>({state:document.getElementById('railway-preview-iframe')?.dataset?.codebasePreviewState,fetchCount:window.__fetchCount,srcdoc:document.getElementById('railway-preview-iframe')?.getAttribute('srcdoc')||''}));
 if(afterTerminalStart.state!=='idle'||afterTerminalStart.fetchCount!==0||!afterTerminalStart.srcdoc.includes('linear-gradient'))throw new Error(`Terminal startup navigated Preview away from dark idle state: ${JSON.stringify(afterTerminalStart)}`);

 const terminalScreen=page.locator('#xterm-container-term1 .xterm-screen');
 await terminalScreen.click();
 await page.keyboard.type('echo keyboard-ok');
 await page.keyboard.press('Enter');
 let sent=await page.evaluate(()=>window.__sent.join(''));
 if(!sent.includes('echo keyboard-ok')||!sent.endsWith('\r'))throw new Error(`Terminal descendant keyboard input did not reach the live socket: ${JSON.stringify(sent)}`);

 await page.evaluate(()=>{
  const target=document.querySelector('#xterm-container-term1 .xterm-screen');
  const transfer=new DataTransfer();transfer.setData('text/plain','PASTE_OK');
  target.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));
 });
 sent=await page.evaluate(()=>window.__sent.join(''));
 if(!sent.includes('PASTE_OK'))throw new Error(`Terminal paste did not reach the live socket: ${JSON.stringify(sent)}`);

 const stableBefore=await page.evaluate(()=>{window.__term1Node=document.getElementById('xterm-container-term1');return window.__term1Node.querySelector('.xterm-screen')?.textContent||''});
 await page.evaluate(()=>{
  const element=document.createElement('div');element.className='xterm';element.innerHTML='<div class="xterm-screen">terminal-2-marker</div>';
  const ws={readyState:1,onmessage(){},send:data=>window.__sent2.push(String(data))};
  activeTerminals.term2={element,options:{cursorBlink:false},focus(){},__sulandraWs:ws,__sulandraFitAddon:{fit(){}}};
  openTabs.splice(1,0,{id:'term2',type:'terminal',sessionId:'session-codebase-2'});
  renderWorkspace();
 });
 await page.waitForTimeout(220);
 const stableAfter=await page.evaluate(()=>({same:document.getElementById('xterm-container-term1')===window.__term1Node,text:document.querySelector('#xterm-container-term1 .xterm-screen')?.textContent||'',term2:Boolean(document.querySelector('#xterm-container-term2 .xterm-screen'))}));
 if(!stableAfter.same||stableAfter.text!==stableBefore||!stableAfter.term2)throw new Error(`Adding Terminal 2 destroyed or repainted Terminal 1: ${JSON.stringify({stableBefore,stableAfter})}`);

 await page.locator('#xterm-container-term2 .xterm-screen').click();
 await page.keyboard.type('terminal-two');
 const sent2=await page.evaluate(()=>window.__sent2.join(''));
 if(sent2!=='terminal-two')throw new Error(`Terminal 2 input leaked or failed: ${JSON.stringify(sent2)}`);

 await page.evaluate(()=>{
  const ws=activeTerminals.term1.__sulandraWs;
  ws.send(JSON.stringify({type:'resize',cols:80,rows:24}));
  const bytes=new Uint8Array([0x1b,0x63,0x1b,0x5b,0x3f,0x32,0x35,0x68,0x58]).buffer;
  ws.onmessage({data:bytes});
 });
 if((await page.evaluate(()=>window.__wsMessages.length))!==0)throw new Error('Resize-triggered authoritative reset was allowed to repaint Terminal 1');

 const editor=page.locator('#cm-wrapper');
 await editor.click();await page.waitForTimeout(40);await page.keyboard.type('HTML edit works');
 const editorValue=await page.evaluate(()=>window.__editorValue);
 if(editorValue!=='HTML edit works')throw new Error(`Standalone editor keyboard fallback did not deliver input: ${JSON.stringify(editorValue)}`);

 const normal=page.locator('#normalInput');await normal.click();await page.keyboard.type('abc123');
 if((await normal.inputValue())!=='abc123')throw new Error('Input repair swallowed keyboard events outside terminal/editor surfaces');

 await page.locator('#codebase-preview-open').click();
 await page.waitForFunction(()=>window.__fetchCount===1);await page.waitForTimeout(60);
 const afterOpen=await page.evaluate(()=>({state:document.getElementById('railway-preview-iframe')?.dataset?.codebasePreviewState,fetchCount:window.__fetchCount,src:document.getElementById('railway-preview-iframe')?.getAttribute('src')||''}));
 if(afterOpen.state!=='live'||afterOpen.fetchCount!==1||afterOpen.src!=='/preview-live')throw new Error(`Explicit Preview Open did not activate live preview: ${JSON.stringify(afterOpen)}`);

 console.log('Standalone Codebase Chrome input regression passed: terminal descendant keys/paste, independent Terminal 2, live Terminal 1 DOM preservation, resize-reset suppression, editor input, dark Preview isolation, and explicit Preview Open verified.');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
