import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRelease } from '../scripts/terminal-release-check.mjs';

test('marks release safe when every service is SUCCESS', () => {
  const result = evaluateRelease([
    { name: 'web', status: 'SUCCESS' },
    { name: 'api', status: 'success' },
    { name: 'worker', status: 'SUCCESS' },
  ]);

  assert.equal(result.total, 3);
  assert.equal(result.healthy, 3);
  assert.equal(result.safeToPromote, true);
  assert.deepEqual(result.unhealthy, []);
});

test('holds release and reports unhealthy services', () => {
  const result = evaluateRelease([
    { name: 'web', status: 'SUCCESS' },
    { name: 'api', status: 'DEPLOYING' },
    { name: 'worker', status: 'FAILED' },
  ]);

  assert.equal(result.total, 3);
  assert.equal(result.healthy, 1);
  assert.equal(result.safeToPromote, false);
  assert.deepEqual(result.unhealthy, [
    { name: 'api', status: 'DEPLOYING' },
    { name: 'worker', status: 'FAILED' },
  ]);
});

test('rejects an empty service list', () => {
  assert.throws(() => evaluateRelease([]), /non-empty array/);
});
