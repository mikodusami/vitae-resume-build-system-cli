/**
 * ProcessRunner — one abstraction for every subprocess the tool spawns.
 *
 * Both git and LibreOffice need spawning, timeouts, output capture, and error
 * normalization. Writing that once means one place to get it right and one
 * place to fake, so no test in this project ever actually launches
 * LibreOffice.
 */

import type { Result } from '../../domain/index.js';
import type { ProcessError } from '../errors.js';

/** What a completed process produced. */
export interface ProcessOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/** Optional controls for one run. */
export interface ProcessOptions {
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

/** Runs external programs. */
export interface ProcessRunner {
  /**
   * Runs a command to completion.
   *
   * Never throws for an expected failure: a non-zero exit, a timeout, and a
   * missing binary each come back as a `ProcessError` with its own code.
   *
   * @param cmd - binary name or path
   * @param args - arguments, passed without shell interpretation
   */
  run(
    cmd: string,
    args: readonly string[],
    opts?: ProcessOptions,
  ): Promise<Result<ProcessOutput, ProcessError>>;

  /** Whether a binary can be found on this machine. */
  which(cmd: string): Promise<boolean>;
}
