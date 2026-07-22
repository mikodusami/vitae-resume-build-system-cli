/**
 * Bullet block renderer.
 *
 * The glyph comes from the document's numbering configuration, never from a
 * literal `•` in the text. A hard-coded bullet character looks identical on
 * screen but is not a list to Word, to an ATS parser, or to a screen reader —
 * a silent-corruption bug rather than a crash, which is why it is called out
 * here and asserted against in the tests.
 */

import { Paragraph, TextRun as DocxTextRun } from 'docx';

import type { Block } from '../../../domain/index.js';
import type { StyleResolver } from '../StyleResolver.js';

/** Numbering configuration key defined by the docx renderer. */
export const BULLET_NUMBERING_REFERENCE = 'bullets';

/** The bullet variant of the IR block union. */
type BulletBlock = Extract<Block, { kind: 'bullet' }>;

/**
 * Renders a bullet block as a real numbered-list paragraph.
 *
 * @param block - the bullet's runs
 * @param resolver - supplies fonts, sizes, indentation, and spacing
 */
export function renderBullet(block: BulletBlock, resolver: StyleResolver): Paragraph {
  return new Paragraph({
    children: block.runs.map((run) => new DocxTextRun(resolver.runOptions(run))),
    numbering: { reference: BULLET_NUMBERING_REFERENCE, level: 0 },
    indent: resolver.bulletIndent,
    spacing: resolver.paragraphSpacing('bullet'),
  });
}
