/**
 * `vitae list` — what is on which resume, and can you defend it.
 */

import { toDiagnostic } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/**
 * Summarizes every variant.
 *
 * Listing reports rather than gates, so it exits 0 even when claims are
 * unhealthy — `vitae check` is the gate.
 *
 * @param context - presenter, output, and global options
 */
export async function runList(context: CommandContext): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const result = await wired.value.app.list();
  if (!result.ok) {
    context.output.err(context.presenter.diagnostics(result.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  context.output.out(context.presenter.list(result.value));
  return EXIT_CODES.success;
}
