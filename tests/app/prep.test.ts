/**
 * Prep checklist generation, including a golden file.
 *
 * The golden file is the fast regression signal on output that a person is
 * meant to read and tick through.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PrepUseCase } from '../../src/app/index.js';
import { ClaimsResolver, ContentLibrary } from '../../src/domain/index.js';
import { Colorizer } from '../../src/cli/presenters/color.js';
import { HumanPresenter } from '../../src/cli/presenters/HumanPresenter.js';
import { makeLibraryData } from '../domain/fixtures.js';

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), 'prep.golden.md');

/** A library whose single variant carries all three defensibility tiers. */
function libraryWithEveryTier(): ContentLibrary {
  const data = makeLibraryData({
    projects: [
      {
        id: 'p-confident',
        claimId: 'c-confident',
        name: 'Ledger',
        tech: 'TypeScript',
        link: 'github.com/x/ledger',
        bullets: ['Append-only journal with derived balances.'],
      },
      {
        id: 'p-review',
        claimId: 'c-review',
        name: 'Tempo',
        tech: 'Python',
        link: 'github.com/x/tempo',
        bullets: ['Job scheduler with at-least-once delivery.'],
      },
      {
        id: 'p-cannot',
        claimId: 'c-cannot',
        name: 'Atlas',
        tech: 'Go',
        link: 'github.com/x/atlas',
        bullets: ['Offline-first sync through a merge log.'],
      },
    ],
    claims: [
      { id: 'c-confident', defensibility: 'confident' },
      {
        id: 'c-review',
        defensibility: 'needs-review',
        reviewNotes: [
          'Reread the retry path end to end',
          'Know why at-least-once was the right trade',
        ],
      },
      {
        id: 'c-cannot',
        defensibility: 'cannot-defend',
        reviewNotes: ['Rebuild the sync layer before claiming it'],
      },
    ],
    variants: [
      {
        id: 'data-engineer',
        label: 'Data Engineer',
        summary: 'Pipelines that fail loudly.',
        coursework: 'Databases',
        skills: [{ label: 'Languages', body: 'TypeScript, Python' }],
        projectIds: ['p-confident', 'p-review', 'p-cannot'],
      },
    ],
  });

  const created = ContentLibrary.create(data);
  if (!created.ok) throw new Error(created.error.map((e) => e.message).join('; '));
  return created.value;
}

/** Runs prep at a fixed time so the output is comparable. */
function generate(): string {
  const useCase = new PrepUseCase(new ClaimsResolver(), () => new Date(Date.UTC(2026, 6, 22)));
  const report = useCase.execute(libraryWithEveryTier(), { variantId: 'data-engineer' });
  return new HumanPresenter(new Colorizer(false)).prep(report);
}

describe('PrepUseCase', () => {
  it('groups claims by tier, most urgent first', () => {
    const useCase = new PrepUseCase(new ClaimsResolver(), () => new Date(0));

    const report = useCase.execute(libraryWithEveryTier(), { variantId: 'data-engineer' });

    expect(report.sections.map((section) => section.tier)).toEqual([
      'cannot-defend',
      'needs-review',
      'confident',
    ]);
  });

  it('carries project names, not ids — a person reads this', () => {
    const useCase = new PrepUseCase(new ClaimsResolver(), () => new Date(0));

    const report = useCase.execute(libraryWithEveryTier(), { variantId: 'data-engineer' });

    expect(report.sections[0]?.entries[0]?.projectNames).toEqual(['Atlas']);
  });

  it('reports an unknown variant instead of an empty checklist', () => {
    const useCase = new PrepUseCase(new ClaimsResolver(), () => new Date(0));

    const report = useCase.execute(libraryWithEveryTier(), { variantId: 'nope' });

    expect(report.diagnostics[0]?.code).toBe('UNKNOWN_VARIANT');
    expect(report.sections).toHaveLength(0);
  });

  it('surfaces review notes exactly as the domain exposes them', () => {
    const useCase = new PrepUseCase(new ClaimsResolver(), () => new Date(0));

    const report = useCase.execute(libraryWithEveryTier(), { variantId: 'data-engineer' });
    const review = report.sections.find((section) => section.tier === 'needs-review');

    expect(review?.entries[0]?.notes).toEqual([
      'Reread the retry path end to end',
      'Know why at-least-once was the right trade',
    ]);
  });
});

describe('prep markdown', () => {
  it('matches the golden file', () => {
    const actual = generate();

    // Regenerate deliberately with UPDATE_GOLDEN=1 when the format changes.
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(GOLDEN_PATH, actual);
    }

    expect(actual).toBe(readFileSync(GOLDEN_PATH, 'utf8'));
  });

  it('renders notes as tickable checkboxes', () => {
    expect(generate()).toContain('- [ ] Reread the retry path end to end');
  });
});
