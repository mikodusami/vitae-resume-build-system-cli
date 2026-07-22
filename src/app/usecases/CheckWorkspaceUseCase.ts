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

/** Which variants to check; omit to check them all. */
export interface CheckInput {
  readonly variantId?: string | undefined;
}

/** Validates variants without producing artifacts. */
export class CheckWorkspaceUseCase {
  public constructor(
    private readonly composer: ResumeComposer,
    private readonly claimsResolver: ClaimsResolver,
    private readonly claimsPolicy: ClaimsPolicy,
  ) {}

  /**
   * Checks one variant or the whole workspace.
   *
   * @param library - already-loaded content
   * @param input - optional single-variant filter
   */
  public execute(library: ContentLibrary, input: CheckInput = {}): CheckReport {
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

    return { variants: targets.map((variant) => this.checkVariant(library, variant.id)) };
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
