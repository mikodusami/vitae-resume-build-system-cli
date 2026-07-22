/**
 * StyleResolver — the one place meaning becomes appearance.
 *
 * Every "what does a `meta` run look like" question resolves here, so
 * restyling the whole resume means editing this class or the theme, never the
 * block renderers. It is the only code in the repository that reads
 * `theme.sizes`.
 */

import {
  BorderStyle,
  type IBordersOptions,
  type IRunOptions,
  type ISectionPropertiesOptions,
  type ISpacingProperties,
  type ITableBordersOptions,
} from 'docx';

import type { Block, TextRun } from '../../domain/index.js';
import type { Theme } from '../theme/Theme.js';

/** Maps semantic roles and emphasis onto concrete docx options. */
export class StyleResolver {
  public constructor(private readonly theme: Theme) {}

  /**
   * Converts one IR run into docx run options.
   *
   * @param run - a semantic run from the document IR
   */
  public runOptions(run: TextRun): IRunOptions {
    const emphasis = run.emphasis ?? [];

    return {
      text: run.text,
      font: this.theme.font,
      size: this.theme.sizes[run.role],
      bold: emphasis.includes('bold'),
      italics: emphasis.includes('italic'),
    };
  }

  /**
   * Vertical spacing for a block kind.
   *
   * Bullets sit tighter than entry lines, which is what keeps a dense resume
   * readable rather than looking like a wall.
   *
   * @param kind - the IR block kind being rendered
   */
  public paragraphSpacing(kind: Block['kind']): ISpacingProperties {
    const { spacing } = this.theme;

    if (kind === 'bullet') {
      return { after: spacing.bulletAfter, line: spacing.line };
    }

    return { before: spacing.entryBefore, after: spacing.entryAfter, line: spacing.line };
  }

  /** Spacing for a section heading paragraph. */
  public sectionHeadingSpacing(): ISpacingProperties {
    return {
      before: this.theme.spacing.sectionBefore,
      after: this.theme.spacing.sectionAfter,
      line: this.theme.spacing.line,
    };
  }

  /** The rule under a section heading, or nothing when disabled. */
  public sectionHeadingBorder(): IBordersOptions | undefined {
    const { sectionRule } = this.theme;
    if (!sectionRule.enabled) {
      return undefined;
    }

    return {
      bottom: {
        style: BorderStyle.SINGLE,
        size: sectionRule.size,
        color: sectionRule.color,
      },
    };
  }

  /**
   * Page setup.
   *
   * Always emitted explicitly: docx defaults to A4, and silently shipping an
   * A4 resume to a US employer is the kind of bug nobody notices until it is
   * printed.
   */
  public pageProperties(): NonNullable<ISectionPropertiesOptions['page']> {
    const { page } = this.theme;

    return {
      size: { width: page.width, height: page.height },
      margin: {
        top: page.margin,
        right: page.margin,
        bottom: page.margin,
        left: page.margin,
      },
    };
  }

  /**
   * Width of the text area, in DXA.
   *
   * Derived from the page rather than configured, so it can never disagree
   * with the margins. An earlier design had this as a separate `rightTab`
   * theme value that silently had to equal `width - 2 × margin`; changing the
   * margin and forgetting to update it broke alignment with no error.
   */
  public get contentWidth(): number {
    return this.theme.page.width - this.theme.page.margin * 2;
  }

  /**
   * Borders for the layout tables behind split lines.
   *
   * Every edge is explicitly `NONE` rather than omitted: several renderers
   * apply a default hairline grid to a table with no border definition, and a
   * faint box around every job title is exactly the kind of defect nobody
   * notices until it is printed.
   */
  public invisibleTableBorders(): ITableBordersOptions {
    const none = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const;

    return {
      top: none,
      bottom: none,
      left: none,
      right: none,
      insideHorizontal: none,
      insideVertical: none,
    };
  }

  /** Bullet indentation, in DXA. */
  public get bulletIndent(): { left: number; hanging: number } {
    return { left: this.theme.bullet.indent, hanging: this.theme.bullet.hanging };
  }

  /**
   * Run options for a hyperlink's visible text.
   *
   * A docx `ExternalHyperlink` does not pick up the conventional blue,
   * underlined look on its own — that appearance comes from explicit run
   * formatting, which is why it is set here rather than left to whatever the
   * viewer defines for a "Hyperlink" character style, which may not exist.
   */
  public hyperlinkRunOptions(run: TextRun): IRunOptions {
    return {
      ...this.runOptions(run),
      color: '0563C1',
      underline: {},
    };
  }

  /** Run options for a section heading's text. */
  public headingRunOptions(text: string): IRunOptions {
    return {
      text,
      font: this.theme.font,
      size: this.theme.sizes.sectionHeading,
      bold: true,
    };
  }
}
