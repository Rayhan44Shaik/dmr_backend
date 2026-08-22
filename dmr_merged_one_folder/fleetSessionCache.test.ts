import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fleetCacheGet,
  fleetCacheInvalidate,
  fleetCacheSet,
  fleetSharedGet,
} from './fleetSessionCache';

describe('fleetSessionCache', () => {
  it('stores and returns a value until invalidated', () => {
    fleetCacheInvalidate();
    fleetCacheSet('analytics:test', { total: 1 });
    assert.deepEqual(fleetCacheGet('analytics:test'), { total: 1 });
    fleetCacheInvalidate('analytics:');
    assert.equal(fleetCacheGet('analytics:test'), undefined);
  });

  it('deduplicates concurrent loaders for the same key', async () => {
    fleetCacheInvalidate();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { ok: true };
    };
    const [a, b] = await Promise.all([
      fleetSharedGet('emi:list', loader),
      fleetSharedGet('emi:list', loader),
    ]);
    assert.deepEqual(a, { ok: true });
    assert.deepEqual(b, { ok: true });
    assert.equal(calls, 1);
  });
});
