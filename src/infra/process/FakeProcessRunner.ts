/**
 * Scripted subprocess runner for tests.
 *
 * Every test in the archive, PDF, and diff features runs against this, so the
 * suite stays fast and never depends on whether the machine happens to have
 * LibreOffice installed. It also records calls, which is how the diff tests
 * assert that exactly the right paths were requested.
 */

import { err, ok, type Result } from '../../domain/index.js';
import { INFRA_ERROR_CODES, ProcessError } from '../errors.js';
import type { ProcessOptions, ProcessOutput, ProcessRunner } from './ProcessRunner.js';

/** One recorded invocation. */
export interface RecordedCall {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

/** A scripted response, keyed by command and argument prefix. */
interface Script {
  readonly cmd: string;
  readonly argPrefix: readonly string[];
  readonly result: Result<ProcessOutput, ProcessError>;
}

/** Replays scripted responses and records what was asked. */
export class FakeProcessRunner implements ProcessRunner {
  public readonly calls: RecordedCall[] = [];
  private readonly scripts: Script[] = [];
  private readonly available = new Set<string>();

  /**
   * Scripts a successful response.
   *
   * @param cmd - the binary
   * @param argPrefix - matches when the call's arguments start with these
   * @param stdout - what the process should print
   */
  public onRun(cmd: string, argPrefix: readonly string[], stdout: string, stderr = ''): this {
    this.scripts.push({ cmd, argPrefix, result: ok({ stdout, stderr }) });
    return this;
  }

  /** Scripts a failure. */
  public onRunFailure(
    cmd: string,
    argPrefix: readonly string[],
    detail: string,
    code: ProcessError['code'] = INFRA_ERROR_CODES.processFailed,
  ): this {
    this.scripts.push({ cmd, argPrefix, result: err(new ProcessError(cmd, code, detail)) });
    return this;
  }

  /** Declares which binaries this fake machine has. */
  public withAvailable(...commands: readonly string[]): this {
    for (const command of commands) {
      this.available.add(command);
    }
    return this;
  }

  public run(
    cmd: string,
    args: readonly string[],
    opts: ProcessOptions = {},
  ): Promise<Result<ProcessOutput, ProcessError>> {
    this.calls.push({ cmd, args: [...args], cwd: opts.cwd });

    const script = this.scripts.find(
      (candidate) =>
        candidate.cmd === cmd &&
        candidate.argPrefix.every((arg, index) => args[index] === arg),
    );

    if (script === undefined) {
      return Promise.resolve(
        err(
          new ProcessError(
            cmd,
            INFRA_ERROR_CODES.processNotFound,
            `no scripted response for: ${cmd} ${args.join(' ')}`,
          ),
        ),
      );
    }

    return Promise.resolve(script.result);
  }

  public which(cmd: string): Promise<boolean> {
    return Promise.resolve(this.available.has(cmd));
  }
}
