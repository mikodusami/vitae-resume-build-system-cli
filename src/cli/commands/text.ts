/**
 * `vitae text` — render a variant as plain text to stdout.
 *
 * Writing files is a later layer's job, so this prints. It is genuinely
 * useful as an ATS-safe copy-paste source, and it is the fastest way to see
 * exactly what the renderer does with your content.
 */

import { ResumeComposer, type ContentLibrary } from '../../domain/index.js';
import { PlainTextRenderer } from '../../render/index.js';

/**
 * Composes and prints a variant as plain text.
 *
 * @param library - the resolved content library
 * @param variantId - variant to render
 * @param lineWidth - column at which right-aligned text ends
 * @returns 0 on success, 1 on any domain error
 */
export async function runText(
  library: ContentLibrary,
  variantId: string,
  lineWidth?: number,
): Promise<number> {
  const variant = library.getVariant(variantId);
  if (!variant.ok) {
    console.error(`error: ${variant.error.message}`);
    console.error(`known variants: ${library.listVariants().map((v) => v.id).join(', ')}`);
    return 1;
  }

  const composed = new ResumeComposer().compose(variant.value, library);
  if (!composed.ok) {
    for (const error of composed.error) {
      console.error(`error [${error.code}]: ${error.message}`);
    }
    return 1;
  }

  const renderer = lineWidth === undefined ? new PlainTextRenderer() : new PlainTextRenderer(lineWidth);
  console.log(await renderer.render(composed.value));

  return 0;
}
