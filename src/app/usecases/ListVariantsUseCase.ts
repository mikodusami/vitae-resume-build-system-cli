/**
 * ListVariantsUseCase — what is on which resume, and can you defend it.
 *
 * The summary carries project *names* and per-tier claim counts so the CLI can
 * render a row without going back to the library for anything.
 */

import type { ClaimsResolver, ContentLibrary, Diagnostic } from '../../domain/index.js';
import { toDiagnostic, type ClaimTierCounts, type ListReport } from '../reports/reports.js';

/** Mutable accumulator; frozen into a {@link ClaimTierCounts} on return. */
type TierAccumulator = { -readonly [K in keyof ClaimTierCounts]: number };

/** Zero counts to accumulate onto. */
function emptyTiers(): TierAccumulator {
  return { confident: 0, 'needs-review': 0, 'cannot-defend': 0 };
}

/** Summarizes every variant in the library. */
export class ListVariantsUseCase {
  public constructor(private readonly claimsResolver: ClaimsResolver) {}

  /**
   * @param library - already-loaded content
   */
  public execute(library: ContentLibrary): ListReport {
    return {
      variants: library.listVariants().map((variant) => {
        const diagnostics: Diagnostic[] = [];
        const projectNames: string[] = [];

        for (const projectId of variant.projectIds) {
          const project = library.getProject(projectId);
          if (project.ok) {
            projectNames.push(project.value.name);
          } else {
            diagnostics.push(toDiagnostic(project.error));
          }
        }

        const claimTiers = emptyTiers();
        const resolved = this.claimsResolver.resolve(variant, library);
        if (resolved.ok) {
          for (const { claim } of resolved.value) {
            claimTiers[claim.defensibility] += 1;
          }
        } else {
          diagnostics.push(...resolved.error.map(toDiagnostic));
        }

        return {
          variantId: variant.id,
          label: variant.label,
          projectNames,
          claimTiers,
          diagnostics,
        };
      }),
    };
  }
}
