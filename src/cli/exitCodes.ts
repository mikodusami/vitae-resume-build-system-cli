/**
 * Exit code policy — one table, one function.
 *
 * `2` is deliberately separate from `1`: a CI step or shell script needs to
 * react to "you have an undefendable claim on this resume" differently from
 * "your content is broken". Nothing else in the codebase decides an exit code.
 */

import type { BuildReport, CheckReport, VariantBuildReport } from '../app/index.js';

/** The only exit codes this tool produces. */
export const EXIT_CODES = {
  /** Everything worked. */
  success: 0,
  /** Something was broken: bad content, I/O failure, unknown variant, bad usage. */
  failure: 1,
  /** Everything worked, but the claims policy refused to ship it. */
  blocked: 2,
} as const;

/** A process exit code. */
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** Worst outcome across a set of variant builds. */
export function exitCodeForBuild(report: BuildReport): ExitCode {
  return worstOf(report.variants.map(statusToExitCode));
}

/** Exit code for a single variant build. */
export function exitCodeForVariant(report: VariantBuildReport): ExitCode {
  return statusToExitCode(report);
}

/**
 * Exit code for a validation run.
 *
 * A variant fails a check either because it is broken or because a claim
 * cannot be defended; the diagnostic codes distinguish them, so blocked wins
 * only when nothing was actually broken.
 */
export function exitCodeForCheck(report: CheckReport): ExitCode {
  const codes = report.variants.map((variant) => {
    if (variant.passed) {
      return EXIT_CODES.success;
    }

    const claimsOnly = variant.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .every((diagnostic) => diagnostic.code.startsWith('CLAIM_'));

    return claimsOnly ? EXIT_CODES.blocked : EXIT_CODES.failure;
  });

  return worstOf(codes);
}

/** Maps a build status onto its exit code. */
function statusToExitCode(report: VariantBuildReport): ExitCode {
  if (report.status === 'written') {
    return EXIT_CODES.success;
  }
  return report.status === 'blocked' ? EXIT_CODES.blocked : EXIT_CODES.failure;
}

/**
 * Picks the most serious code.
 *
 * A run that is both broken and blocked reports broken: fix what is broken
 * first, since the claim gate cannot even be trusted until the content loads.
 */
function worstOf(codes: readonly ExitCode[]): ExitCode {
  if (codes.includes(EXIT_CODES.failure)) {
    return EXIT_CODES.failure;
  }
  return codes.includes(EXIT_CODES.blocked) ? EXIT_CODES.blocked : EXIT_CODES.success;
}
