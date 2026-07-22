/**
 * Artifact naming policy.
 *
 * Filenames come from a strategy object rather than inline template literals,
 * because the archive convention
 * (`2026-07-22_llm-infrastructure_a1b2c3d.docx`) is the same policy with a
 * different strategy. Extracting it now avoids the convention living in two
 * places and drifting apart.
 */

import type { Variant } from '../../domain/index.js';
import type { OutputFormat } from '../reports/reports.js';

/** Produces the filename for one rendered variant. */
export interface NamingStrategy {
  filenameFor(variant: Variant, format: OutputFormat): string;
}

/** Filename prefix used when config supplies none. */
export const DEFAULT_FILENAME_PREFIX = 'resume';

/** File extension per output format. */
const EXTENSIONS: Readonly<Record<OutputFormat, string>> = {
  docx: 'docx',
  txt: 'txt',
};

/**
 * Converts arbitrary text into a filename-safe slug.
 *
 * Shared by every naming strategy — a variant ID, and now an archive label,
 * both become part of a path, and a path segment built from unsanitised input
 * is how a stray `/` turns into a write somewhere surprising. Non-alphanumeric
 * runs become a single underscore so filenames read as one token
 * (`resume_llm_infrastructure.docx`, `techcorp_data_science_team`).
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** `resume_llm_infrastructure.docx` — the latest-build convention. */
export class DefaultNaming implements NamingStrategy {
  /**
   * @param prefix - from workspace config; defaults to `resume`
   */
  public constructor(private readonly prefix: string = DEFAULT_FILENAME_PREFIX) {}

  public filenameFor(variant: Variant, format: OutputFormat): string {
    return `${this.prefix}_${slugify(variant.id)}.${EXTENSIONS[format]}`;
  }
}
