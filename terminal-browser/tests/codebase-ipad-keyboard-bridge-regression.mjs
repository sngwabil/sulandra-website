import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const bridgePath=path.join(repo,'assets','codebase-ipad-terminal-keyboard-bridge.js');
const nativePastePath=path.join(repo,'assets','codebase-terminal-native-paste.js');
if(!fs.existsSync(bridgePath))throw new Error(`Missing iPad keyboard bridge: ${bridgePath}`);
if(!fs.existsSync(nativePastePath))throw new Error(`Missing Codebase native paste runtime: ${nativePastePath}`);

const html=`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;background:#06101a;color:#fff;font-family:system-ui}
#grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:20px}.terminal-view{height:220px;background:#000}.xterm{height:100%}.xterm-screen{padding:20px}
</style></head><body>
<input id="normal-input" value=""><div id="grid"><div id="xterm-container-term1" class="terminal-view"><div class="xterm"><div class="xterm-screen">terminal one</div></div></div></div>
<script>
window.__sent1=[];window.__sent2=[];window.__pastes1=[];window.__pastes2=[];
const ws1={readyState:1,send:data=>window.__sent1.push(String(data))};
let activeTerminals={term1:{__sulandraWs:ws1,paste(data){const text=String(data);window.__pastes1.push(text);ws1.send('\\x1b[200~'+text+'\\x1b[201~')}}};
</script></body></html>`;

const server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html)});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('iPad bridge fixture did not bind');

let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.addScriptTag({path:bridgePath});
  await page.addScriptTag({path:nativePastePath});
  await page.waitForTimeout(220);

  await page.locator('#xterm-container-term1 .xterm-screen').click();
  await page.waitForTimeout(40);
  const focusState=await page.evaluate(()=>({
    activeId:document.activeElement?.id||'',
    bridgeExists:Boolean(document.getElementById('codebase-ipad-terminal-keyboard-bridge')),
    terminalId:document.getElementById('codebase-ipad-terminal-keyboard-bridge')?.dataset?.codebaseTerminalId||'',
  }));
  if(!focusState.bridgeExists||focusState.activeId!=='codebase-ipad-terminal-keyboard-bridge'||focusState.terminalId!=='term1'){
    throw new Error(`Terminal tap did not synchronously focus the real keyboard bridge: ${JSON.stringify(focusState)}`);
  }

  await page.evaluate(()=>{
    const bridge=document.getElementById('codebase-ipad-terminal-keyboard-bridge');
    bridge.value='ipad-soft-input';
    bridge.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:false,inputType:'insertText',data:'ipad-soft-input'}));
  });
  let sent1=await page.evaluate(()=>window.__sent1.join(''));
  if(sent1!=='ipad-soft-input')throw new Error(`iPad input-event fallback did not reach Terminal 1: ${JSON.stringify(sent1)}`);

  await page.evaluate(()=>{
    const bridge=document.getElementById('codebase-ipad-terminal-keyboard-bridge');
    bridge.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertLineBreak',data:null}));
    bridge.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward',data:null}));
  });
  sent1=await page.evaluate(()=>window.__sent1.join(''));
  if(!sent1.endsWith('\r\x7f'))throw new Error(`iPad beforeinput Enter/Backspace mapping failed: ${JSON.stringify(sent1)}`);

  await page.keyboard.type('HW');
  await page.keyboard.press('Enter');
  sent1=await page.evaluate(()=>window.__sent1.join(''));
  if(!sent1.endsWith('\r\x7fHW\r'))throw new Error(`Hardware keyboard input through bridge failed: ${JSON.stringify(sent1)}`);

  const multiline='echo ipad-one\necho ipad-two\nprintf ipad-done';
  const beforePaste=await page.evaluate(()=>window.__sent1.join('').length);
  await page.evaluate(text=>{
    const bridge=document.getElementById('codebase-ipad-terminal-keyboard-bridge');
    const transfer=new DataTransfer();transfer.setData('text/plain',text);
    bridge.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));
    bridge.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertFromPaste',data:text}));
  },multiline);
  const pasteState=await page.evaluate(()=>({sent:window.__sent1.join(''),pastes:[...window.__pastes1]}));
  const expectedPaste=`\x1b[200~${multiline}\x1b[201~`;
  if(pasteState.pastes.at(-1)!==multiline)throw new Error(`iPad multiline clipboard text bypassed xterm paste(): ${JSON.stringify(pasteState)}`);
  if(pasteState.sent.slice(beforePaste)!==expectedPaste)throw new Error(`iPad multiline paste was raw-forwarded or duplicated instead of one native bracketed packet: ${JSON.stringify(pasteState.sent.slice(beforePaste))}`);

  await page.evaluate(()=>{
    const grid=document.getElementById('grid');
    const node=document.createElement('div');
    node.id='xterm-container-term2';node.className='terminal-view';node.innerHTML='<div class="xterm"><div class="xterm-screen">terminal two</div></div>';
    grid.appendChild(node);
    const ws2={readyState:1,send:data=>window.__sent2.push(String(data))};
    activeTerminals.term2={__sulandraWs:ws2,paste(data){const text=String(data);window.__pastes2.push(text);ws2.send('\\x1b[200~'+text+'\\x1b[201~')}};
  });
  await page.waitForTimeout(220);
  await page.locator('#xterm-container-term2 .xterm-screen').click();
  await page.waitForTimeout(40);
  await page.evaluate(()=>{
    const bridge=document.getElementById('codebase-ipad-terminal-keyboard-bridge');
    bridge.value='terminal-two-only';
    bridge.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:false,inputType:'insertText',data:'terminal-two-only'}));
  });
  const isolation=await page.evaluate(()=>({one:window.__sent1.join(''),two:window.__sent2.join(''),active:document.getElementById('codebase-ipad-terminal-keyboard-bridge')?.dataset?.codebaseTerminalId||''}));
  if(isolation.two!=='terminal-two-only'||isolation.active!=='term2'||isolation.one.includes('terminal-two-only')){
    throw new Error(`iPad keyboard bridge leaked between terminal tabs: ${JSON.stringify(isolation)}`);
  }

  const normal=page.locator('#normal-input');
  await normal.click();
  await page.keyboard.type('abc123');
  if((await normal.inputValue())!=='abc123')throw new Error('iPad keyboard bridge swallowed input outside terminal surfaces');

  console.log('Codebase iPad keyboard bridge regression passed: tap focus, software input events, Enter/Backspace, hardware keys, native multiline bracketed paste without duplicate beforeinput, multi-terminal isolation, and normal input verified.');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
