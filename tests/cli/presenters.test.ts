import { describe, expect, it } from 'vitest';

import type { BuildReport, CheckReport, ListReport } from '../../src/app/index.js';
import type { Diagnostic } from '../../src/domain/index.js';
import { Colorizer } from '../../src/cli/presenters/color.js';
import { ANSI_ESCAPE, ansiCode } from './harness.js';
import { HumanPresenter } from '../../src/cli/presenters/HumanPresenter.js';
import { JsonPresenter } from '../../src/cli/presenters/JsonPresenter.js';

/** Presenter with colour off, matching a piped or redirected stdout. */
function plain(): HumanPresenter {
  return new HumanPresenter(new Colorizer(false));
}

/** Presenter with colour forced on, for asserting escapes exist. */
function colored(): HumanPresenter {
  return new HumanPresenter(new Colorizer(true));
}

const BUILD_REPORT: BuildReport = {
  workspaceRoot: '/ws/.vitae',
  variants: [
    {
      variantId: 'software-engineer',
      status: 'written',
      outputPath: '/ws/.vitae/dist/resume_software_engineer.docx',
      byteLength: 10651,
      diagnostics: [
        {
          severity: 'warning',
          code: 'CLAIM_NEEDS_REVIEW',
          message: 'Claim "tempo" needs review.',
          claimId: 'tempo',
        },
      ],
    },
    {
      variantId: 'backend',
      status: 'blocked',
      diagnostics: [
        {
          severity: 'error',
          code: 'CLAIM_CANNOT_DEFEND',
          message: 'Claim "ledger" cannot be defended.',
          claimId: 'ledger',
        },
      ],
    },
  ],
};

describe('HumanPresenter build', () => {
  it('shows path and byte size for a written variant', () => {
    const text = plain().build(BUILD_REPORT);

    expect(text).toContain('resume_software_engineer.docx');
    expect(text).toContain('10651 bytes');
  });

  it('aligns variant ids into a column', () => {
    const text = plain().build(BUILD_REPORT);

    const [first = '', second = ''] = text.split('\n');
    // 'backend' is shorter than 'software-engineer', so it must be padded.
    expect(first.indexOf('/ws')).toBeGreaterThan(0);
    expect(second).toContain('warning');
  });

  it('suggests --force when a variant is blocked', () => {
    const text = plain().build(BUILD_REPORT);

    expect(text).toContain('blocked');
    expect(text).toContain('--force');
  });

  it('distinguishes warnings from errors', () => {
    const text = colored().build(BUILD_REPORT);

    // Yellow for the warning, red for the error — the difference between
    // "be ready to talk about it" and "do not send this".
    expect(text).toContain(ansiCode(33));
    expect(text).toContain(ansiCode(31));
  });

  it('emits no escapes when colour is off', () => {
    const text = plain().build(BUILD_REPORT);

    expect(text).not.toMatch(ANSI_ESCAPE);
  });

  it('handles an empty report without crashing', () => {
    expect(plain().build({ workspaceRoot: '/ws', variants: [] })).toContain('No variants');
  });
});

describe('HumanPresenter check and list', () => {
  const CHECK_REPORT: CheckReport = {
    variants: [
      { variantId: 'ok-one', passed: true, diagnostics: [] },
      {
        variantId: 'bad-one',
        passed: false,
        diagnostics: [
          { severity: 'error', code: 'CLAIM_CANNOT_DEFEND', message: 'Claim "x" cannot be defended.' },
        ],
      },
    ],
  };

  const LIST_REPORT: ListReport = {
    variants: [
      {
        variantId: 'software-engineer',
        label: 'Software Engineer',
        projectNames: ['Ledger', 'Tempo'],
        claimTiers: { confident: 1, 'needs-review': 1, 'cannot-defend': 0 },
        diagnostics: [],
      },
    ],
  };

  it('marks each variant pass or fail', () => {
    const text = plain().check(CHECK_REPORT);

    expect(text).toContain('ok-one');
    expect(text).toContain('ok');
    expect(text).toContain('problems');
  });

  it('renders the page-count seam when a later layer fills it', () => {
    const text = plain().check({ ...CHECK_REPORT, pageCounts: { 'ok-one': 1 } });

    expect(text).toContain('Page counts');
    expect(text).toContain('ok-one');
  });

  it('shows projects and claim tiers inline, since that is the question list answers', () => {
    const text = plain().list(LIST_REPORT);

    expect(text).toContain('Software Engineer');
    expect(text).toContain('Ledger');
    expect(text).toContain('1 confident');
    expect(text).toContain('1 needs-review');
    // Zero-count tiers would be noise.
    expect(text).not.toContain('0 cannot-defend');
  });

  it('explains what to do when there are no variants', () => {
    const text = plain().list({ variants: [] });

    expect(text).toContain('variants/');
  });
});

describe('JsonPresenter', () => {
  it('round-trips every report type', () => {
    const presenter = new JsonPresenter();

    expect(JSON.parse(presenter.build(BUILD_REPORT))).toEqual(BUILD_REPORT);
    expect(JSON.parse(presenter.list({ variants: [] }))).toEqual({ variants: [] });
    expect(JSON.parse(presenter.check({ variants: [] }))).toEqual({ variants: [] });
  });

  it('wraps bare diagnostics in an object so output is always a JSON object', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', code: 'WORKSPACE_NOT_FOUND', message: 'no workspace' },
    ];

    expect(JSON.parse(new JsonPresenter().diagnostics(diagnostics))).toEqual({ diagnostics });
  });

  it('never emits colour', () => {
    const text = new JsonPresenter().build(BUILD_REPORT);

    expect(text).not.toMatch(ANSI_ESCAPE);
  });
});

describe('Colorizer', () => {
  it('disables colour when stdout is not a TTY', () => {
    const colorizer = Colorizer.forOutput({ noColor: false, json: false }, false, {});

    expect(colorizer.error('x')).toBe('x');
  });

  it('disables colour under --json even on a TTY', () => {
    const colorizer = Colorizer.forOutput({ noColor: false, json: true }, true, {});

    expect(colorizer.error('x')).toBe('x');
  });

  it('honours NO_COLOR, the cross-tool convention', () => {
    const colorizer = Colorizer.forOutput({ noColor: false, json: false }, true, { NO_COLOR: '1' });

    expect(colorizer.error('x')).toBe('x');
  });

  it('colours on a TTY when nothing objects', () => {
    const colorizer = Colorizer.forOutput({ noColor: false, json: false }, true, {});

    expect(colorizer.error('x')).toContain('x');
    expect(colorizer.error('x')).not.toBe('x');
  });
});
