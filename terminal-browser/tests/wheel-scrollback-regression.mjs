import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const runtime=path.join(repo,'terminal-browser/dist/sulandra-terminal-runtime.js');
const xtermCss=path.join(repo,'terminal-browser/node_modules/@xterm/xterm/css/xterm.css');
const wheelPolicy=path.join(repo,'assets/it-agent-terminal-wheel-scrollback.js');
for(const required of [runtime,xtermCss,wheelPolicy])if(!fs.existsSync(required))throw new Error(`Missing wheel regression dependency: ${required}`);

const server=http.createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end('<!doctype html><html><body><div id="terminal" style="width:900px;height:320px"></div></body></html>');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('Wheel regression fixture did not bind');

let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:600}});
  await page.goto(`http://127.0.0.1:${address.port}/`,{waitUntil:'domcontentloaded'});
  await page.addStyleTag({path:xtermCss});
  await page.addScriptTag({path:runtime});
  await page.addScriptTag({path:wheelPolicy});

  await page.evaluate(async()=>{
    window.__wheelPtyData=[];
    const term=new window.SulandraTerminalRuntime.Terminal({cols:100,rows:18,scrollback:5000,cursorBlink:false});
    window.__wheelTerm=term;
    term.onData(data=>window.__wheelPtyData.push(data));
    term.open(document.querySelector('#terminal'));
    const lines=Array.from({length:180},(_,index)=>`generated-scroll-line-${index}-${crypto.randomUUID()}\r\n`).join('');
    await new Promise(resolve=>term.write(lines+'bash-5.2$ ',resolve));
    term.scrollToBottom();
  });

  const before=await page.evaluate(()=>({
    viewportY:window.__wheelTerm.buffer.active.viewportY,
    baseY:window.__wheelTerm.buffer.active.baseY,
    sent:window.__wheelPtyData.length,
  }));
  if(before.baseY<=0)throw new Error(`Fixture did not create scrollback: ${JSON.stringify(before)}`);

  /* Aim at xterm-screen/rows specifically. The production bug occurred because
     .xterm-screen is a sibling of .xterm-viewport, so viewport-only capture
     missed ordinary wheel events and xterm emitted Up/Down PTY input. */
  const screen=page.locator('#terminal .xterm-screen');
  const box=await screen.boundingBox();
  if(!box)throw new Error('xterm-screen is not measurable');
  await page.mouse.move(box.x+Math.max(5,box.width/2),box.y+Math.max(5,box.height/2));
  const hitScreen=await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest?.('.xterm-screen')),{x:box.x+box.width/2,y:box.y+box.height/2});
  if(!hitScreen)throw new Error('Wheel regression did not target xterm-screen');

  await page.mouse.wheel(0,-720);
  await page.waitForTimeout(100);

  const afterUp=await page.evaluate(()=>({
    viewportY:window.__wheelTerm.buffer.active.viewportY,
    baseY:window.__wheelTerm.buffer.active.baseY,
    sent:window.__wheelPtyData.length,
    data:window.__wheelPtyData.join(''),
  }));
  if(!(afterUp.viewportY<before.viewportY))throw new Error(`Wheel-up did not move xterm scrollback: before=${JSON.stringify(before)} after=${JSON.stringify(afterUp)}`);
  if(afterUp.sent!==before.sent)throw new Error(`Wheel-up leaked PTY bytes: ${JSON.stringify(afterUp.data)}`);

  await page.mouse.wheel(0,720);
  await page.waitForTimeout(100);
  const afterDown=await page.evaluate(()=>({
    viewportY:window.__wheelTerm.buffer.active.viewportY,
    baseY:window.__wheelTerm.buffer.active.baseY,
    sent:window.__wheelPtyData.length,
    data:window.__wheelPtyData.join(''),
  }));
  if(!(afterDown.viewportY>afterUp.viewportY))throw new Error(`Wheel-down did not move toward latest output: up=${JSON.stringify(afterUp)} down=${JSON.stringify(afterDown)}`);
  if(afterDown.sent!==before.sent)throw new Error(`Wheel-down leaked PTY bytes: ${JSON.stringify(afterDown.data)}`);

  await page.evaluate(async()=>{
    const term=window.__wheelTerm;
    term.scrollToBottom();
    await new Promise(resolve=>term.write('\u001b[?1000h\u001b[?1006h',resolve));
  });
  const mouseMode=await page.evaluate(()=>window.__wheelTerm.modes.mouseTrackingMode);
  if(mouseMode==='none')throw new Error('Fixture failed to enable xterm mouse tracking');
  const beforeMouse=await page.evaluate(()=>window.__wheelPtyData.length);
  await page.mouse.wheel(0,-120);
  await page.waitForTimeout(100);
  const afterMouse=await page.evaluate(()=>window.__wheelPtyData.length);
  if(afterMouse<=beforeMouse)throw new Error('Explicit terminal mouse tracking did not receive wheel input');

  await page.evaluate(async()=>{
    const term=window.__wheelTerm;
    await new Promise(resolve=>term.write('\u001b[?1000l\u001b[?1006l\u001b[?1049h\u001b[?1h',resolve));
    window.__wheelPtyData.length=0;
  });
  await page.mouse.wheel(0,-240);
  await page.waitForTimeout(100);
  const alternateLeak=await page.evaluate(()=>window.__wheelPtyData.join(''));
  if(alternateLeak)throw new Error(`Alternate-screen wheel synthesized PTY cursor input: ${JSON.stringify(alternateLeak)}`);

  console.log('Wheel regression passed: xterm-screen wheel scrolling stays local, emits zero PTY bytes, and explicit mouse-reporting applications retain wheel input.');
}finally{
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
