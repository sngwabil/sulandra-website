import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');

const connectionStart = source.indexOf("wss.on('connection', socket => {");
const heartbeatStart = source.indexOf('const heartbeat = setInterval', connectionStart);
if (connectionStart < 0 || heartbeatStart < 0) throw new Error('Terminal WebSocket connection handler not found');
const connection = source.slice(connectionStart, heartbeatStart);

for (const marker of [
  "const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);",
  "if (isBinary) {\n      proc.write(text);",
  "if (message.type === 'resize')",
  "socket.send(JSON.stringify({ type: 'resized', ...result }));\n        return;",
  "proc.write(text);",
]) {
  if (!connection.includes(marker)) throw new Error(`Terminal text-frame regression: missing ${marker}`);
}

const resizeStart = source.indexOf('const resizeBridge = (colsValue, rowsValue) => {');
const outputStart = source.indexOf('const outputFrom = cursorValue => {', resizeStart);
if (resizeStart < 0 || outputStart < 0) throw new Error('Terminal resize handler not found');
const resizeBlock = source.slice(resizeStart, outputStart);
if (resizeBlock.includes('scheduleAuthoritativeSnapshot(true)')) {
  throw new Error('Fullscreen resize must not force a pane snapshot/replay');
}
if (!resizeBlock.includes('proc.resize(cols, rows);')) throw new Error('PTY resize call is missing');

console.log('Terminal text-frame regression passed: browser string input reaches the PTY, resize control remains separate, and fullscreen resize does not replay the prompt.');
