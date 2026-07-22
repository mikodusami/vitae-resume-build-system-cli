/**
 * Application-layer errors.
 *
 * Same hierarchy as every other layer's, so the CLI keeps one formatting path
 * for domain, loading, and orchestration failures alike.
 */

import { DomainError } from '../domain/index.js';

/** Stable identifiers for application failures. */
export const APP_ERROR_CODES = {
  io: 'IO_FAILED',
  unknownFormat: 'UNKNOWN_FORMAT',
} as const;

/** A write or directory operation failed. */
export class IoError extends DomainError {
  public override readonly code = APP_ERROR_CODES.io;

  /**
   * @param path - the offending path; always included, because "permission
   * denied" without a path is a useless error message
   * @param reason - the underlying message, stripped of its stack
   */
  public constructor(
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`${path}: ${reason}`);
  }
}

/** A requested output format has no renderer. */
export class UnknownFormatError extends DomainError {
  public override readonly code = APP_ERROR_CODES.unknownFormat;

  public constructor(
    public readonly format: string,
    known: readonly string[],
  ) {
    super(`Unknown output format "${format}". Known formats: ${known.join(', ')}.`);
  }
}
