/**
 * `vitae prep` — interview checklist for one variant's claims.
 *
 * Closes the loop the claims registry opens: flag a project `needs-review`,
 * generate this checklist for the resume you are about to send, work through
 * it, then flip the tier to `confident` as a commit.
 */

import { toDiagnostic } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/** Arguments specific to `prep`. */
export interface PrepArgs {
  readonly variantId: string | undefined;
  /** Write the markdown here instead of to stdout. */
  readonly outFile: string | undefined;
}

/**
 * Generates the checklist.
 *
 * @param context - presenter, output, and global options
 * @param args - variant and optional output file
 */
export async function runPrep(context: CommandContext, args: PrepArgs): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const variantId = args.variantId ?? wired.value.defaultVariantId;
  if (variantId === undefined) {
    context.output.err('error: no variant given and no defaultVariant in config.json.');
    return EXIT_CODES.failure;
  }

  const result = await wired.value.app.prep({ variantId });
  if (!result.ok) {
    context.output.err(context.presenter.diagnostics(result.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  if (result.value.diagnostics.length > 0) {
    context.output.err(context.presenter.diagnostics(result.value.diagnostics));
    return EXIT_CODES.failure;
  }

  const rendered = context.presenter.prep(result.value);

  if (args.outFile === undefined) {
    context.output.out(rendered);
    return EXIT_CODES.success;
  }

  const written = await wired.value.app.writeText(args.outFile, rendered);
  if (!written.ok) {
    context.output.err(context.presenter.diagnostics([toDiagnostic(written.error)]));
    return EXIT_CODES.failure;
  }

  context.output.err(context.color.success(`Wrote ${args.outFile}`));
  return EXIT_CODES.success;
}
