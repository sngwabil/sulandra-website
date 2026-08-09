import test from 'node:test';
import assert from 'node:assert/strict';

const apiBase = process.env.MULTI_COMPANY_TEST_API_BASE;
const token = process.env.MULTI_COMPANY_TEST_TOKEN;
const unauthorizedEntityId = process.env.MULTI_COMPANY_TEST_UNAUTHORIZED_ENTITY_ID;
const apiTest = apiBase && token ? test : test.skip.bind(test);

apiTest('session resolves and enforces one selected legal entity', async () => {
  const base = apiBase.replace(/\/$/, '');
  const headers = { authorization: `Bearer ${token}` };
  const defaultResponse = await fetch(`${base}/api/session`, { headers });
  assert.equal(defaultResponse.status, 200);
  const defaultSession = await defaultResponse.json();
  assert.ok(defaultSession.data.entityAccess?.legalEntityId);
  assert.ok(Array.isArray(defaultSession.data.entityAccess?.allowedDepartmentIds));

  const activeEntity = defaultSession.data.entityContext.entities.find((entity) => entity.status === 'ACTIVE');
  assert.ok(activeEntity);
  const selectedResponse = await fetch(`${base}/api/session`, {
    headers: { ...headers, 'x-legal-entity-id': activeEntity.id },
  });
  assert.equal(selectedResponse.status, 200);
  const selectedSession = await selectedResponse.json();
  assert.equal(selectedSession.data.entityAccess.legalEntityId, activeEntity.id);
});

const unauthorizedTest = apiBase && token && unauthorizedEntityId ? test : test.skip.bind(test);
unauthorizedTest('an unassigned legal entity cannot be selected by request header', async () => {
  const base = apiBase.replace(/\/$/, '');
  const response = await fetch(`${base}/api/session`, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-legal-entity-id': unauthorizedEntityId,
    },
  });
  assert.equal(response.status, 403);
});
