/**
 * BuildAllUseCase — every variant, continuing past failures.
 *
 * One broken variant must not hide the status of the other three: a run that
 * stopped at the first error would make you fix and rerun four times to learn
 * what a single run could have told you.
 */

import type { ContentLibrary } from '../../domain/index.js';
import type { ProgressListener } from '../ports/ProgressListener.js';
import { NULL_PROGRESS_LISTENER } from '../ports/ProgressListener.js';
import type { BuildVariantUseCase } from './BuildVariantUseCase.js';
import type { BuildReport, OutputFormat, VariantBuildReport } from '../reports/reports.js';

/** What to build across the workspace. */
export interface BuildAllInput {
  readonly format: OutputFormat;
  readonly force?: boolean | undefined;
  readonly outputDir?: string | undefined;
}

/** Builds every variant in the library. */
export class BuildAllUseCase {
  public constructor(
    private readonly buildVariant: BuildVariantUseCase,
    private readonly progress: ProgressListener = NULL_PROGRESS_LISTENER,
  ) {}

  /**
   * Builds each variant in declaration order.
   *
   * @param library - already-loaded content, shared across every build
   * @param workspaceRoot - recorded in the report for provenance
   * @param defaultOutputDir - the workspace's `dist/`
   * @param input - format and policy overrides
   */
  public async execute(
    library: ContentLibrary,
    workspaceRoot: string,
    defaultOutputDir: string,
    input: BuildAllInput,
  ): Promise<BuildReport> {
    const variants: VariantBuildReport[] = [];

    for (const variant of library.listVariants()) {
      this.progress.onVariantStart(variant.id);

      const report = await this.buildVariant.execute(library, defaultOutputDir, {
        variantId: variant.id,
        format: input.format,
        force: input.force,
        outputDir: input.outputDir,
      });

      this.progress.onVariantDone(report);
      variants.push(report);
    }

    return { workspaceRoot, variants };
  }
}
