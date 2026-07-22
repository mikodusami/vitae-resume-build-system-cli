/**
 * ArtifactWriter port — how a use case puts bytes somewhere.
 *
 * Declared here rather than imported from `infra/` so use cases depend on an
 * interface they own. The composition root injects the real filesystem
 * adapter; tests inject a recorder, which is what lets this entire layer be
 * tested with no disk access at all.
 */

import type { Result } from '../../domain/index.js';
import type { IoError } from '../errors.js';

/** What was written, and how much of it. */
export interface WrittenArtifact {
  readonly path: string;
  readonly byteLength: number;
}

/** Persists rendered artifacts. */
export interface ArtifactWriter {
  /**
   * Writes bytes to an absolute path.
   *
   * @param absPath - destination, parent directories assumed to exist
   * @param bytes - rendered output, binary or text
   */
  write(absPath: string, bytes: Buffer | string): Promise<Result<WrittenArtifact, IoError>>;

  /** Creates a directory and any missing parents. */
  ensureDir(absPath: string): Promise<Result<void, IoError>>;
}
