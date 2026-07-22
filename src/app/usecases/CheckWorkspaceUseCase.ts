/**
 * CheckWorkspaceUseCase — validate everything, write nothing.
 *
 * Composition still runs: a variant whose project IDs do not resolve is a
 * failure worth reporting even though no file was going to be produced.
 */

import {
  type ClaimsPolicy,
  type ClaimsResolver,
  type ContentLibrary,
  type Diagnostic,
  type ResumeComposer,
} from '../../domain/index.js';
import { toDiagnostic, type CheckReport, type VariantCheckReport } from '../reports/reports.js';
import { PageBudgetPolicy } from '../policy/PageBudgetPolicy.js';
import type { PageCounter, PdfConverter } from '../ports/environment.js';
import type { RendererFactory } from '../render/RendererFactory.js';

/** Which variants to check; omit to check them all. */
export interface CheckInput {
  readonly variantId?: string | undefined;
  /**
   * Also render each variant and count its pages.
   *
   * Off by default because it costs a LibreOffice conversion per variant —
   * seconds, not milliseconds.
   */
  readonly pages?: boolean | undefined;
}

/** Optional collaborators for the page-count gate. */
export interface PageBudgetDependencies {
  readonly rendererFactory: RendererFactory;
  readonly pdfConverter: PdfConverter;
  readonly pageCounter: PageCounter;
  readonly policy: PageBudgetPolicy;
}

/** Validates variants without producing artifacts. */
export class CheckWorkspaceUseCase {
  /**
   * @param pageBudget - omitted when this machine cannot render PDFs; the
   * check then reports that it was skipped rather than silently passing
   */
  public constructor(
    private readonly composer: ResumeComposer,
    private readonly claimsResolver: ClaimsResolver,
    private readonly claimsPolicy: ClaimsPolicy,
    private readonly pageBudget?: PageBudgetDependencies | undefined,
  ) {}

  /**
   * Checks one variant or the whole workspace.
   *
   * @param library - already-loaded content
   * @param input - optional single-variant filter
   */
  public async execute(library: ContentLibrary, input: CheckInput = {}): Promise<CheckReport> {
    if (input.variantId !== undefined) {
      const variant = library.getVariant(input.variantId);
      if (!variant.ok) {
        return {
          variants: [
            {
              variantId: input.variantId,
              passed: false,
              diagnostics: [toDiagnostic(variant.error)],
            },
          ],
        };
      }
    }

    const targets = library
      .listVariants()
      .filter((variant) => input.variantId === undefined || variant.id === input.variantId);

    const variants = targets.map((variant) => this.checkVariant(library, variant.id));

    if (input.pages !== true) {
      return { variants };
    }

    return this.withPageCounts(library, variants);
  }

  /**
   * Renders each variant and measures its page count.
   *
   * Fills the `pageCounts` seam left optional when this use case was written.
   * Every failure path here produces a warning rather than an error: the point
   * is to tell the user the gate did not run, never to fail a check because
   * their machine lacks an optional program.
   */
  private async withPageCounts(
    library: ContentLibrary,
    variants: readonly VariantCheckReport[],
  ): Promise<CheckReport> {
    const budget = this.pageBudget;
    if (budget === undefined) {
      return {
        variants: variants.map((variant) => ({
          ...variant,
          diagnostics: [
            ...variant.diagnostics,
            new PageBudgetPolicy().skipped('LibreOffice was not found on this machine.'),
          ],
        })),
      };
    }

    const pageCounts: Record<string, number> = {};
    const measured: VariantCheckReport[] = [];

    for (const variant of variants) {
      const extra = await this.measure(library, variant.variantId, budget, pageCounts);
      const diagnostics = [...variant.diagnostics, ...extra];

      measured.push({
        variantId: variant.variantId,
        passed: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
        diagnostics,
      });
    }

    return { variants: measured, pageCounts };
  }

  /** Measures one variant, recording its count and any budget verdict. */
  private async measure(
    library: ContentLibrary,
    variantId: string,
    budget: PageBudgetDependencies,
    pageCounts: Record<string, number>,
  ): Promise<Diagnostic[]> {
    const variant = library.getVariant(variantId);
    if (!variant.ok) {
      return [];
    }

    const composed = this.composer.compose(variant.value, library);
    if (!composed.ok) {
      // Composition already reported its own errors; nothing to add.
      return [];
    }

    const renderer = budget.rendererFactory.create('docx');
    if (!renderer.ok) {
      return [budget.policy.skipped(renderer.error.message)];
    }

    const rendered = await renderer.value.render(composed.value);
    if (typeof rendered === 'string') {
      return [budget.policy.skipped('the docx renderer did not produce bytes')];
    }

    const pdf = await budget.pdfConverter.convert(rendered, variantId);
    if (!pdf.ok) {
      return [budget.policy.skipped(pdf.error.message)];
    }

    const pages = await budget.pageCounter.count(pdf.value);
    if (!pages.ok) {
      return [budget.policy.skipped(pages.error.message)];
    }

    pageCounts[variantId] = pages.value;

    const verdict = budget.policy.evaluate(variantId, pages.value);
    return verdict === undefined ? [] : [verdict];
  }

  /** Composes and validates a single variant. */
  private checkVariant(library: ContentLibrary, variantId: string): VariantCheckReport {
    const variant = library.getVariant(variantId);
    if (!variant.ok) {
      return { variantId, passed: false, diagnostics: [toDiagnostic(variant.error)] };
    }

    const diagnostics: Diagnostic[] = [];

    const composed = this.composer.compose(variant.value, library);
    if (!composed.ok) {
      diagnostics.push(...composed.error.map(toDiagnostic));
    }

    const resolvedClaims = this.claimsResolver.resolve(variant.value, library);
    if (!resolvedClaims.ok) {
      diagnostics.push(...resolvedClaims.error.map(toDiagnostic));
    } else {
      diagnostics.push(...this.claimsPolicy.evaluate(resolvedClaims.value).diagnostics);
    }

    return {
      variantId,
      passed: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      diagnostics,
    };
  }
}
