/**
 * `vitae doctor` — what this environment can and cannot do.
 *
 * Exits 0 even when capabilities are missing: a machine without LibreOffice is
 * not broken, it just cannot make PDFs. Only unloadable content is a failure,
 * because that genuinely stops the tool working.
 */

import { toDiagnostic } from '../../app/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/**
 * Reports environment health.
 *
 * @param context - presenter, output, and global options
 */
export async function runDoctor(context: CommandContext): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const result = await wired.value.app.doctor();
  if (!result.ok) {
    context.output.err(context.presenter.diagnostics(result.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  context.output.out(context.presenter.doctor(result.value));

  return result.value.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? EXIT_CODES.failure
    : EXIT_CODES.success;
}
