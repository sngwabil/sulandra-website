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
const workbenchRegister='registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });';
const resolved='registerITAgentArtifactRoutes({ app, prisma, authOf, requireRoles, adminRoles: [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO, UserRole.COO, UserRole.HR_MANAGER] });';
if(!bootstrap.includes(workbenchRegister))throw new Error('IT Agent workbench registration anchor is missing');

// onboarding-bootstrap.ts is rewritten by several idempotent installers and the
// root build runs this chain both on the host and again inside the API Docker
// image. Remove every executable artifact-route registration regardless of
// whitespace or which adminRoles expression a prior pass used, while leaving the
// import declaration untouched. Reinsert one canonical call immediately after
// the workbench registration so route order remains deterministic.
const artifactRegistrationPattern=/\s*registerITAgentArtifactRoutes\s*\(\s*\{[\s\S]*?\}\s*\)\s*;\s*/g;
bootstrap=bootstrap.replace(artifactRegistrationPattern,'\n');
bootstrap=bootstrap.replace(workbenchRegister,`${workbenchRegister}\n${resolved}`);
const registrations=(bootstrap.match(/registerITAgentArtifactRoutes\s*\(\s*\{/g)||[]).length;
if(registrations!==1)throw new Error(`Expected exactly one IT Agent artifact route registration, found ${registrations}`);
await writeFile(bootstrapPath,bootstrap,'utf8');

console.log('IT Agent artifact build idempotency repaired: capability flags are unique and artifact routes are registered exactly once with an explicit Administrator role allowlist.');
