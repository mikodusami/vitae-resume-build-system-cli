/**
 * Output streams, behind a tiny seam.
 *
 * The split matters: presented reports go to stdout, everything else — the
 * workspace notice, warnings, progress — goes to stderr. That is what keeps
 * `vitae build --json | jq` working no matter what else the run wants to say.
 *
 * Tests capture output by passing their own implementation rather than by
 * monkey-patching `console`.
 */

/** Where the CLI writes. */
export interface OutputChannel {
  /** Machine-consumable result: reports, and nothing else. */
  out(text: string): void;
  /** Everything a pipe should not receive. */
  err(text: string): void;
  /** Whether stdout is a terminal, used to decide on colour. */
  readonly isTty: boolean;
}

/** The real terminal. */
export const CONSOLE_OUTPUT: OutputChannel = {
  out: (text: string) => {
    // eslint-disable-next-line no-console
    console.log(text);
  },
  err: (text: string) => {
    // eslint-disable-next-line no-console
    console.error(text);
  },
  isTty: process.stdout.isTTY === true,
};
