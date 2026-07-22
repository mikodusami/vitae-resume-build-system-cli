/**
 * Colour, applied through one helper.
 *
 * Every escape sequence in the tool comes from here, so `--no-color`, a
 * non-TTY stdout, and the `NO_COLOR` convention are each honoured in exactly
 * one place rather than in every message that wanted to be green.
 */

/**
 * ANSI codes, kept minimal — this is a resume tool, not a dashboard.
 *
 * Written with the `\u001B` escape rather than a literal escape byte: an
 * invisible control character in source cannot be reviewed and is trivially
 * lost in a copy-paste.
 */
const CODES = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  cyan: '\u001B[36m',
} as const;

/** A supported style name. */
export type Style = keyof Omit<typeof CODES, 'reset'>;

/** Applies (or silently skips) ANSI styling. */
export class Colorizer {
  /**
   * @param enabled - false makes every method the identity function
   */
  public constructor(private readonly enabled: boolean) {}

  /**
   * Decides whether colour is appropriate.
   *
   * Piping into `jq`, `head`, or a file must never receive escape codes, so a
   * non-TTY stdout disables colour just as `--no-color` does. `NO_COLOR` is
   * honoured because it is the cross-tool convention users already expect.
   *
   * @param options - `--no-color` and `--json` flags
   * @param isTty - whether stdout is a terminal
   * @param env - environment to read `NO_COLOR` from
   */
  public static forOutput(
    options: { readonly noColor: boolean; readonly json: boolean },
    isTty: boolean,
    env: Readonly<Record<string, string | undefined>> = process.env,
  ): Colorizer {
    const disabled =
      options.noColor || options.json || !isTty || env.NO_COLOR !== undefined;
    return new Colorizer(!disabled);
  }

  /** Wraps text in a style, or returns it untouched when colour is off. */
  public style(text: string, style: Style): string {
    return this.enabled ? `${CODES[style]}${text}${CODES.reset}` : text;
  }

  public error(text: string): string {
    return this.style(text, 'red');
  }

  public warning(text: string): string {
    return this.style(text, 'yellow');
  }

  public success(text: string): string {
    return this.style(text, 'green');
  }

  public heading(text: string): string {
    return this.style(text, 'bold');
  }

  public muted(text: string): string {
    return this.style(text, 'dim');
  }

  public path(text: string): string {
    return this.style(text, 'cyan');
  }
}
