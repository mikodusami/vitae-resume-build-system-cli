/**
 * CommandContext — what every handler is handed.
 *
 * Building this once, at the entry point, is what keeps handlers to four
 * steps: translate argv into a use-case input, call the use case, hand the
 * report to the presenter, return an exit code.
 */

import { Colorizer } from './presenters/color.js';
import { HumanPresenter } from './presenters/HumanPresenter.js';
import { JsonPresenter } from './presenters/JsonPresenter.js';
import type { ReportPresenter } from './presenters/ReportPresenter.js';
import type { GlobalOptions } from './options.js';
import { CONSOLE_OUTPUT, type OutputChannel } from './output.js';

/** Everything a command handler needs that is not its own arguments. */
export interface CommandContext {
  readonly options: GlobalOptions;
  readonly output: OutputChannel;
  readonly presenter: ReportPresenter;
  readonly color: Colorizer;
}

/**
 * Builds the context for one invocation.
 *
 * @param options - parsed global options
 * @param output - where to write; defaults to the real terminal
 */
export function makeContext(
  options: GlobalOptions,
  output: OutputChannel = CONSOLE_OUTPUT,
): CommandContext {
  const color = Colorizer.forOutput(options, output.isTty);

  return {
    options,
    output,
    color,
    presenter: options.json ? new JsonPresenter() : new HumanPresenter(color),
  };
}

/**
 * Announces which workspace a command is operating on.
 *
 * Always stderr: under `--json`, stdout must carry the report and nothing
 * else, and this notice is exactly the kind of thing that would break a pipe.
 */
export function announceWorkspace(
  context: CommandContext,
  workspaceRoot: string,
  warnings: readonly string[],
): void {
  for (const warning of warnings) {
    context.output.err(context.color.warning(`warning: ${warning}`));
  }

  if (!context.options.json) {
    context.output.err(context.color.muted(`workspace: ${workspaceRoot}\n`));
  }
}
