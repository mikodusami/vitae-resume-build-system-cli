/**
 * Document IR — the rendering-agnostic product of the domain.
 *
 * This model describes *what* the resume says and what each piece *means*,
 * never how big or what font. Keeping it presentation-free is what makes new
 * output formats cheap: a docx writer, a PDF renderer, an HTML portfolio page,
 * and a plain-text ATS variant are all adapters over this same IR.
 *
 * If a font name, point size, or margin ever appears in this file, the layer
 * has failed.
 */

/** What a run of text *is*, which the renderer maps to type treatment. */
export type TextRole = 'name' | 'body' | 'meta' | 'link' | 'sectionHeading';

/** Semantic emphasis; the renderer chooses how to express it. */
export type Emphasis = 'bold' | 'italic';

/** A contiguous piece of text sharing one role and emphasis set. */
export interface TextRun {
  readonly text: string;
  readonly role: TextRole;
  readonly emphasis?: readonly Emphasis[];
  /**
   * Where this run points, when it is a hyperlink.
   *
   * A URL is content, not presentation — it cannot be invented from the
   * `link` role alone, so it travels with the run rather than being guessed
   * at by the renderer. Absent means "styled like a link, but not clickable,"
   * which should not normally happen: see `toHref` in `ResumeComposer`.
   */
  readonly href?: string;
}

/** Horizontal placement of a paragraph within the text column. */
export type BlockAlignment = 'left' | 'center';

/**
 * A unit of document content.
 *
 * `splitLine` is the abstraction for every "left text, right-aligned
 * date/link" row — job headers, education, project headers. The domain says
 * only that the two sides sit on one line, pushed apart; where the tab stop
 * lands is the renderer's business.
 */
export type Block =
  | { readonly kind: 'paragraph'; readonly runs: readonly TextRun[]; readonly align?: BlockAlignment }
  | { readonly kind: 'bullet'; readonly runs: readonly TextRun[] }
  | { readonly kind: 'splitLine'; readonly left: readonly TextRun[]; readonly right: readonly TextRun[] };

/** A titled group of blocks; the header block group carries no heading. */
export interface Section {
  readonly heading?: string;
  readonly blocks: readonly Block[];
}

/** File-level metadata, carried into the output format's document properties. */
export interface DocumentMeta {
  readonly title: string;
  readonly creator: string;
  readonly description: string;
  /** ATS-visible keywords, derived from the variant's skills. */
  readonly keywords: readonly string[];
}

/** A complete, composed resume awaiting a renderer. */
export interface ResumeDocument {
  readonly meta: DocumentMeta;
  readonly sections: readonly Section[];
}

/**
 * Builds a text run.
 *
 * @param text - the literal text
 * @param role - semantic role driving the renderer's type choice
 * @param emphasis - optional emphasis; omitted entirely when empty
 * @param href - where this run points, when it is a hyperlink
 */
export function run(
  text: string,
  role: TextRole,
  emphasis?: readonly Emphasis[],
  href?: string,
): TextRun {
  return {
    text,
    role,
    ...(emphasis === undefined || emphasis.length === 0 ? {} : { emphasis }),
    ...(href === undefined ? {} : { href }),
  };
}

/** Builds a paragraph block. */
export function paragraph(runs: readonly TextRun[], align?: BlockAlignment): Block {
  return align === undefined ? { kind: 'paragraph', runs } : { kind: 'paragraph', runs, align };
}

/** Builds a bullet block. */
export function bullet(runs: readonly TextRun[]): Block {
  return { kind: 'bullet', runs };
}

/** Builds a split line: left content pushed apart from right content. */
export function splitLine(left: readonly TextRun[], right: readonly TextRun[]): Block {
  return { kind: 'splitLine', left, right };
}
