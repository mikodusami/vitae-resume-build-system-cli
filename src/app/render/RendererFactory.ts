/**
 * RendererFactory — the one place a format name becomes a renderer.
 *
 * Layer 3 built both renderers behind a common port and deliberately contained
 * no format-choosing logic, because that choice is an application concern.
 * Adding a third output format touches this file and nothing else.
 */

import type { Renderer, Result } from '../../domain/index.js';
import { err, ok } from '../../domain/index.js';
import { DocxRenderer, PlainTextRenderer, type Theme } from '../../render/index.js';
import { UnknownFormatError } from '../errors.js';
import { OUTPUT_FORMATS, type OutputFormat } from '../reports/reports.js';

/** Whatever a renderer produces: bytes for docx, a string for text. */
export type RenderedArtifact = Buffer | string;

/** Builds renderers for the formats the tool supports. */
export class RendererFactory {
  /**
   * @param theme - applied to format-aware renderers; the plain-text renderer
   * deliberately ignores it
   */
  public constructor(private readonly theme: Theme) {}

  /**
   * Resolves a format to a renderer.
   *
   * @param format - requested output format
   * @returns the renderer, or a typed error — never a throw, because an
   * unknown format is user input, not a programmer bug
   */
  public create(format: string): Result<Renderer<RenderedArtifact>, UnknownFormatError> {
    if (format === 'docx') {
      return ok(new DocxRenderer(this.theme));
    }
    if (format === 'txt') {
      return ok(new PlainTextRenderer());
    }

    return err(new UnknownFormatError(format, OUTPUT_FORMATS));
  }

  /** Narrows a string to a supported format. */
  public static isSupported(format: string): format is OutputFormat {
    return (OUTPUT_FORMATS as readonly string[]).includes(format);
  }
}
