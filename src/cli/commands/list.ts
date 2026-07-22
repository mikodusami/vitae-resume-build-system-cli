/**
 * `vitae list` — variants, their projects, and defensibility status.
 */

import { ClaimsResolver, type ContentLibrary } from '../../domain/index.js';

/** Marker shown beside each claim tier. */
const TIER_MARKERS = {
  confident: '✓',
  'needs-review': '!',
  'cannot-defend': '✗',
} as const;

/**
 * Prints every variant with its projects and their claim status.
 *
 * @param library - the resolved content library
 * @returns process exit code; 0 even when claims are unhealthy, since listing
 * reports rather than gates — use `vitae check` for the gate
 */
export function runList(library: ContentLibrary): number {
  const resolver = new ClaimsResolver();

  for (const variant of library.listVariants()) {
    console.log(`${variant.id}  (${variant.label})`);

    const resolved = resolver.resolve(variant, library);
    if (!resolved.ok) {
      for (const error of resolved.error) {
        console.log(`  error [${error.code}] ${error.message}`);
      }
      continue;
    }

    for (const { claim, projectIds } of resolved.value) {
      console.log(`  ${TIER_MARKERS[claim.defensibility]} ${projectIds.join(', ')}  ${claim.defensibility}`);
    }
    console.log('');
  }

  return 0;
}
