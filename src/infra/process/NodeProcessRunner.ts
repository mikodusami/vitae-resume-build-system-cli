/**
 * The real subprocess runner.
 *
 * Arguments are passed as an array and never through a shell: a project name
 * or a git ref is user-supplied text, and interpolating it into a shell string
 * is how a stray backtick becomes command execution.
 */

import { spawn } from 'node:child_process';

import { err, ok, type Result } from '../../domain/index.js';
import { INFRA_ERROR_CODES, ProcessError } from '../errors.js';
import type { ProcessOptions, ProcessOutput, ProcessRunner } from './ProcessRunner.js';

/** Applied when a caller specifies no timeout. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Spawns real processes. */
export class NodeProcessRunner implements ProcessRunner {
  public run(
    cmd: string,
    args: readonly string[],
    opts: ProcessOptions = {},
  ): Promise<Result<ProcessOutput, ProcessError>> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve) => {
      const child = spawn(cmd, [...args], {
        ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      /** Resolves once; later events from a killed process are ignored. */
      const settle = (result: Result<ProcessOutput, ProcessError>): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        settle(
          err(
            new ProcessError(
              cmd,
              INFRA_ERROR_CODES.processTimeout,
              `timed out after ${timeoutMs}ms`,
            ),
          ),
        );
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        const code =
          error.code === 'ENOENT'
            ? INFRA_ERROR_CODES.processNotFound
            : INFRA_ERROR_CODES.processFailed;
        settle(err(new ProcessError(cmd, code, error.message)));
      });

      child.on('close', (exitCode) => {
        if (exitCode === 0) {
          settle(ok({ stdout, stderr }));
          return;
        }
        settle(
          err(
            new ProcessError(
              cmd,
              INFRA_ERROR_CODES.processFailed,
              // stderr is usually the useful part; fall back to the code alone.
              stderr.trim().length > 0 ? stderr.trim() : `exited with code ${String(exitCode)}`,
            ),
          ),
        );
      });
    });
  }

  public async which(cmd: string): Promise<boolean> {
    // `command -v` is POSIX; `where` is the Windows equivalent.
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const result = await this.run(probe, [cmd], { timeoutMs: 5_000 });
    return result.ok;
  }
}
