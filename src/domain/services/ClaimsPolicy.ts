/**
 * ClaimsPolicy — the honesty rule, as an injectable strategy.
 *
 * The rule "a cannot-defend claim blocks the build" lives here rather than as
 * scattered conditionals, so a command can tighten or relax it (a check-only
 * mode, a `--force` escape hatch) without touching resolution or composition.
 */

import type { Defensibility } from '../model/content.js';
import type { ResolvedClaim } from './ClaimsResolver.js';

/** How seriously a diagnostic should be taken. */
export type DiagnosticSeverity = 'error' | 'warning';

/** Per-tier outcome; `none` means the tier produces no diagnostic at all. */
export type DefensibilityOutcome = DiagnosticSeverity | 'none';

/** Stable identifiers for validation diagnostics. */
export const DIAGNOSTIC_CODES = {
  cannotDefend: 'CLAIM_CANNOT_DEFEND',
  needsReview: 'CLAIM_NEEDS_REVIEW',
} as const;

/** One finding about a variant's claims. */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  /** Machine-readable code; see {@link DIAGNOSTIC_CODES}. */
  readonly code: string;
  readonly message: string;
  readonly claimId?: string;
}

/** Everything the policy found, plus a quick verdict. */
export interface ValidationReport {
  readonly diagnostics: readonly Diagnostic[];
  /** True when at least one diagnostic is an error. */
  readonly hasErrors: boolean;
}

/** Default mapping: undefendable blocks, unreviewed warns, confident is clean. */
export const DEFAULT_SEVERITY_BY_DEFENSIBILITY: Readonly<Record<Defensibility, DefensibilityOutcome>> =
  {
    'cannot-defend': 'error',
    'needs-review': 'warning',
    confident: 'none',
  };

/** Diagnostic code for each tier that produces one. */
const CODE_BY_DEFENSIBILITY: Readonly<Partial<Record<Defensibility, string>>> = {
  'cannot-defend': DIAGNOSTIC_CODES.cannotDefend,
  'needs-review': DIAGNOSTIC_CODES.needsReview,
};

/** Human-readable explanation for each tier that produces a diagnostic. */
const MESSAGE_BY_DEFENSIBILITY: Readonly<Partial<Record<Defensibility, string>>> = {
  'cannot-defend': 'cannot be defended and must not ship on this variant',
  'needs-review': 'needs review before this variant is sent',
};

/** Evaluates resolved claims against a defensibility severity mapping. */
export class ClaimsPolicy {
  /**
   * @param severityByDefensibility - per-tier outcome; defaults to
   * {@link DEFAULT_SEVERITY_BY_DEFENSIBILITY}. Override to relax or tighten
   * the rule for a single command.
   */
  public constructor(
    private readonly severityByDefensibility: Readonly<
      Record<Defensibility, DefensibilityOutcome>
    > = DEFAULT_SEVERITY_BY_DEFENSIBILITY,
  ) {}

  /**
   * Produces a report for the claims a variant puts on the page.
   *
   * @param resolvedClaims - output of `ClaimsResolver.resolve`
   */
  public evaluate(resolvedClaims: readonly ResolvedClaim[]): ValidationReport {
    const diagnostics: Diagnostic[] = [];

    for (const { claim, projectIds } of resolvedClaims) {
      const outcome = this.severityByDefensibility[claim.defensibility];
      if (outcome === 'none') {
        continue;
      }

      const code = CODE_BY_DEFENSIBILITY[claim.defensibility] ?? DIAGNOSTIC_CODES.needsReview;
      const reason = MESSAGE_BY_DEFENSIBILITY[claim.defensibility] ?? 'requires attention';

      diagnostics.push({
        severity: outcome,
        code,
        message: `Claim "${claim.id}" (${projectIds.join(', ')}) ${reason}.`,
        claimId: claim.id,
      });
    }

    return {
      diagnostics,
      hasErrors: diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    };
  }
}
