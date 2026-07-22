/**
 * CLI test harness.
 *
 * Drives the real command tree in-process rather than spawning a subprocess:
 * the onboarding test then runs in milliseconds instead of seconds, which is
 * the difference between it being run on every save and being skipped.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCli } from '../../src/cli/main.js';
import type { ExitCode } from '../../src/cli/exitCodes.js';
import type { OutputChannel } from '../../src/cli/output.js';

/** Everything one invocation produced. */
export interface CliResult {
  readonly exitCode: ExitCode;
  /** Reports only — what a pipe would receive. */
  readonly stdout: string;
  /** Notices, warnings, and errors. */
  readonly stderr: string;
}

/** Captures output instead of writing to a terminal. */
class CapturingOutput implements OutputChannel {
  public readonly outLines: string[] = [];
  public readonly errLines: string[] = [];
  public readonly isTty = false;

  public out(text: string): void {
    this.outLines.push(text);
  }

  public err(text: string): void {
    this.errLines.push(text);
  }
}

/**
 * Runs the CLI with captured output.
 *
 * @param argv - arguments as a user would type them
 */
export async function runCliCaptured(argv: readonly string[]): Promise<CliResult> {
  const output = new CapturingOutput();
  const exitCode = await runCli(argv, output);

  return {
    exitCode,
    stdout: output.outLines.join('\n'),
    stderr: output.errLines.join('\n'),
  };
}

/** Temp directories created by this module, removed by {@link cleanupTempDirs}. */
const created: string[] = [];

/** Creates an empty directory to scaffold a workspace into. */
export function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-cli-'));
  created.push(dir);
  return dir;
}

/** Removes every temp directory created during the run. */
export function cleanupTempDirs(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Matches an ANSI escape sequence.
 *
 * Written with an explicit code point: a literal escape character in a source
 * file is invisible, and a regex that lost it silently degrades into matching
 * a bare `[`, which every JSON array also contains.
 */
// eslint-disable-next-line no-control-regex -- matching the control character is the point
export const ANSI_ESCAPE = /\u001B\[/;

/** Builds the escape sequence for one SGR colour code, e.g. 33 for yellow. */
export function ansiCode(code: number): string {
  return `\u001B[${code}m`;
}
