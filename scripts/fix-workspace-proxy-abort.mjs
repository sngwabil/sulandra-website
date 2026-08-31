import { readFile, writeFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node fix-workspace-proxy-abort.mjs <server.mjs>');
let source=await readFile(target,'utf8');
const before=(source.match(/req\.once\('close', \(\) => controller\.abort\(\)\);/g)||[]).length;
source=source.replaceAll("req.once('close', () => controller.abort());","req.once('aborted', () => controller.abort());");
if(before<1&&!source.includes("req.once('aborted', () => controller.abort());"))throw new Error('Workspace proxy abort marker missing');
await writeFile(target,source,'utf8');
console.log(`Workspace proxy abort lifecycle hardened in ${target}`);
