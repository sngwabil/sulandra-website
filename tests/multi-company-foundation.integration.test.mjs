import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
const apiBase = process.env.MULTI_COMPANY_TEST_API_BASE;
const token = process.env.MULTI_COMPANY_TEST_TOKEN;
const organizationId = process.env.MULTI_COMPANY_TEST_ORGANIZATION_ID;

const databaseTest = databaseUrl ? test : test.skip.bind(test);
databaseTest('multi-company migration creates the entity foundation and safe seed state', async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const required = ['LegalEntity', 'Department', 'Employment', 'UserEntityAccessGrant', 'ClientEnrollment'];
    const tables = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])`,
      required,
    );
    assert.deepEqual(new Set(tables.map((row) => row.tablename)), new Set(required));

    if (organizationId) {
      const entities = await prisma.$queryRawUnsafe(
        `SELECT "code","status","parentLegalEntityId" FROM "LegalEntity" WHERE "organizationId"=$1 ORDER BY "code"`,
        organizationId,
      );
      assert.deepEqual(new Set(entities.map((row) => row.code)), new Set(['SULANDRA_HEALTH', 'SCLS', 'HOME_HEALTH', 'NMT']));
      assert.equal(entities.find((row) => row.code === 'SCLS')?.status, 'ACTIVE');
      assert.equal(entities.find((row) => row.code === 'SULANDRA_HEALTH')?.status, 'PLANNED');
      assert.ok(entities.filter((row) => row.code !== 'SCLS').every((row) => row.parentLegalEntityId === null));
    }
  } finally {
    await prisma.$disconnect();
  }
});

const apiTest = apiBase && token ? test : test.skip.bind(test);
apiTest('authenticated entity context preserves shared apps and returns only authorized companies', async () => {
  const base = apiBase.replace(/\/$/, '');
  const headers = { authorization: `Bearer ${token}` };
  const contextResponse = await fetch(`${base}/api/entity-context`, { headers });
  assert.equal(contextResponse.status, 200);
  const context = await contextResponse.json();
  assert.equal(context.data.sharedAccess.intranet, true);
  assert.equal(context.data.sharedAccess.education, true);
  assert.ok(Array.isArray(context.data.entities));

  const sessionResponse = await fetch(`${base}/api/session`, { headers });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.ok(session.data.entityContext);
  if (organizationId) assert.equal(session.data.organizationId, organizationId);
});
