/**
 * Theme — every presentational decision in the tool, in one object.
 *
 * This is where fonts and sizes enter the system and nowhere earlier. Layers 1
 * and 2 have never heard of a font, which is the property that keeps the domain
 * reusable across output formats.
 *
 * ## Units
 *
 * Two different units coexist here, which is exactly the sort of thing that
 * bites six months later, so read this before changing a number:
 *
 * - **DXA** (twentieths of a point; 1440 = 1 inch) for every length: page
 *   dimensions, margins, indents, tab stops, spacing.
 * - **Half-points** for `sizes`: `19` means 9.5pt, `30` means 15pt. This is
 *   docx's own convention for run sizes, kept rather than converted so the
 *   values match what you would read in the OOXML.
 * - `sectionRule.size` is in **eighths of a point**, docx's border unit.
 */

import type { TextRole } from '../../domain/index.js';

/** Page geometry, in DXA. */
export interface PageTheme {
  readonly width: number;
  readonly height: number;
  /** Applied to all four edges. */
  readonly margin: number;
}

/** Bullet indentation, in DXA. */
export interface BulletTheme {
  /** Distance from the left margin to the text. */
  readonly indent: number;
  /** How far the bullet glyph hangs back into that indent. */
  readonly hanging: number;
}

/** Vertical rhythm, in DXA. */
export interface SpacingTheme {
  readonly sectionBefore: number;
  readonly sectionAfter: number;
  readonly bulletAfter: number;
  /** Line height, in DXA; 240 is single-spaced. */
  readonly line: number;
  readonly entryBefore: number;
  readonly entryAfter: number;
}

/** The rule drawn under section headings. */
export interface SectionRuleTheme {
  readonly enabled: boolean;
  /** Border thickness in eighths of a point. */
  readonly size: number;
  /** Hex RGB without a leading `#`. */
  readonly color: string;
}

/** A complete, fully-specified theme. */
export interface Theme {
  readonly font: string;
  readonly page: PageTheme;
  /** Run size per semantic role, in half-points. */
  readonly sizes: Readonly<Record<TextRole, number>>;
  readonly bullet: BulletTheme;
  readonly spacing: SpacingTheme;
  readonly sectionRule: SectionRuleTheme;
}

/**
 * The defaults every user theme merges onto.
 *
 * These are the proven values from the working generator: US Letter with 0.5"
 * margins and Calibri. Because defaults live in the tool, a user's `theme.ts`
 * stays small and diffable — someone who only wants a different font says only
 * that.
 */
export const DEFAULT_THEME: Theme = {
  font: 'Calibri',
  page: {
    width: 12240,
    height: 15840,
    margin: 720,
  },
  sizes: {
    name: 30,
    sectionHeading: 20,
    body: 19,
    meta: 18,
    link: 18,
  },
  bullet: {
    indent: 260,
    hanging: 160,
  },
  spacing: {
    sectionBefore: 110,
    sectionAfter: 30,
    bulletAfter: 16,
    line: 228,
    entryBefore: 50,
    entryAfter: 14,
  },
  sectionRule: {
    enabled: true,
    size: 4,
    color: '444444',
  },
};
