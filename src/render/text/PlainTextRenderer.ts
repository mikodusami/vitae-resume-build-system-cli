/**
 * PlainTextRenderer — the second renderer, shipped to prove the seam is real.
 *
 * This exists to fail loudly if the IR has quietly become docx-shaped. It
 * takes no theme at all: if rendering readable text ever requires reaching for
 * something presentational, that is the document model leaking and a design
 * problem to fix in the domain, not to work around here.
 *
 * It also earns its keep as an ATS-safe output and makes rendering tests
 * readable — a golden text file is a far better regression signal than a diff
 * of zipped XML.
 */

import type { Block, Renderer, ResumeDocument, TextRun } from '../../domain/index.js';

/** Column at which the right-hand side of a split line ends. */
export const DEFAULT_LINE_WIDTH = 80;

/** Prefix marking a bullet in plain text. */
const BULLET_PREFIX = '- ';

/** Flattens runs to their text; emphasis has no plain-text expression. */
function flatten(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join('');
}

/** Renders the document IR as plain text. */
export class PlainTextRenderer implements Renderer<string> {
  /**
   * @param lineWidth - column at which right-aligned text ends
   */
  public constructor(private readonly lineWidth: number = DEFAULT_LINE_WIDTH) {}

  public render(doc: ResumeDocument): Promise<string> {
    const lines: string[] = [];

    for (const section of doc.sections) {
      if (section.heading !== undefined) {
        lines.push('', section.heading.toUpperCase());
      }
      for (const block of section.blocks) {
        lines.push(this.renderBlock(block));
      }
    }

    // Leading blank line from the first heading is trimmed; the trailing
    // newline is kept so the file ends the way text files should.
    return Promise.resolve(`${lines.join('\n').trimStart()}\n`);
  }

  /** Renders one block as a single line. */
  private renderBlock(block: Block): string {
    if (block.kind === 'bullet') {
      return `${BULLET_PREFIX}${flatten(block.runs)}`;
    }

    if (block.kind === 'paragraph') {
      return flatten(block.runs);
    }

    return this.renderSplitLine(flatten(block.left), flatten(block.right));
  }

  /**
   * Pads a split line so the right side ends at the configured width.
   *
   * When the two sides do not fit, a single space separates them rather than
   * truncating: losing a date to keep a column is the wrong trade.
   */
  private renderSplitLine(left: string, right: string): string {
    const padding = this.lineWidth - left.length - right.length;
    return padding > 0 ? `${left}${' '.repeat(padding)}${right}` : `${left} ${right}`;
  }
}
