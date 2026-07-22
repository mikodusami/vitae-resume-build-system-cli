import { describe, expect, it } from 'vitest';

import { ArchiveNaming, DefaultNaming, formatStamp } from '../../src/app/index.js';
import { makeVariant } from '../domain/fixtures.js';

/** A fixed date, so filenames are assertable. */
const WHEN = new Date(2026, 6, 22);

describe('ArchiveNaming', () => {
  it('stamps a clean tree with the commit hash', () => {
    const naming = new ArchiveNaming({ hash: 'a1b2c3d', dirty: false }, WHEN);

    expect(naming.filenameFor(makeVariant('llm-infrastructure'), 'docx')).toBe(
      '2026-07-22_llm-infrastructure_a1b2c3d.docx',
    );
  });

  it('marks a dirty tree, because the hash alone would be a lie', () => {
    const naming = new ArchiveNaming({ hash: 'a1b2c3d', dirty: true }, WHEN);

    // The whole value of the archive is that `git show <hash>` reconstructs
    // what was sent. Uncommitted content makes that false, and the filename
    // has to say so.
    expect(naming.filenameFor(makeVariant('backend'), 'docx')).toBe(
      '2026-07-22_backend_a1b2c3d-dirty.docx',
    );
  });

  it('records the absence of git rather than inventing a hash', () => {
    const naming = new ArchiveNaming({ hash: undefined, dirty: false }, WHEN);

    expect(naming.filenameFor(makeVariant('backend'), 'docx')).toBe(
      '2026-07-22_backend_nogit.docx',
    );
  });

  it('carries the format through to the extension', () => {
    const naming = new ArchiveNaming({ hash: 'abc1234', dirty: false }, WHEN);

    expect(naming.filenameFor(makeVariant('v'), 'txt')).toBe('2026-07-22_v_abc1234.txt');
  });

  it('implements the same interface as the default strategy', () => {
    // The point of the Layer 4 naming seam: a second strategy drops in with no
    // change to the first, and no change to the use case that consumes it.
    const archive: { filenameFor: unknown } = new ArchiveNaming({ hash: 'a', dirty: false });
    const standard: { filenameFor: unknown } = new DefaultNaming();

    expect(typeof archive.filenameFor).toBe('function');
    expect(typeof standard.filenameFor).toBe('function');
  });
});

describe('formatStamp', () => {
  it('distinguishes all three provenance states', () => {
    expect(formatStamp({ hash: 'abc1234', dirty: false })).toBe('abc1234');
    expect(formatStamp({ hash: 'abc1234', dirty: true })).toBe('abc1234-dirty');
    expect(formatStamp({ hash: undefined, dirty: false })).toBe('nogit');
  });
});
