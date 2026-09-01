import { readFile, writeFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node fix-workspace-proxy-streaming.mjs <server.mjs>');
let source=await readFile(target,'utf8');
const marker='SULANDRA_WORKSPACE_PROXY_STREAM_FIX_V1';

if(!source.includes(marker)){
  const requestBefore="    if (workspaceHopHeaders.has(lower) || lower === 'host' || lower === 'authorization' || lower.startsWith('x-sulandra-terminal-')) continue;";
  const requestAfter="    if (workspaceHopHeaders.has(lower) || lower === 'host' || lower === 'authorization' || lower === 'accept-encoding' || lower.startsWith('x-sulandra-terminal-')) continue;";
  if(!source.includes(requestBefore))throw new Error('Workspace request-header proxy anchor missing');
  source=source.replace(requestBefore,requestAfter);

  const returnAnchor="  return output;\n};\nconst copyWorkspaceResponseHeaders";
  if(!source.includes(returnAnchor))throw new Error('Workspace request identity-encoding anchor missing');
  source=source.replace(returnAnchor,"  output['accept-encoding'] = 'identity';\n  return output;\n};\nconst copyWorkspaceResponseHeaders");

  const responseBefore="    if (workspaceHopHeaders.has(lower) || lower === 'content-length' || lower === 'x-frame-options' || lower === 'content-security-policy' || lower === 'set-cookie') continue;";
  const responseAfter="    if (workspaceHopHeaders.has(lower) || lower === 'content-length' || lower === 'content-encoding' || lower === 'x-frame-options' || lower === 'content-security-policy' || lower === 'set-cookie') continue;";
  if(!source.includes(responseBefore))throw new Error('Workspace response-header proxy anchor missing');
  source=source.replace(responseBefore,responseAfter);

  const bridgeAnchor='const bridgeWorkspaceSockets = (left, right) => {';
  if(!source.includes(bridgeAnchor))throw new Error('Workspace stream bridge anchor missing');
  const helper=`// ${marker}\nconst pipeWorkspaceBody = (upstream, res, next) => {\n  const stream = Readable.fromWeb(upstream.body);\n  let closed = false;\n  const fail = error => {\n    if (closed) return;\n    closed = true;\n    if (res.destroyed || error?.name === 'AbortError') return;\n    if (!res.headersSent) { next(error); return; }\n    try { res.destroy(error); } catch {}\n  };\n  stream.on('error', fail);\n  stream.once('end', () => { closed = true; });\n  res.once('close', () => {\n    closed = true;\n    if (!stream.destroyed) stream.destroy();\n  });\n  stream.pipe(res);\n};\n`;
  source=source.replace(bridgeAnchor,helper+bridgeAnchor);

  const pipeBefore='Readable.fromWeb(upstream.body).pipe(res);';
  const count=source.split(pipeBefore).length-1;
  if(count<1)throw new Error('Workspace response streaming anchor missing');
  source=source.replaceAll(pipeBefore,'return pipeWorkspaceBody(upstream, res, next);');
}

await writeFile(target,source,'utf8');
console.log(`Workspace proxy streaming hardened in ${target}`);
