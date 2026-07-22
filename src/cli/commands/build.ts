/**
 * `vitae build` — render variants and write them to `dist/`.
 *
 * This command turns reports into output and exit codes; the application layer
 * did the deciding and printed nothing. The three build statuses map to
 * genuinely different messages, because "policy refused to write this" and
 * "something is broken" are different problems for the person reading them.
 */

import type { OutputFormat, VariantBuildReport } from '../../app/index.js';
import type { WiredApplication } from '../compositionRoot.js';

/** What to build. */
export interface BuildOptions {
  readonly variantId: string | undefined;
  readonly all: boolean;
  readonly format: OutputFormat;
  readonly force: boolean;
  readonly outputDir: string | undefined;
}

/** Marker shown beside each status. */
const STATUS_MARKERS: Readonly<Record<VariantBuildReport['status'], string>> = {
  written: '✓',
  blocked: '✗',
  failed: '!',
};

/**
 * Builds one variant or all of them, printing a per-variant summary.
 *
 * @param wired - the composition root's application and provenance
 * @param options - what to build
 * @returns 0 when every variant was written, 1 otherwise
 */
export async function runBuild(wired: WiredApplication, options: BuildOptions): Promise<number> {
  const reports = options.all
    ? await buildAll(wired, options)
    : await buildOne(wired, options);

  if (reports === undefined) {
    return 1;
  }

  for (const report of reports) {
    printReport(report);
  }

  const blocked = reports.filter((report) => report.status === 'blocked');
  if (blocked.length > 0) {
    console.error(
      `\n${blocked.length} variant(s) blocked by undefendable claims. ` +
        'Fix the claim, or rebuild with --force if you have decided otherwise.',
    );
  }

  return reports.every((report) => report.status === 'written') ? 0 : 1;
}

/** Runs a full build, or prints load diagnostics and returns undefined. */
async function buildAll(
  wired: WiredApplication,
  options: BuildOptions,
): Promise<readonly VariantBuildReport[] | undefined> {
  const result = await wired.app.buildAll({
    format: options.format,
    force: options.force,
    outputDir: options.outputDir,
  });

  if (!result.ok) {
    printDiagnostics(result.error);
    return undefined;
  }

  return result.value.variants;
}

/** Runs a single-variant build, or prints load diagnostics. */
async function buildOne(
  wired: WiredApplication,
  options: BuildOptions,
): Promise<readonly VariantBuildReport[] | undefined> {
  const variantId = options.variantId ?? wired.defaultVariantId;
  if (variantId === undefined) {
    console.error('error: no variant given and no defaultVariant in config.json.');
    console.error('usage: vitae build <variant> | vitae build --all');
    return undefined;
  }

  const result = await wired.app.build({
    variantId,
    format: options.format,
    force: options.force,
    outputDir: options.outputDir,
  });

  if (!result.ok) {
    printDiagnostics(result.error);
    return undefined;
  }

  return [result.value];
}

/** Prints one variant's outcome and any diagnostics it carried. */
function printReport(report: VariantBuildReport): void {
  const marker = STATUS_MARKERS[report.status];

  if (report.status === 'written') {
    console.log(`${marker} ${report.variantId}  ${report.outputPath} (${report.byteLength} bytes)`);
  } else {
    console.log(`${marker} ${report.variantId}  ${report.status}`);
  }

  for (const diagnostic of report.diagnostics) {
    const stream = diagnostic.severity === 'error' ? console.error : console.log;
    stream(`    ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`);
  }
}

/** Prints load-time failures, which prevent any build from being attempted. */
function printDiagnostics(diagnostics: readonly { code: string; message: string }[]): void {
  for (const diagnostic of diagnostics) {
    console.error(`error [${diagnostic.code}]: ${diagnostic.message}`);
  }
  console.error(`\n${diagnostics.length} problem(s) found; nothing was built.`);
}
