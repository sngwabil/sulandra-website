import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routeTarget=path.join(root,'api','src','it-agent-workbench-routes.ts');
const brokenHistory="input:history.map(item=>({role:item.role,content:[{type:'input_text',text:redact(item.content)}]})),";
const fixedHistory="input:history.map(item=>({role:item.role,content:[{type:item.role==='assistant'?'output_text':'input_text',text:redact(item.content)}]})),";
let routeSource=await readFile(routeTarget,'utf8');
if(routeSource.includes(brokenHistory))routeSource=routeSource.replace(brokenHistory,fixedHistory);
else if(!routeSource.includes(fixedHistory))throw new Error('IT Agent Responses API history anchor changed');
await writeFile(routeTarget,routeSource,'utf8');

const target=path.join(root,'api','src','onboarding-bootstrap.ts');
const importLine="import { registerITAgentWorkbenchRoutes } from './it-agent-workbench-routes.js';";
const registerLine='registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });';
const itImport="import { registerITSolutionsRoutes } from './it-solutions-routes.js';";
const itRegister='registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });';
let source=await readFile(target,'utf8');
if(!source.includes(importLine)){
  if(!source.includes(itImport))throw new Error('IT Solutions import anchor missing for IT Agent workbench');
  source=source.replace(itImport,`${itImport}\n${importLine}`);
}
source=source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!source.includes(itRegister))throw new Error('IT Solutions registration anchor missing for IT Agent workbench');
source=source.replace(itRegister,`${itRegister}\n${registerLine}`);
await writeFile(target,source,'utf8');
await import('./verify-it-agent-workbench.mjs');
console.log('IT Agent workbench routes registered after canonical IT Solutions; multi-turn Responses API history uses output_text for assistant turns.');