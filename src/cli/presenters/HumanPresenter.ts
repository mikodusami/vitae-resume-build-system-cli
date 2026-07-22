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
  DiffReport,
  DoctorReport,
  ListReport,
  PrepReport,
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

/** Section headings for the prep checklist, ordered most urgent first. */
const TIER_HEADINGS = {
  'cannot-defend': 'Cannot defend — do not send this until resolved',
  'needs-review': 'Needs review before sending',
  confident: 'Confident — listed for completeness',
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

  /**
   * Renders the prep checklist as markdown.
   *
   * Markdown rather than terminal decoration because this output is meant to
   * be saved and worked through — `--out prep.md`, then tick the boxes. It is
   * identical whether it lands in a file or a terminal, so what you read is
   * what you keep.
   */
  public prep(report: PrepReport): string {
    if (report.diagnostics.length > 0) {
      return this.diagnostics(report.diagnostics);
    }

    const lines = [
      `# Interview prep — ${report.label}`,
      '',
      `Generated ${report.generatedAt.slice(0, 10)} for variant \`${report.variantId}\`.`,
      '',
    ];

    for (const section of report.sections) {
      lines.push(`## ${TIER_HEADINGS[section.tier]}`, '');

      for (const entry of section.entries) {
        lines.push(`### ${entry.projectNames.join(', ')}`, '');

        if (entry.notes.length === 0) {
          lines.push('_No review notes._', '');
          continue;
        }

        lines.push(...entry.notes.map((note) => `- [ ] ${note}`), '');
      }
    }

    if (report.sections.length === 0) {
      lines.push('_This variant has no claims._');
    }

    return lines.join('\n').trimEnd();
  }

  public diff(report: DiffReport): string {
    if (report.diagnostics.length > 0) {
      return this.diagnostics(report.diagnostics);
    }

    if (report.patch.trim().length === 0) {
      return (
        `No changes to ${report.variantId}'s content since ${report.ref}.\n` +
        this.color.muted(`  compared: ${report.paths.join(', ')}`)
      );
    }

    // The patch is git's own output; reprinting it verbatim means it stays
    // pipeable into `git apply` or a pager.
    return report.patch;
  }

  public doctor(report: DoctorReport): string {
    const lines = [
      this.color.heading('workspace'),
      `  ${this.color.path(report.workspaceRoot)}`,
      `  ${report.variantCount} variant(s)`,
      `  git repository: ${report.isGitRepository ? 'yes' : 'no'}`,
      '',
      this.color.heading('capabilities'),
    ];

    for (const capability of report.capabilities) {
      const marker = capability.available
        ? this.color.success('✓')
        : this.color.warning('○');
      const version = capability.version === undefined ? '' : ` ${this.color.muted(capability.version)}`;
      lines.push(`  ${marker} ${capability.name}${version}`);
      lines.push(`      ${this.color.muted(capability.note)}`);
    }

    if (report.diagnostics.length > 0) {
      lines.push('', this.color.heading('content'), this.diagnostics(report.diagnostics));
    } else {
      lines.push('', this.color.success('Content loads cleanly.'));
    }

    return lines.join('\n');
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

    const extras: string[] = [];
    if (variant.archivePath !== undefined) {
      const verb = variant.archiveSkipped === true ? 'already archived' : 'archived';
      extras.push(`    ${verb}: ${this.color.path(variant.archivePath)}`);
    }
    if (variant.pdfPath !== undefined) {
      extras.push(`    pdf: ${this.color.path(variant.pdfPath)}`);
    }

    return [
      headline,
      ...extras,
      ...variant.diagnostics.map((diagnostic) => this.diagnosticLine(diagnostic)),
    ];
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
