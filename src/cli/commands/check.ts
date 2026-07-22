/**
 * `vitae check` — validate without writing anything.
 *
 * Exits 2 when the only problem is an undefendable claim, so a CI step can
 * treat "your resume has a claim you cannot back up" differently from "your
 * content does not load".
 */

import { toDiagnostic } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, exitCodeForCheck, type ExitCode } from '../exitCodes.js';

/** Arguments specific to `check`. */
export interface CheckArgs {
  readonly variantId: string | undefined;
  /** Render each variant and enforce the page limit. */
  readonly pages?: boolean | undefined;
}

/**
 * Validates one variant or the whole workspace.
 *
 * @param context - presenter, output, and global options
 * @param args - optional single-variant filter
 */
export async function runCheck(context: CommandContext, args: CheckArgs): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const result = await wired.value.app.check({
    variantId: args.variantId,
    pages: args.pages,
  });
  if (!result.ok) {
    context.output.err(context.presenter.diagnostics(result.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  context.output.out(context.presenter.check(result.value));
  return exitCodeForCheck(result.value);
}
