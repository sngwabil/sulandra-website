import fs from 'node:fs';

const target=process.argv[2];
if(!target)throw new Error('Usage: node install-codebase-preview-gateway.mjs <gateway-server.mjs>');
let source=fs.readFileSync(target,'utf8');
const marker='CODEBASE_PREVIEW_ENVIRONMENTS_GATEWAY_V1';
if(source.includes(marker)){console.log('Codebase preview environment gateway already installed.');process.exit(0)}
if(!source.includes('CODEBASE_PROJECT_GATEWAY_V1'))throw new Error('Codebase project gateway must be installed before preview environment gateway');

const anchor="app.get('/codebase/projects/:project/railway/status', async (req, res, next) => {";
if(!source.includes(anchor))throw new Error('Codebase Railway gateway status anchor changed');
const patch=String.raw`
/* CODEBASE_PREVIEW_ENVIRONMENTS_GATEWAY_V1 */
app.get('/codebase/projects/:project/railway/preview', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/railway/preview', { timeoutMs: 45_000 })); }
  catch (error) { next(error); }
});
`;
source=source.replace(anchor,patch+anchor);
for(const required of [marker,"app.get('/codebase/projects/:project/railway/preview'","projectSuffix(req) + '/railway/preview'"]){
  if(!source.includes(required))throw new Error(`Codebase preview gateway verification missing: ${required}`);
}
fs.writeFileSync(target,source);
console.log('Installed authenticated Codebase Railway Production preview gateway.');
