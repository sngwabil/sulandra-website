import { readFile, writeFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node install-terminal-history-proxy.mjs <server.mjs>');
let source=await readFile(target,'utf8');
const marker='SULANDRA_TERMINAL_HISTORY_PROXY_V1';
if(source.includes(marker)){
  console.log(`Terminal history proxy is already installed in ${target}`);
  process.exit(0);
}

const executorAnchor="app.post('/v1/sessions/:sessionId/input', async (req, res, next) => {";
const gatewayAnchor="app.post('/sessions/:sessionId/input', async (req, res, next) => {";

if(source.includes(executorAnchor)){
  const block=`/* ${marker}: executor -> authenticated session-agent transcript paging. */\napp.get('/v1/sessions/:sessionId/history', async (req, res, next) => {\n  try {\n    const session = getSession(req, req.params.sessionId);\n    if (!session) return res.status(404).json({ error: 'Terminal session not found' });\n    session.lastUsedAt = now();\n    const params = new URLSearchParams();\n    if (req.query.before !== undefined && req.query.before !== '') {\n      params.set('before', String(Math.max(0, Math.trunc(Number(req.query.before) || 0))));\n    }\n    params.set('limit', String(Math.max(4096, Math.min(1048576, Math.trunc(Number(req.query.limit) || 262144)))));\n    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');\n    res.set('Pragma', 'no-cache');\n    res.json(await agentRequest(session, '/history?' + params.toString()));\n  } catch (error) { next(error); }\n});\n`;
  source=source.replace(executorAnchor,block+executorAnchor);
}else if(source.includes(gatewayAnchor)){
  const block=`/* ${marker}: Railway gateway -> execution-plane transcript paging. */\napp.get('/sessions/:sessionId/history', async (req, res, next) => {\n  try {\n    const params = new URLSearchParams();\n    if (req.query.before !== undefined && req.query.before !== '') {\n      params.set('before', String(Math.max(0, Math.trunc(Number(req.query.before) || 0))));\n    }\n    params.set('limit', String(Math.max(4096, Math.min(1048576, Math.trunc(Number(req.query.limit) || 262144)))));\n    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');\n    res.set('Pragma', 'no-cache');\n    res.json(await executionRequest(req, '/v1/sessions/' + encodeURIComponent(req.params.sessionId) + '/history?' + params.toString(), { timeoutMs: 15000 }));\n  } catch (error) { next(error); }\n});\n`;
  source=source.replace(gatewayAnchor,block+gatewayAnchor);
}else{
  throw new Error(`Terminal history proxy anchor missing in ${target}`);
}

await writeFile(target,source,'utf8');
console.log(`Installed terminal history proxy into ${target}`);
