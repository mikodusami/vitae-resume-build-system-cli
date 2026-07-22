/**
 * `vitae check` — the claims gate, with no output file written.
 *
 * This is where the application-layer decision from Layer 1 actually gets
 * made: the domain merely reports diagnostics, and this command chooses that
 * an error-severity diagnostic means a non-zero exit.
 */

import { ClaimsPolicy, ClaimsResolver, type ContentLibrary } from '../../domain/index.js';

/**
 * Validates a variant's claims.
 *
 * @param library - the resolved content library
 * @param variantId - variant to check
 * @returns 0 when clean or only warnings, 1 when any error-severity diagnostic
 * or resolution failure occurred
 */
export function runCheck(library: ContentLibrary, variantId: string): number {
  const variant = library.getVariant(variantId);
  if (!variant.ok) {
    console.error(`error: ${variant.error.message}`);
    return 1;
  }

  const resolved = new ClaimsResolver().resolve(variant.value, library);
  if (!resolved.ok) {
    for (const error of resolved.error) {
      console.error(`error [${error.code}]: ${error.message}`);
    }
    return 1;
  }

  const report = new ClaimsPolicy().evaluate(resolved.value);
  for (const diagnostic of report.diagnostics) {
    const stream = diagnostic.severity === 'error' ? console.error : console.log;
    stream(`${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`);
  }

  if (report.diagnostics.length === 0) {
    console.log(`${variantId}: all claims confident.`);
  }

  return report.hasErrors ? 1 : 0;
}
