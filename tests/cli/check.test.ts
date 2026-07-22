import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCheck } from '../../src/cli/commands/check.js';
import { makeClaim, makeLibrary, makeVariant } from '../domain/fixtures.js';

/** Silences command output so test runs stay readable. */
function silenceConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('vitae check', () => {
  it('exits 0 when every claim is confident', () => {
    silenceConsole();
    const library = makeLibrary({ variants: [makeVariant('v')] });

    expect(runCheck(library, 'v')).toBe(0);
  });

  it('exits 0 on warnings — needs-review does not block', () => {
    silenceConsole();
    const library = makeLibrary({
      claims: [makeClaim('etl', { defensibility: 'needs-review' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });

    expect(runCheck(library, 'v')).toBe(0);
  });

  it('exits 1 when a claim cannot be defended', () => {
    silenceConsole();
    const library = makeLibrary({
      claims: [makeClaim('etl', { defensibility: 'cannot-defend' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });

    expect(runCheck(library, 'v')).toBe(1);
  });

  it('exits 1 and names the variant when it does not exist', () => {
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      errors.push(message);
    });
    const library = makeLibrary({ variants: [makeVariant('v')] });

    expect(runCheck(library, 'ghost')).toBe(1);
    expect(String(errors[0])).toContain('ghost');
  });
});
