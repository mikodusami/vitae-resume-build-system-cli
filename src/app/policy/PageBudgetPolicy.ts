/**
 * PageBudgetPolicy — the one-page limit, as an enforced test.
 *
 * The rule most people apply by eyeballing a printout. Holding it in a policy
 * object means the limit is configurable and the judgement lives in one place,
 * the same way `ClaimsPolicy` holds the defensibility rule.
 */

import type { Diagnostic } from '../../domain/index.js';

/** Resumes are one page unless the user says otherwise. */
export const DEFAULT_PAGE_LIMIT = 1;

/** Diagnostic codes this policy produces. */
export const PAGE_BUDGET_CODES = {
  exceeded: 'PAGE_BUDGET_EXCEEDED',
  skipped: 'PAGE_BUDGET_SKIPPED',
} as const;

/** Judges rendered page counts against a limit. */
export class PageBudgetPolicy {
  /**
   * @param limit - maximum pages; from `config.json`, defaulting to one
   */
  public constructor(private readonly limit: number = DEFAULT_PAGE_LIMIT) {}

  /** The configured maximum. */
  public get maxPages(): number {
    return this.limit;
  }

  /**
   * Judges one variant's page count.
   *
   * @param variantId - for the message
   * @param pages - measured page count
   * @returns an error diagnostic when over budget, otherwise nothing
   */
  public evaluate(variantId: string, pages: number): Diagnostic | undefined {
    if (pages <= this.limit) {
      return undefined;
    }

    return {
      severity: 'error',
      code: PAGE_BUDGET_CODES.exceeded,
      message:
        `${variantId} renders to ${pages} pages, over the ${this.limit}-page limit. ` +
        'Cut a bullet, or raise pageLimit in config.json.',
    };
  }

  /**
   * Reports that the check could not run.
   *
   * A warning, never a failure: LibreOffice is optional, and failing a check
   * because an optional dependency is absent would make the tool unusable for
   * anyone who just wants to build a resume. Equally it is never a silent
   * pass — the user must know the gate did not run.
   */
  public skipped(reason: string): Diagnostic {
    return {
      severity: 'warning',
      code: PAGE_BUDGET_CODES.skipped,
      message: `Page-count check skipped: ${reason}`,
    };
  }
}
