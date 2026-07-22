/**
 * ArchiveNaming — dated, hash-stamped filenames for sent resumes.
 *
 * `2026-07-22_llm-infrastructure_a1b2c3d.docx`
 *
 * This is a second implementation of the `NamingStrategy` interface Layer 4
 * introduced, with no change to the default strategy and none to the use case
 * that consumes it. That it slots in untouched is the concrete evidence that
 * extracting naming into a policy object was the right call rather than
 * speculative generality.
 *
 * The hash identifies **inputs**: it is the commit that produced the build, so
 * `git show <hash>` reconstructs exactly what a recruiter is holding.
 */

import type { Variant } from '../../domain/index.js';
import type { BuildStamp } from '../ports/environment.js';
import type { NamingStrategy } from './ArtifactNaming.js';
import type { OutputFormat } from '../reports/reports.js';

/** File extension per output format. */
const EXTENSIONS: Readonly<Record<OutputFormat, string>> = {
  docx: 'docx',
  txt: 'txt',
};

/** Stamp used when the workspace is not a git repository at all. */
export const NO_GIT_STAMP = 'nogit';

/** Suffix marking a build made from uncommitted content. */
export const DIRTY_SUFFIX = '-dirty';

/**
 * Formats a date as `YYYY-MM-DD` in local time.
 *
 * Local rather than UTC deliberately: the date in the filename should match
 * the day the user believes they sent it.
 */
function isoDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Renders the provenance portion of the filename.
 *
 * A dirty tree gets `-dirty` because the hash alone would be a lie: the
 * content that produced this build is not what that commit contains.
 */
export function formatStamp(stamp: BuildStamp): string {
  if (stamp.hash === undefined) {
    return NO_GIT_STAMP;
  }
  return stamp.dirty ? `${stamp.hash}${DIRTY_SUFFIX}` : stamp.hash;
}

/** Names archived builds. */
export class ArchiveNaming implements NamingStrategy {
  /**
   * @param stamp - provenance of the content being built
   * @param now - injected so filenames are testable and deterministic
   */
  public constructor(
    private readonly stamp: BuildStamp,
    private readonly now: Date = new Date(),
  ) {}

  public filenameFor(variant: Variant, format: OutputFormat): string {
    return `${isoDate(this.now)}_${variant.id}_${formatStamp(this.stamp)}.${EXTENSIONS[format]}`;
  }
}
