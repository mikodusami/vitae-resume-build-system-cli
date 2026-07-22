/**
 * Report model — what use cases return instead of printing.
 *
 * Plain data: no ANSI, no formatting, no exit codes. If the CLI cannot print a
 * good message from one of these, the fix is a richer report type, never a
 * `console.log` in a use case.
 */

import type { Defensibility, Diagnostic, DomainError } from '../../domain/index.js';

/** Output formats the tool can produce. */
export const OUTPUT_FORMATS = ['docx', 'txt'] as const;

/** A supported output format. */
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * How a variant build ended.
 *
 * `blocked` is distinct from `failed` on purpose: blocked means everything
 * worked and policy refused to write (an undefendable claim), failed means
 * something was broken. Those are completely different experiences for the
 * user, and the CLI has to tell them apart.
 */
export type BuildStatus = 'written' | 'blocked' | 'failed';

/** Outcome of building one variant. */
export interface VariantBuildReport {
  readonly variantId: string;
  readonly status: BuildStatus;
  readonly outputPath?: string | undefined;
  readonly byteLength?: number | undefined;
  readonly diagnostics: readonly Diagnostic[];
  /** Where the archived copy landed, when `--archive` was given. */
  readonly archivePath?: string | undefined;
  /**
   * Set when an archive already existed at that name.
   *
   * Archives are append-only: the same content archived twice in one day is
   * reported and skipped, never overwritten.
   */
  readonly archiveSkipped?: boolean | undefined;
  /** Where the PDF landed, when `--pdf` was given. */
  readonly pdfPath?: string | undefined;
}

/** Outcome of a build command, one entry per variant attempted. */
export interface BuildReport {
  readonly workspaceRoot: string;
  readonly variants: readonly VariantBuildReport[];
}

/** Validation outcome for one variant, with nothing written. */
export interface VariantCheckReport {
  readonly variantId: string;
  /** True when no error-severity diagnostic was raised. */
  readonly passed: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/** Outcome of a check command. */
export interface CheckReport {
  readonly variants: readonly VariantCheckReport[];
  /**
   * Rendered page count per variant.
   *
   * Optional and unset for now: it is the typed seam for the page-count gate,
   * which a later layer fills once PDF conversion exists — without changing
   * this use case's signature.
   */
  readonly pageCounts?: Readonly<Record<string, number>> | undefined;
}

/** How many claims a variant carries at each defensibility tier. */
export interface ClaimTierCounts {
  readonly confident: number;
  readonly 'needs-review': number;
  readonly 'cannot-defend': number;
}

/** Everything needed to render one row of `vitae list` without further lookups. */
export interface VariantSummary {
  readonly variantId: string;
  readonly label: string;
  /** Project names in variant order — names, not IDs, so it prints directly. */
  readonly projectNames: readonly string[];
  readonly claimTiers: ClaimTierCounts;
  /** Populated when the variant's projects or claims could not be resolved. */
  readonly diagnostics: readonly Diagnostic[];
}

/** Outcome of a list command. */
export interface ListReport {
  readonly variants: readonly VariantSummary[];
}

/** One project's entry in the prep checklist. */
export interface PrepEntry {
  readonly claimId: string;
  readonly projectNames: readonly string[];
  readonly notes: readonly string[];
}

/** Prep entries grouped by defensibility tier. */
export interface PrepSection {
  readonly tier: Defensibility;
  readonly entries: readonly PrepEntry[];
}

/** The interview checklist for one variant. */
export interface PrepReport {
  readonly variantId: string;
  readonly label: string;
  /** ISO timestamp, so a saved checklist records when it was generated. */
  readonly generatedAt: string;
  readonly sections: readonly PrepSection[];
  readonly diagnostics: readonly Diagnostic[];
}

/** What changed in the files a variant depends on. */
export interface DiffReport {
  readonly variantId: string;
  readonly ref: string;
  /** Exactly the files this variant reads, relative to the workspace. */
  readonly paths: readonly string[];
  /** Raw unified diff; empty when nothing changed. */
  readonly patch: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** One capability's availability, for `doctor`. */
export interface CapabilityReport {
  readonly name: string;
  readonly available: boolean;
  readonly version?: string | undefined;
  /** What stops working without it, and how to install it. */
  readonly note: string;
}

/** Everything `doctor` knows about this environment. */
export interface DoctorReport {
  readonly workspaceRoot: string;
  readonly variantCount: number;
  readonly isGitRepository: boolean;
  readonly capabilities: readonly CapabilityReport[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Presents a domain or loading error as a diagnostic.
 *
 * Reports carry one diagnostic shape regardless of which layer failed, so the
 * CLI has a single rendering path. Errors are always error-severity; only the
 * claims policy produces warnings.
 *
 * @param error - any error from the domain, loading, or application layers
 */
export function toDiagnostic(error: DomainError): Diagnostic {
  return {
    severity: 'error',
    code: error.code,
    message: error.message,
  };
}
