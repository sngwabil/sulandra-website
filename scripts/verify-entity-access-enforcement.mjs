import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [access, bootstrap, routes] = await Promise.all([
  read('api/src/entity-access.ts'),
  read('api/src/onboarding-bootstrap.ts'),
  read('api/src/multi-company-routes.ts'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(access.includes('FROM "User" WHERE "id"=$1 AND "organizationId"=$2'), 'Access middleware does not verify the signed-in identity against the database');
expect(access.includes("identity.email?.trim().toLowerCase() === OWNER_EMAIL"), 'Enterprise Owner authority is not based on the database email');
expect(access.includes("'x-legal-entity-id'"), 'Company request header is not resolved');
expect(access.includes("'x-department-id'"), 'Department request header is not resolved');
expect(access.includes('entity.hasEmployment || entity.hasGrant'), 'Company membership is not limited to employment or active grants');
expect(access.includes('allowedDepartmentIds'), 'Resolved department allowlist is not attached to the request scope');
expect(access.includes("grant.scopeType === 'DEPARTMENT'"), 'Department grants are not included in department access');
expect(access.includes("'/api/intranet'"), 'Intranet is not marked as enterprise shared');
expect(access.includes("'/api/education'"), 'Education is not marked as enterprise shared');
expect(access.includes('You do not have access to the selected company'), 'Unauthorized company selection is not rejected');
expect(access.includes('You do not have access to the selected department'), 'Unauthorized department selection is not rejected');
expect(access.includes("request.path.startsWith('/public/')"), 'Public applicant and intake routes are not excluded from protected company resolution');
expect(access.includes("request.path.startsWith('/internal/')"), 'API-key-protected internal workers are not excluded from employee company resolution');
expect(access.includes('const { identity, access } = await resolveEntityAccess(prisma, auth, request);'), 'Company access middleware does not resolve database-backed entity scope');
expect(access.includes('response.locals.entityAccess = access;'), 'Resolved company scope is not attached to the request');
for (const scopedField of ['legalEntityId: access.legalEntityId', 'departmentId: access.departmentId', 'allowedDepartmentIds: access.allowedDepartmentIds', 'entityAccessLevel: access.accessLevel', 'enterpriseOwner: access.enterpriseOwner']) {
  expect(access.includes(scopedField), `Authenticated request scope is missing ${scopedField}`);
}

const authenticateIndex = bootstrap.indexOf("app.use('/api', authenticate);");
const scopedAccessDeclarationIndex = bootstrap.indexOf('const scopedAccess = createEntityAccessMiddleware({ prisma });');
const scopedAccessUseIndex = bootstrap.indexOf("app.use('/api', scopedAccess);");
const routeRegistrationIndex = bootstrap.indexOf('registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });');
expect(scopedAccessDeclarationIndex >= 0, 'Canonical company access middleware is not constructed');
expect(authenticateIndex >= 0 && scopedAccessUseIndex > authenticateIndex, 'Company access middleware is not installed after authentication');
expect(routeRegistrationIndex > scopedAccessUseIndex, 'Company access middleware is not installed before protected routes');

const hasSessionEntityContext = /const entityContext = await getUserEntityContext\(prisma, (account|auth)\);/.test(bootstrap)
  && bootstrap.includes('entityContext,');
expect(hasSessionEntityContext, 'Session response does not expose authorized company memberships');
expect(routes.includes("app.get('/api/entity-context'"), 'Canonical entity-context endpoint is not registered');
expect(routes.includes('getUserEntityContext(prisma, authOf(res))'), 'Entity-context endpoint does not resolve the authenticated user memberships');
expect(!bootstrap.includes(': administratorEmail,\n    };\n  } catch'), 'JWT claims still gain the Enterprise Owner email through a fallback');

for (const helper of ['requireEntityMatch', 'requireDepartmentMatch', 'requireEntityManageAccess', 'requireEnterpriseOwner']) {
  expect(routes.includes(helper), `Multi-company Admin routes do not use ${helper}`);
}
expect(routes.includes('employment."legalEntityId"=$2'), 'Employment listing is not constrained to the selected company');
expect(routes.includes('enrollment."legalEntityId"=$2'), 'Client enrollment listing is not constrained to the selected company');
expect(routes.includes('department."legalEntityId"=$2'), 'Department listing is not constrained to the selected company');
expect(routes.includes('Client is not enrolled with the selected company'), 'Client-scoped grants are not bound to the selected company');
expect(routes.includes('Only the Enterprise Owner may change primary employment across companies'), 'Primary employment can be changed across companies by a company manager');
expect(routes.includes('Only the Enterprise Owner may change a primary client enrollment across companies'), 'Primary client enrollment can be changed across companies by a company manager');

if (failures.length) {
  console.error(`Entity access enforcement verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Entity access enforcement verified: database identity, authenticated middleware ordering, company and department boundaries, session memberships, selected-company Admin APIs, and shared intranet/education access are wired into the backend.');
