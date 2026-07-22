/**
 * The one-page gate.
 *
 * The rule most people apply by eyeballing a printout, here as a test.
 */

import { describe, expect, it } from 'vitest';

import {
  CheckWorkspaceUseCase,
  PageBudgetPolicy,
  RendererFactory,
  type PageCounter,
  type PdfConverter,
} from '../../src/app/index.js';
import {
  ClaimsPolicy,
  ClaimsResolver,
  ContentLibrary,
  ResumeComposer,
  err,
  ok,
  type DomainError,
  type Result,
} from '../../src/domain/index.js';
import { DEFAULT_THEME } from '../../src/render/index.js';
import { makeLibraryData } from '../domain/fixtures.js';

/** Converts to fixed stub bytes; the counter decides the page count. */
class StubConverter implements PdfConverter {
  public convert(): Promise<Result<Buffer, DomainError>> {
    return Promise.resolve(ok(Buffer.from('%PDF stub')));
  }
}

/** A converter standing in for a machine without LibreOffice. */
class UnavailableConverter implements PdfConverter {
  public convert(): Promise<Result<Buffer, DomainError>> {
    return Promise.resolve(
      err(
        new (class extends Error {
          public readonly code = 'CAPABILITY_UNAVAILABLE';
        })('PDF conversion requires LibreOffice, which was not found.') as unknown as DomainError,
      ),
    );
  }
}

/** Reports a fixed page count. */
class StubCounter implements PageCounter {
  public constructor(private readonly pages: number) {}

  public count(): Promise<Result<number, DomainError>> {
    return Promise.resolve(ok(this.pages));
  }
}

/** The fixture library. */
function library(): ContentLibrary {
  const created = ContentLibrary.create(makeLibraryData());
  if (!created.ok) throw new Error('bad fixture');
  return created.value;
}

/** Builds the use case with or without a working page budget. */
function makeUseCase(pages?: number, converter: PdfConverter = new StubConverter()) {
  return new CheckWorkspaceUseCase(
    new ResumeComposer(),
    new ClaimsResolver(),
    new ClaimsPolicy(),
    pages === undefined
      ? undefined
      : {
          rendererFactory: new RendererFactory(DEFAULT_THEME),
          pdfConverter: converter,
          pageCounter: new StubCounter(pages),
          policy: new PageBudgetPolicy(),
        },
  );
}

describe('PageBudgetPolicy', () => {
  it('passes a one-page resume', () => {
    expect(new PageBudgetPolicy().evaluate('v', 1)).toBeUndefined();
  });

  it('fails a two-page resume with an actionable message', () => {
    const diagnostic = new PageBudgetPolicy().evaluate('v', 2);

    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.message).toContain('2 pages');
    expect(diagnostic?.message).toContain('pageLimit');
  });

  it('honours a raised limit', () => {
    expect(new PageBudgetPolicy(2).evaluate('v', 2)).toBeUndefined();
    expect(new PageBudgetPolicy(2).evaluate('v', 3)?.severity).toBe('error');
  });

  it('reports a skip as a warning, never a pass and never a failure', () => {
    const diagnostic = new PageBudgetPolicy().skipped('LibreOffice was not found.');

    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic.message).toContain('skipped');
  });
});

describe('check --pages', () => {
  it('records the page count and passes when within budget', async () => {
    const report = await makeUseCase(1).execute(library(), { pages: true });

    expect(report.pageCounts).toEqual({ 'data-engineer': 1 });
    expect(report.variants[0]?.passed).toBe(true);
  });

  it('fails a variant that runs over the limit', async () => {
    const report = await makeUseCase(2).execute(library(), { pages: true });

    expect(report.variants[0]?.passed).toBe(false);
    expect(
      report.variants[0]?.diagnostics.some((d) => d.code === 'PAGE_BUDGET_EXCEEDED'),
    ).toBe(true);
  });

  it('warns rather than fails when LibreOffice is missing', async () => {
    const report = await makeUseCase(1, new UnavailableConverter()).execute(library(), {
      pages: true,
    });

    // Never a failure — the tool must stay usable without LibreOffice — but
    // never a silent pass either: the user has to know the gate did not run.
    expect(report.variants[0]?.passed).toBe(true);
    const skipped = report.variants[0]?.diagnostics.find((d) => d.code === 'PAGE_BUDGET_SKIPPED');
    expect(skipped?.severity).toBe('warning');
    expect(skipped?.message).toContain('LibreOffice');
  });

  it('warns when no page-budget support was wired in at all', async () => {
    const report = await makeUseCase(undefined).execute(library(), { pages: true });

    expect(report.variants[0]?.passed).toBe(true);
    expect(
      report.variants[0]?.diagnostics.some((d) => d.code === 'PAGE_BUDGET_SKIPPED'),
    ).toBe(true);
  });

  it('does not convert anything unless asked', async () => {
    const report = await makeUseCase(2).execute(library());

    // The default check stays fast: no LibreOffice, no page counts.
    expect(report.pageCounts).toBeUndefined();
    expect(report.variants[0]?.passed).toBe(true);
  });
});
