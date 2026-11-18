import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundError } from '../src/errors.js';
import { delay, toResult } from '../src/utils.js';

describe('delay', () => {
  it('resolves after roughly the given time', async () => {
    const startedAt = performance.now();
    await delay(20);
    assert.ok(performance.now() - startedAt >= 15);
  });
});

describe('toResult', () => {
  it('wraps a resolved value as ok', async () => {
    const result = await toResult(Promise.resolve(42));
    assert.deepEqual(result, { ok: true, value: 42 });
  });

  it('wraps a rejection as an error instead of throwing', async () => {
    const result = await toResult(Promise.reject(new NotFoundError('Task', 'x')));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error instanceof NotFoundError);
    }
  });

  it('turns a non-Error rejection into an Error', async () => {
    const result = await toResult(Promise.reject('plain string'));
    assert.ok(!result.ok && result.error instanceof Error && result.error.message === 'plain string');
  });
});
