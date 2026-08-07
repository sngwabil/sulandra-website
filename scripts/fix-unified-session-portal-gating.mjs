import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const securityPath = path.join(root, 'api/src/employee-auth-security.ts');
let security = await readFile(securityPath, 'utf8');
const oldValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal||'EMPLOYEE'))[0];if(control&&control.enabled===false)return false;await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
const newValidator = "export async function validateEmployeeSession(prisma:PrismaClient,input:{organizationId:string;userId:string;sessionId:string;portal?:string}){await ensureEmployeeAuthSecuritySchema(prisma);const session=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM \"EmployeeAuthSession\" WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"userId\"=$3 AND \"revokedAt\" IS NULL AND \"expiresAt\">NOW() LIMIT 1`,input.sessionId,input.organizationId,input.userId))[0];if(!session)return false;if(input.portal){const control=(await prisma.$queryRawUnsafe<any[]>(`SELECT \"enabled\" FROM \"EmployeePortalAccessControl\" WHERE \"organizationId\"=$1 AND \"userId\"=$2 AND \"portal\"=$3 LIMIT 1`,input.organizationId,input.userId,input.portal))[0];if(control&&control.enabled===false)return false}await prisma.$executeRawUnsafe(`UPDATE \"EmployeeAuthSession\" SET \"lastSeenAt\"=NOW() WHERE \"id\"=$1`,input.sessionId);return true}";
if (security.includes(oldValidator)) security = security.replace(oldValidator, newValidator);
if (!security.includes('if(input.portal){const control=')) throw new Error('Unified session validator repair was not applied.');
await writeFile(securityPath, security, 'utf8');

const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
let bootstrap = await readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace(
  "validateEmployeeSession(prisma, { organizationId: claims.organizationId, userId: claims.sub, sessionId: claims.jti, portal: 'EMPLOYEE' })",
  "validateEmployeeSession(prisma, { organizationId: claims.organizationId, userId: claims.sub, sessionId: claims.jti })",
);
if (bootstrap.includes("sessionId: claims.jti, portal: 'EMPLOYEE'")) throw new Error('Global token validation is still incorrectly tied to the EMPLOYEE portal.');
await writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('Unified Sulandra session repaired: login authenticates the session once; global API validation no longer treats every module as the EMPLOYEE portal.');
