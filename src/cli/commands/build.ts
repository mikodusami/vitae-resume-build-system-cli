/**
 * `vitae build` — render variants and write them to `dist/`.
 *
 * A handler translates arguments, calls a use case, presents the report, and
 * returns an exit code. If this file ever starts branching on claim tiers or
 * formats, that logic belongs in the application layer.
 */

import { toDiagnostic, type BuildReport, type OutputFormat } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, exitCodeForBuild, type ExitCode } from '../exitCodes.js';

/** Arguments specific to `build`. */
export interface BuildArgs {
  readonly variantId: string | undefined;
  readonly all: boolean;
  readonly format: OutputFormat;
  readonly force: boolean;
  readonly outputDir: string | undefined;
}

/**
 * Runs a build.
 *
 * @param context - presenter, output, and global options
 * @param args - what to build
 */
export async function runBuild(context: CommandContext, args: BuildArgs): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const variantId = args.variantId ?? wired.value.defaultVariantId;
  if (!args.all && variantId === undefined) {
    context.output.err('error: no variant given and no defaultVariant in config.json.');
    context.output.err('usage: vitae build <variant> | vitae build --all');
    return EXIT_CODES.failure;
  }

  const input = { format: args.format, force: args.force, outputDir: args.outputDir };
  const result = args.all
    ? await wired.value.app.buildAll(input)
    : await wired.value.app.build({ ...input, variantId: variantId as string });

  if (!result.ok) {
    context.output.err(context.presenter.diagnostics(result.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  const report: BuildReport =
    'variants' in result.value
      ? result.value
      : { workspaceRoot: wired.value.workspaceRoot, variants: [result.value] };

  context.output.out(context.presenter.build(report));
  return exitCodeForBuild(report);
}
