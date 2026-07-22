/**
 * Split line renderer — left text, right-aligned date or link.
 *
 * This one handler renders every job header, education line, and project
 * header. The domain only says "these two things sit on one line, pushed
 * apart"; deciding *how* is exactly the translation this layer exists to
 * perform.
 *
 * ## Why a table and not a right tab stop
 *
 * The obvious implementation is a `TabStopType.RIGHT` stop with a tab
 * character between the halves, and that is what this used to do. The markup
 * was valid OOXML and rendered correctly in Word — but a right tab stop is
 * only as good as the importer reading it:
 *
 * - **Quick Look, Preview, TextEdit, and Pages** share Apple's document import
 *   stack, which discards custom tab stops entirely. (`textutil` drops them
 *   even from a minimal hand-built docx, which is how this was confirmed.)
 * - **Google Docs** kept the stop but lost the tab character, so the two
 *   halves collided and looked "squeezed" — typing a Tab by hand snapped the
 *   date into place, which is what identified the cause.
 *
 * A borderless two-cell table needs neither a tab stop nor a tab character:
 * the right cell is simply right-aligned, which every renderer honours. The
 * document IR is unchanged by this — `splitLine` still means what it always
 * meant, and `PlainTextRenderer` never noticed. That is the semantic IR
 * earning its keep: a rendering bug stayed a rendering fix.
 *
 * The cost is that these lines are now tables, which some older ATS parsers
 * handle less predictably than paragraphs. Two things make that acceptable:
 * the layout is a single row of two cells (not a multi-column page layout,
 * which is what actually defeats parsers), and `vitae build --format txt`
 * exists precisely for ATS submission.
 */

import {
  AlignmentType,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  VerticalAlign,
  WidthType,
} from 'docx';

import type { Block, TextRun } from '../../../domain/index.js';
import type { StyleResolver } from '../StyleResolver.js';
import { toParagraphChild } from './textRuns.js';

/** The split-line variant of the IR block union. */
type SplitLineBlock = Extract<Block, { kind: 'splitLine' }>;

/**
 * Share of the line given to the left-hand side.
 *
 * The right cell takes the remainder. Cells expand to fit their content, so
 * this only decides where the wrap point falls on an unusually long title.
 */
const LEFT_COLUMN_PERCENT = 68;

/**
 * Builds one cell of the line.
 *
 * @param runs - the IR runs for this side
 * @param resolver - supplies fonts, sizes, and spacing
 * @param alignment - left for the title, right for the date or link
 * @param widthDxa - this cell's width, in DXA
 */
function buildCell(
  runs: readonly TextRun[],
  resolver: StyleResolver,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
  widthDxa: number,
): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: runs.map((run) => toParagraphChild(run, resolver)),
        spacing: resolver.paragraphSpacing('splitLine'),
        alignment,
      }),
    ],
    width: { size: widthDxa, type: WidthType.DXA },
    // Zeroed, or the table's default padding would indent these lines
    // relative to every surrounding paragraph.
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER,
  });
}

/**
 * Renders a split line as a borderless two-cell row.
 *
 * @param block - the left and right run groups
 * @param resolver - supplies fonts, sizes, spacing, and the line width
 */
export function renderSplitLine(block: SplitLineBlock, resolver: StyleResolver): Table {
  // Explicit DXA widths derived from the page, plus a fixed layout: some
  // renderers lay a table out from `tblGrid` rather than from cell widths, and
  // a grid that disagrees with the cells is how "right-aligned" quietly stops
  // being right-aligned.
  const total = resolver.contentWidth;
  const leftWidth = Math.round((total * LEFT_COLUMN_PERCENT) / 100);
  const rightWidth = total - leftWidth;

  return new Table({
    rows: [
      new TableRow({
        children: [
          buildCell(block.left, resolver, AlignmentType.LEFT, leftWidth),
          buildCell(block.right, resolver, AlignmentType.RIGHT, rightWidth),
        ],
        cantSplit: true,
      }),
    ],
    width: { size: total, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    layout: TableLayoutType.FIXED,
    borders: resolver.invisibleTableBorders(),
  });
}
