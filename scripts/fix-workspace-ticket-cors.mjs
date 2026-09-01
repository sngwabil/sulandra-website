import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-workspace-ticket-cors.mjs <server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'SULANDRA_WORKSPACE_TICKET_CORS_V1';
if (source.includes(marker)) {
  console.log(`Workspace ticket CORS already hardened in ${target}`);
  process.exit(0);
}

const anchor = "app.post('/workspace/ticket', async (req, res) => {";
const index = source.indexOf(anchor);
if (index < 0) throw new Error('Workspace ticket CORS anchor changed: /workspace/ticket route not found');

const middleware = `/* ${marker} */
const workspaceTicketBrowserOrigins = new Set([
  'https://sulandrahealth.com',
  'https://www.sulandrahealth.com',
]);
app.use('/workspace/ticket', (req, res, next) => {
  const origin = String(req.headers.origin || '').trim();
  const allowedOrigin = workspaceTicketBrowserOrigins.has(origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    res.vary('Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!allowedOrigin) return res.status(403).end();
    return res.status(204).end();
  }
  next();
});

`;

source = source.slice(0, index) + middleware + source.slice(index);
await writeFile(target, source, 'utf8');
console.log(`Workspace ticket CORS hardened in ${target}`);
