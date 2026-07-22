/**
 * The error boundary — one place unexpected failures are caught.
 *
 * Users should never see a jiti or zod stack trace. That promise was made back
 * when the loading layer was built, and this is where it is kept for anything
 * that slips past the `Result` types.
 */

import type { OutputChannel } from './output.js';
import { EXIT_CODES, type ExitCode } from './exitCodes.js';

/** Code shown for a failure that had no diagnostic of its own. */
export const UNEXPECTED_ERROR_CODE = 'UNEXPECTED';

/** True when the error is a broken pipe. */
function isEpipe(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EPIPE'
  );
}

/**
 * Runs a command, converting anything unexpected into a short message.
 *
 * @param run - the dispatch to guard
 * @param output - where to report failures
 * @param verbose - print the stack as well as the message
 * @returns the command's exit code, or 1 if it threw
 */
export async function withErrorBoundary(
  run: () => Promise<ExitCode>,
  output: OutputChannel,
  verbose: boolean,
): Promise<ExitCode> {
  try {
    return await run();
  } catch (thrown) {
    // Piping into `head` closes stdout early. That is the pipe working as
    // intended, not an error worth printing.
    if (isEpipe(thrown)) {
      return EXIT_CODES.success;
    }

    const message = thrown instanceof Error ? thrown.message : String(thrown);
    output.err(`error [${UNEXPECTED_ERROR_CODE}]: ${message.split('\n')[0] ?? message}`);

    if (verbose && thrown instanceof Error && thrown.stack !== undefined) {
      output.err(thrown.stack);
    } else {
      output.err('Re-run with --verbose for the full stack trace.');
    }

    return EXIT_CODES.failure;
  }
}
