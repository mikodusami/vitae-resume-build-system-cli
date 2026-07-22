/**
 * DocxRenderer — the `Renderer<Buffer>` implementation.
 *
 * A pure function of `(document, theme)`: no filesystem, no globals, and no
 * clock of its own.
 *
 * ## On determinism
 *
 * The rendered *content* is deterministic — same document and theme produce an
 * identical `word/document.xml` every time, which is the property the tests
 * assert and the one that matters.
 *
 * Whole-buffer byte-identity is **not** achievable with docx 9.x: the library
 * stamps `dcterms:created`/`modified` in `docProps/core.xml` from `new Date()`
 * internally, with no option to override, and the zip container records entry
 * timestamps too. This is deliberately not worked around — the archive
 * convention stamps builds with the git hash of the *content* that produced
 * them, so nothing downstream depends on docx bytes being reproducible.
 *
 * ## docx-js constraints encoded here
 *
 * Each of these is a silent-corruption bug rather than a crash, so they are
 * stated rather than left to be rediscovered:
 *
 * - Never emit `\n` inside a run. Line breaks come from separate paragraphs.
 * - Never insert a literal `•`. Bullets come from the numbering config, or
 *   they are not lists to Word, to an ATS, or to a screen reader.
 * - Page size must be set explicitly or the output silently becomes A4.
 */

import {
  AlignmentType,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun as DocxTextRun,
} from 'docx';

import type { Renderer, ResumeDocument, Section } from '../../domain/index.js';
import { DEFAULT_THEME, type Theme } from '../theme/Theme.js';
import { BULLET_NUMBERING_REFERENCE } from './blocks/bullet.js';
import { renderBlock, type RenderedBlock } from './blocks/registry.js';
import { StyleResolver } from './StyleResolver.js';

/** Tool name recorded as the last editor. */
const TOOL_NAME = 'vitae';

/** Renders the document IR to a `.docx` buffer. */
export class DocxRenderer implements Renderer<Buffer> {
  private readonly resolver: StyleResolver;

  /**
   * @param theme - presentational values; defaults when the user has no theme
   */
  public constructor(private readonly theme: Theme = DEFAULT_THEME) {
    this.resolver = new StyleResolver(theme);
  }

  public async render(doc: ResumeDocument): Promise<Buffer> {
    const document = new Document({
      title: doc.meta.title,
      creator: doc.meta.creator,
      description: doc.meta.description,
      keywords: doc.meta.keywords.join(', '),
      lastModifiedBy: TOOL_NAME,
      numbering: {
        config: [
          {
            reference: BULLET_NUMBERING_REFERENCE,
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: this.resolver.bulletIndent,
                  },
                },
              },
            ],
          },
        ],
      },
      sections: [
        {
          properties: { page: this.resolver.pageProperties() },
          children: doc.sections.flatMap((section) => this.renderSection(section)),
        },
      ],
    });

    return Packer.toBuffer(document);
  }

  /** The theme this renderer was constructed with. */
  public get activeTheme(): Theme {
    return this.theme;
  }

  /**
   * Renders one section: its heading, then its blocks.
   *
   * The renderer never "improves" content — nothing is inferred, reordered, or
   * injected that the IR did not say. If output needs something the IR cannot
   * express, that is a domain change, not a special case here.
   */
  private renderSection(section: Section): RenderedBlock[] {
    const children: RenderedBlock[] = [];

    if (section.heading !== undefined) {
      children.push(this.renderHeading(section.heading));
    }

    for (const block of section.blocks) {
      children.push(renderBlock(block, this.resolver));
    }

    return children;
  }

  /** A section heading paragraph, with the themed rule beneath it. */
  private renderHeading(heading: string): Paragraph {
    const border = this.resolver.sectionHeadingBorder();

    return new Paragraph({
      children: [new DocxTextRun(this.resolver.headingRunOptions(heading.toUpperCase()))],
      spacing: this.resolver.sectionHeadingSpacing(),
      ...(border === undefined ? {} : { border }),
    });
  }
}
