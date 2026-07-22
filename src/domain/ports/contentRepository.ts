/**
 * ContentRepository port — the domain's way of asking for content.
 *
 * The domain declares the shape and never implements it; an outer layer
 * supplies a filesystem-backed adapter, and tests supply an in-memory one.
 */

import type { DomainError } from '../errors/domainError.js';
import type { ContentLibrary } from '../model/ContentLibrary.js';
import type { Result } from '../primitives/result.js';

/** Source of a validated content library. */
export interface ContentRepository {
  /**
   * Loads the library.
   *
   * @returns the library, or every load/validation error encountered
   */
  load(): Promise<Result<ContentLibrary, DomainError[]>>;
}
