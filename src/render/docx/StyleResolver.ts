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

  /** Where the right-aligned half of a split line lands, in DXA. */
  public get rightTabPosition(): number {
    return this.theme.rightTab;
  }

  /** Bullet indentation, in DXA. */
  public get bulletIndent(): { left: number; hanging: number } {
    return { left: this.theme.bullet.indent, hanging: this.theme.bullet.hanging };
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
