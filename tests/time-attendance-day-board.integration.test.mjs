import test from 'node:test';
import assert from 'node:assert/strict';

const apiBase = process.env.MULTI_COMPANY_TEST_API_BASE;
const token = process.env.MULTI_COMPANY_TEST_TOKEN;
const apiTest = apiBase && token ? test : test.skip.bind(test);

apiTest('admin day board returns scoped daily attendance payload', async () => {
  const base = apiBase.replace(/\/$/, '');
  const date = new Date().toISOString().slice(0, 10);
  const response = await fetch(`${base}/api/admin/time-attendance/day-board?date=${encodeURIComponent(date)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const data = body.data;
  assert.ok(data);
  assert.equal(data.date, date);
  assert.ok(Array.isArray(data.locations));
  assert.ok(Array.isArray(data.rows));
  assert.ok(Array.isArray(data.unscheduledClockedIn));
  assert.ok(data.metrics && typeof data.metrics === 'object');
  assert.equal(typeof data.metrics.locations, 'number');
  assert.equal(typeof data.metrics.scheduledShifts, 'number');
  assert.equal(typeof data.metrics.clockedIn, 'number');
  assert.equal(typeof data.metrics.exceptions, 'number');
});

apiTest('day board rejects invalid date format', async () => {
  const base = apiBase.replace(/\/$/, '');
  const response = await fetch(`${base}/api/admin/time-attendance/day-board?date=08-30-2026`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 400);
});