/**
 * Paragraph block renderer — plain runs, optionally centered.
 *
 * Renders the name and contact lines, the summary, skills rows, and the
 * awards line.
 */

import { AlignmentType, Paragraph } from 'docx';

import type { Block } from '../../../domain/index.js';
import type { StyleResolver } from '../StyleResolver.js';
import { toParagraphChild } from './textRuns.js';

/** The paragraph variant of the IR block union. */
type ParagraphBlock = Extract<Block, { kind: 'paragraph' }>;

/**
 * Renders a paragraph block.
 *
 * @param block - runs plus optional alignment
 * @param resolver - supplies fonts, sizes, and spacing
 */
export function renderParagraph(block: ParagraphBlock, resolver: StyleResolver): Paragraph {
  return new Paragraph({
    children: block.runs.map((run) => toParagraphChild(run, resolver)),
    spacing: resolver.paragraphSpacing('paragraph'),
    ...(block.align === 'center' ? { alignment: AlignmentType.CENTER } : {}),
  });
}
