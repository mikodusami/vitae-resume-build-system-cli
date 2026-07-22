/**
 * `vitae text` — render a variant as plain text to stdout.
 *
 * Useful as an ATS-safe copy-paste source, and the fastest way to see what the
 * renderer does with your content without opening Word. Writing a `.txt` file
 * is `vitae build --format txt`; this one prints.
 */

import { ResumeComposer } from '../../domain/index.js';
import { toDiagnostic } from '../../app/index.js';
import { PlainTextRenderer } from '../../render/index.js';
import { bootstrap } from '../bootstrap.js';
import { announceWorkspace, type CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/** Arguments specific to `text`. */
export interface TextArgs {
  readonly variantId: string | undefined;
  readonly lineWidth: number | undefined;
}

/**
 * Composes and prints a variant as plain text.
 *
 * @param context - presenter, output, and global options
 * @param args - variant and line width
 */
export async function runText(context: CommandContext, args: TextArgs): Promise<ExitCode> {
  const wired = await bootstrap(context.options);
  if (!wired.ok) {
    context.output.err(context.presenter.diagnostics(wired.error));
    return EXIT_CODES.failure;
  }

  announceWorkspace(context, wired.value.workspaceRoot, wired.value.warnings);

  const library = await wired.value.app.library();
  if (!library.ok) {
    context.output.err(context.presenter.diagnostics(library.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  const variantId =
    args.variantId ?? wired.value.defaultVariantId ?? library.value.listVariants()[0]?.id ?? '';

  const variant = library.value.getVariant(variantId);
  if (!variant.ok) {
    context.output.err(context.presenter.diagnostics([toDiagnostic(variant.error)]));
    return EXIT_CODES.failure;
  }

  const composed = new ResumeComposer().compose(variant.value, library.value);
  if (!composed.ok) {
    context.output.err(context.presenter.diagnostics(composed.error.map(toDiagnostic)));
    return EXIT_CODES.failure;
  }

  const renderer =
    args.lineWidth === undefined ? new PlainTextRenderer() : new PlainTextRenderer(args.lineWidth);
  context.output.out(await renderer.render(composed.value));

  return EXIT_CODES.success;
}
