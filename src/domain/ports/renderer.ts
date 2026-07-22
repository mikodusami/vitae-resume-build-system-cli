/**
 * Renderer port — the domain's way of handing off a composed document.
 *
 * Each output format is a separate adapter over the same IR, which is why the
 * domain never learns what a docx or a PDF is.
 */

import type { ResumeDocument } from '../document/resumeDocument.js';

/**
 * Turns a composed document into an output artifact.
 *
 * @typeParam TOutput - what the adapter produces, e.g. a byte buffer
 */
export interface Renderer<TOutput> {
  render(doc: ResumeDocument): Promise<TOutput>;
}
