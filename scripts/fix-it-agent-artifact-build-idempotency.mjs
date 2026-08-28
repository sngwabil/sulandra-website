import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');
const emailCapability='externalEmail:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS),';
const artifactCapabilities=`${emailCapability}fileUpload:true,pdfCreation:true,imageCreation:Boolean(openAIKey()),`;
const repeatedCapabilities=new RegExp(`(?:${artifactCapabilities.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})+`,'g');
if(!workbench.includes(artifactCapabilities))throw new Error('IT Agent artifact capability status marker is missing');
workbench=workbench.replace(repeatedCapabilities,artifactCapabilities);
await writeFile(workbenchPath,workbench,'utf8');

const bootstrapPath=path.join(root,'api','src','onboarding-bootstrap.ts');
let bootstrap=await readFile(bootstrapPath,'utf8');
const unresolved='registerITAgentArtifactRoutes({ app, prisma, authOf, requireRoles, adminRoles });';
const resolved=`registerITAgentArtifactRoutes({ app, prisma, authOf, requireRoles, adminRoles: [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO, UserRole.COO, UserRole.HR_MANAGER] });`;
bootstrap=bootstrap.split(unresolved).join(resolved);
const registrations=bootstrap.split(resolved).length-1;
if(registrations!==1)throw new Error(`Expected exactly one IT Agent artifact route registration, found ${registrations}`);
await writeFile(bootstrapPath,bootstrap,'utf8');

console.log('IT Agent artifact build idempotency repaired: capability flags are unique and artifact routes receive an explicit Administrator role allowlist.');
