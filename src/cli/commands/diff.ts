/**
 * `vitae diff` — what changed in a variant's content since a git ref.
 */

import { toDiagnostic } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/** Arguments specific to `diff`. */
export interface DiffArgs {
  readonly variantId: string;
  readonly ref: string;
}

/**
 * Shows the diff for one variant's inputs.
 *
 * @param context - presenter, output, and global options
 * @param args - variant and git ref
 */
export async function runDiff(context: CommandContext, args: DiffArgs): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const result = await wired.value.app.diff({ variantId: args.variantId, ref: args.ref });
  if (!result.ok) {
    context.output.err(context.presenter.diagnostics(result.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  if (result.value.diagnostics.length > 0) {
    context.output.err(context.presenter.diagnostics(result.value.diagnostics));
    return EXIT_CODES.failure;
  }

  context.output.out(context.presenter.diff(result.value));
  return EXIT_CODES.success;
}
