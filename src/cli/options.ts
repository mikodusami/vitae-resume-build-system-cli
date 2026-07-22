/**
 * Global options, available to every command.
 *
 * Parsed once by the argv parser and threaded through; no command reads
 * `process.argv` itself.
 */

/** Options that apply regardless of which command runs. */
export interface GlobalOptions {
  /** Workspace override, from `--dir`; `VITAE_DIR` applies when absent. */
  readonly dir?: string | undefined;
  /** Emit machine-readable JSON on stdout instead of human text. */
  readonly json: boolean;
  /** Suppress ANSI colour even on a TTY. */
  readonly noColor: boolean;
  /** Print stack traces for unexpected failures. */
  readonly verbose: boolean;
}

/** Defaults used when a caller supplies nothing. */
export const DEFAULT_GLOBAL_OPTIONS: GlobalOptions = {
  json: false,
  noColor: false,
  verbose: false,
};
