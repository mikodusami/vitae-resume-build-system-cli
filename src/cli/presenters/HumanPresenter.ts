/**
 * HumanPresenter — reports as readable terminal output.
 *
 * Warnings are visually distinct from errors because the difference is the
 * whole point of the claims registry: one means "you can ship this but be
 * ready to talk about it", the other means "do not send this".
 */

import type {
  BuildReport,
  CheckReport,
  ListReport,
  VariantBuildReport,
  VariantSummary,
} from '../../app/index.js';
import type { Diagnostic } from '../../domain/index.js';
import type { Colorizer } from './color.js';
import type { ReportPresenter } from './ReportPresenter.js';

/** Status markers, chosen to survive a monochrome terminal. */
const STATUS_MARKERS = {
  written: '✓',
  blocked: '✗',
  failed: '!',
} as const;

/** Tier markers for the list view. */
const TIER_MARKERS = {
  confident: '✓',
  'needs-review': '~',
  'cannot-defend': '✗',
} as const;

/** Renders reports as aligned, coloured text. */
export class HumanPresenter implements ReportPresenter {
  public constructor(private readonly color: Colorizer) {}

  public build(report: BuildReport): string {
    if (report.variants.length === 0) {
      return 'No variants to build.';
    }

    const width = longest(report.variants.map((variant) => variant.variantId));
    const lines = report.variants.flatMap((variant) => this.buildLines(variant, width));

    const blocked = report.variants.filter((variant) => variant.status === 'blocked');
    if (blocked.length > 0) {
      lines.push(
        '',
        this.color.warning(
          `${blocked.length} variant(s) blocked by undefendable claims. ` +
            'Fix the claim, or rebuild with --force if you have decided otherwise.',
        ),
      );
    }

    return lines.join('\n');
  }

  public check(report: CheckReport): string {
    if (report.variants.length === 0) {
      return 'No variants to check.';
    }

    const width = longest(report.variants.map((variant) => variant.variantId));
    const lines: string[] = [];

    for (const variant of report.variants) {
      const marker = variant.passed
        ? this.color.success(STATUS_MARKERS.written)
        : this.color.error(STATUS_MARKERS.blocked);
      const verdict = variant.passed ? 'ok' : 'problems';
      lines.push(`${marker} ${variant.variantId.padEnd(width)}  ${verdict}`);
      lines.push(...variant.diagnostics.map((diagnostic) => this.diagnosticLine(diagnostic)));
    }

    if (report.pageCounts !== undefined) {
      lines.push('', this.color.heading('Page counts'));
      for (const [variantId, count] of Object.entries(report.pageCounts)) {
        lines.push(`  ${variantId.padEnd(width)}  ${count}`);
      }
    }

    return lines.join('\n');
  }

  public list(report: ListReport): string {
    if (report.variants.length === 0) {
      return 'No variants defined. Add one to variants/ — the filename is its id.';
    }

    return report.variants.map((variant) => this.listEntry(variant)).join('\n\n');
  }

  public diagnostics(diagnostics: readonly Diagnostic[]): string {
    if (diagnostics.length === 0) {
      return '';
    }

    const lines = diagnostics.map((diagnostic) => this.diagnosticLine(diagnostic, ''));
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    if (errors > 1) {
      // Only worth summarizing when there were several; repeating "1 problem
      // found" under a single message is noise. The command says what it did.
      lines.push('', this.color.error(`${errors} problems found.`));
    }

    return lines.join('\n');
  }

  /** One variant's build outcome, plus its diagnostics. */
  private buildLines(variant: VariantBuildReport, width: number): string[] {
    const id = variant.variantId.padEnd(width);

    const headline =
      variant.status === 'written'
        ? `${this.color.success(STATUS_MARKERS.written)} ${id}  ${this.color.path(
            variant.outputPath ?? '',
          )} ${this.color.muted(`(${variant.byteLength ?? 0} bytes)`)}`
        : `${this.color.error(STATUS_MARKERS[variant.status])} ${id}  ${variant.status}`;

    return [headline, ...variant.diagnostics.map((diagnostic) => this.diagnosticLine(diagnostic))];
  }

  /** One variant's summary: projects with their tier shown inline. */
  private listEntry(variant: VariantSummary): string {
    const lines = [
      `${this.color.heading(variant.variantId)}  ${this.color.muted(variant.label)}`,
    ];

    for (const name of variant.projectNames) {
      lines.push(`  ${name}`);
    }

    const tiers = Object.entries(variant.claimTiers)
      .filter(([, count]) => count > 0)
      .map(([tier, count]) => {
        const marker = TIER_MARKERS[tier as keyof typeof TIER_MARKERS];
        const text = `${marker} ${count} ${tier}`;
        if (tier === 'cannot-defend') return this.color.error(text);
        if (tier === 'needs-review') return this.color.warning(text);
        return this.color.success(text);
      });

    lines.push(`  ${tiers.join('   ')}`);
    lines.push(...variant.diagnostics.map((diagnostic) => this.diagnosticLine(diagnostic)));

    return lines.join('\n');
  }

  /** A single diagnostic, coloured by severity. */
  private diagnosticLine(diagnostic: Diagnostic, indent = '    '): string {
    const label = `${diagnostic.severity} [${diagnostic.code}]`;
    const colored =
      diagnostic.severity === 'error' ? this.color.error(label) : this.color.warning(label);

    return `${indent}${colored}: ${diagnostic.message}`;
  }
}

/** Longest string length, for column alignment. */
function longest(values: readonly string[]): number {
  return values.reduce((max, value) => Math.max(max, value.length), 0);
}
