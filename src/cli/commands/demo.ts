/**
 * `vitae demo` — compose a variant and print the document IR outline.
 *
 * The domain's product is an in-memory document; until a renderer exists this
 * is what "seeing the output" means, and it stays useful afterwards as a way
 * to inspect structure without opening a .docx.
 */

import { ResumeComposer, type ContentLibrary } from '../../domain/index.js';

/**
 * Composes the named variant and prints its metadata and section outline.
 *
 * @param library - the resolved content library
 * @param variantId - variant to compose
 * @returns process exit code: 0 on success, 1 on any domain error
 */
export function runDemo(library: ContentLibrary, variantId: string): number {
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

  const { meta, sections } = composed.value;

  console.log(`title       ${meta.title}`);
  console.log(`creator     ${meta.creator}`);
  console.log(`description ${meta.description}`);
  console.log(`keywords    ${meta.keywords.join(', ')}`);
  console.log('');

  for (const section of sections) {
    console.log(section.heading ?? '(header)');
    for (const block of section.blocks) {
      console.log(`  ${block.kind.padEnd(10)} ${describeBlock(block)}`);
    }
  }

  return 0;
}

/** Renders a block's text content on one line, for eyeballing structure. */
function describeBlock(block: {
  kind: string;
  runs?: readonly { text: string }[];
  left?: readonly { text: string }[];
  right?: readonly { text: string }[];
}): string {
  if (block.runs !== undefined) {
    return block.runs.map((r) => r.text).join('');
  }

  const left = (block.left ?? []).map((r) => r.text).join('');
  const right = (block.right ?? []).map((r) => r.text).join('');
  return `${left}  ···  ${right}`;
}
