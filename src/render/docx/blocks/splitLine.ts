/**
 * Split line renderer — left text, right-aligned date or link.
 *
 * This one handler renders every job header, education line, and project
 * header. The domain only says "these two things sit on one line, pushed
 * apart"; deciding that means a right tab stop at a themed position is exactly
 * the translation this layer exists to perform.
 */

import { Paragraph, Tab, TabStopType, TextRun as DocxTextRun } from 'docx';

import type { Block, TextRun } from '../../../domain/index.js';
import type { StyleResolver } from '../StyleResolver.js';

/** The split-line variant of the IR block union. */
type SplitLineBlock = Extract<Block, { kind: 'splitLine' }>;

/** Builds docx runs for one side of the line. */
function toDocxRuns(runs: readonly TextRun[], resolver: StyleResolver): DocxTextRun[] {
  return runs.map((run) => new DocxTextRun(resolver.runOptions(run)));
}

/**
 * Renders a split line.
 *
 * @param block - the left and right run groups
 * @param resolver - supplies fonts, sizes, spacing, and the tab position
 */
export function renderSplitLine(block: SplitLineBlock, resolver: StyleResolver): Paragraph {
  return new Paragraph({
    children: [
      ...toDocxRuns(block.left, resolver),
      new DocxTextRun({ children: [new Tab()] }),
      ...toDocxRuns(block.right, resolver),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: resolver.rightTabPosition }],
    spacing: resolver.paragraphSpacing('splitLine'),
  });
}
