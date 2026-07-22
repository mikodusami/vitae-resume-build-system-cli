import { describe, expect, it } from 'vitest';

import { ClaimsPolicy, DIAGNOSTIC_CODES } from '../../src/domain/services/ClaimsPolicy.js';
import { ClaimsResolver } from '../../src/domain/services/ClaimsResolver.js';
import { DOMAIN_ERROR_CODES } from '../../src/domain/errors/domainError.js';
import type { Defensibility } from '../../src/domain/model/content.js';
import { makeClaim, makeLibrary, makeProject, makeVariant } from './fixtures.js';

/** Resolves a variant's claims, throwing when resolution was expected to work. */
function resolveOrThrow(defensibility: Defensibility) {
  const library = makeLibrary({
    claims: [makeClaim('etl', { defensibility }), makeClaim('ranker')],
  });
  const result = new ClaimsResolver().resolve(makeVariant('v'), library);
  if (!result.ok) {
    throw new Error(result.error.map((e) => e.message).join('; '));
  }
  return result.value;
}

describe('ClaimsPolicy', () => {
  it('treats cannot-defend as an error that blocks the build', () => {
    const report = new ClaimsPolicy().evaluate(resolveOrThrow('cannot-defend'));

    expect(report.hasErrors).toBe(true);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]?.severity).toBe('error');
    expect(report.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.cannotDefend);
    expect(report.diagnostics[0]?.claimId).toBe('etl');
  });

  it('treats needs-review as a non-blocking warning', () => {
    const report = new ClaimsPolicy().evaluate(resolveOrThrow('needs-review'));

    expect(report.hasErrors).toBe(false);
    expect(report.diagnostics[0]?.severity).toBe('warning');
    expect(report.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.needsReview);
  });

  it('reports nothing when every claim is confident', () => {
    const report = new ClaimsPolicy().evaluate(resolveOrThrow('confident'));

    expect(report.diagnostics).toEqual([]);
    expect(report.hasErrors).toBe(false);
  });

  it('honours a custom severity mapping', () => {
    const strict = new ClaimsPolicy({
      'cannot-defend': 'error',
      'needs-review': 'error',
      confident: 'none',
    });

    const report = strict.evaluate(resolveOrThrow('needs-review'));

    expect(report.hasErrors).toBe(true);
    expect(report.diagnostics[0]?.severity).toBe('error');
  });

  it('can be relaxed so cannot-defend only warns', () => {
    const lenient = new ClaimsPolicy({
      'cannot-defend': 'warning',
      'needs-review': 'none',
      confident: 'none',
    });

    const report = lenient.evaluate(resolveOrThrow('cannot-defend'));

    expect(report.hasErrors).toBe(false);
    expect(report.diagnostics).toHaveLength(1);
  });
});

describe('ClaimsResolver', () => {
  it('collapses alternate framings that share a claim', () => {
    const library = makeLibrary({
      projects: [
        makeProject('etl'),
        makeProject('etl-gov', { claimId: 'etl' }),
        makeProject('ranker'),
      ],
      variants: [makeVariant('v', { projectIds: ['etl', 'etl-gov'] })],
    });

    const result = new ClaimsResolver().resolve(makeVariant('v', { projectIds: ['etl', 'etl-gov'] }), library);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.projectIds).toEqual(['etl', 'etl-gov']);
  });

  it('surfaces review notes for the prep command', () => {
    const library = makeLibrary({
      claims: [
        makeClaim('etl', { defensibility: 'needs-review', reviewNotes: ['Reread the entrypoint'] }),
        makeClaim('ranker'),
      ],
    });

    const result = new ClaimsResolver().resolve(makeVariant('v'), library);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.claim.reviewNotes).toEqual(['Reread the entrypoint']);
  });

  it('reports a project whose claim is missing from the registry', () => {
    const library = makeLibrary({ claims: [makeClaim('ranker')] });

    const result = new ClaimsResolver().resolve(makeVariant('v'), library);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]?.code).toBe(DOMAIN_ERROR_CODES.unknownClaim);
    expect(result.error[0]?.message).toContain('etl');
  });
});
