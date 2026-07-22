/**
 * ZodDiagnosticMapper — one translation from zod's issues to our errors.
 *
 * Routing every validation failure through a single mapper is what makes each
 * message in the tool read the same way, and it is the guarantee that a raw
 * `ZodError` never reaches a user.
 */

import type { ZodError, ZodIssue } from 'zod';

import type { DomainError } from '../../domain/index.js';
import { SchemaValidationError } from '../errors.js';

/**
 * Any error produced while loading a workspace.
 *
 * Loading failures are ordinary `DomainError`s so that the CLI has exactly one
 * formatting path for domain and load problems alike.
 */
export type LoadDiagnostic = DomainError;

/**
 * Formats an issue path the way a user would write it: `skills[2].label`.
 *
 * @param path - zod's path segments, mixing keys and array indices
 */
export function formatFieldPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return '(root)';
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') {
      return `${formatted}[${segment}]`;
    }
    return formatted.length === 0 ? String(segment) : `${formatted}.${String(segment)}`;
  }, '');
}

/** Noise zod prefixes onto type messages; the file path already gives context. */
const ZOD_PREFIX = /^Invalid input:\s*/;

/**
 * Describes what went wrong in one clause.
 *
 * zod's own `message` already reads well for type mismatches
 * ("expected string, received number") and knows the received value, which the
 * issue object does not expose — so it is used rather than reconstructed.
 * Unknown keys get rewritten, because that message is the one most likely to
 * be read by someone who just made a typo.
 */
function describeIssue(issue: ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    const plural = issue.keys.length > 1 ? 's' : '';
    return `unknown field${plural} ${issue.keys.join(', ')} — check for a typo, or remove it`;
  }

  return issue.message.replace(ZOD_PREFIX, '');
}

/** Translates zod validation failures into loading diagnostics. */
export class ZodDiagnosticMapper {
  /**
   * Converts every issue in a `ZodError` into one diagnostic.
   *
   * @param error - the failure zod reported
   * @param filePath - file being validated, for provenance in the message
   */
  public static toDiagnostics(error: ZodError, filePath: string): SchemaValidationError[] {
    return error.issues.map(
      (issue) =>
        new SchemaValidationError(filePath, formatFieldPath(issue.path), describeIssue(issue)),
    );
  }
}
