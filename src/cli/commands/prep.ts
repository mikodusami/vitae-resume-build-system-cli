/**
 * `vitae prep` — interview checklist for exactly one variant's claims.
 *
 * Built from the review notes of the claims that variant actually puts on the
 * page, so the checklist can never drift from what a recruiter is reading.
 */

import { ClaimsResolver, type ContentLibrary } from '../../domain/index.js';

/**
 * Prints the review checklist for a variant.
 *
 * @param library - the resolved content library
 * @param variantId - variant to prepare for
 * @returns 0 on success, 1 on any lookup failure
 */
export function runPrep(library: ContentLibrary, variantId: string): number {
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

  console.log(`Interview prep — ${variant.value.label}\n`);

  let noteCount = 0;
  for (const { claim, projectIds } of resolved.value) {
    const notes = claim.reviewNotes ?? [];
    if (notes.length === 0) {
      continue;
    }

    console.log(`${projectIds.join(', ')}  [${claim.defensibility}]`);
    for (const note of notes) {
      console.log(`  [ ] ${note}`);
    }
    console.log('');
    noteCount += notes.length;
  }

  if (noteCount === 0) {
    console.log('Nothing to review — every claim on this variant is confident.');
  }

  return 0;
}
