import { describe, expect, it } from 'vitest';

import { andThen, collect, err, isErr, isOk, map, ok, unwrapOr } from '../../src/domain/primitives/result.js';

describe('Result', () => {
  it('narrows success and failure', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('boom'))).toBe(true);
  });

  it('maps over success and passes failure through', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(map(err<string>('boom'), (n: number) => n)).toEqual({ ok: false, error: 'boom' });
  });

  it('chains fallible operations only on success', () => {
    const double = (n: number) => ok(n * 2);

    expect(andThen(ok(2), double)).toEqual({ ok: true, value: 4 });
    expect(andThen(err<string>('boom'), double)).toEqual({ ok: false, error: 'boom' });
  });

  it('falls back to a default on failure', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err<string>('boom'), 9)).toBe(9);
  });

  it('collects every error instead of stopping at the first', () => {
    const collected = collect([ok(1), err('a'), ok(2), err('b')]);

    expect(collected.ok).toBe(false);
    if (collected.ok) return;
    expect(collected.error).toEqual(['a', 'b']);
  });

  it('collects values in order when everything succeeds', () => {
    expect(collect([ok(1), ok(2)])).toEqual({ ok: true, value: [1, 2] });
  });
});
