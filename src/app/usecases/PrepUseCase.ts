/**
 * PrepUseCase — the interview checklist for one variant.
 *
 * This closes the loop the claims registry opens: flag a project
 * `needs-review`, generate the checklist for the resume you are actually
 * sending, work through it, then flip the tier to `confident` as a commit.
 *
 * Because the checklist is built from the claims of that specific variant, it
 * cannot drift from what a recruiter is reading.
 *
 * Consumes `reviewNotes` exactly as the domain has exposed them since Layer 1 —
 * no domain change was needed for any of this.
 */

import type { ClaimsResolver, ContentLibrary, Defensibility } from '../../domain/index.js';
import { toDiagnostic, type PrepReport, type PrepSection } from '../reports/reports.js';

/** Which variant to prepare for. */
export interface PrepInput {
  readonly variantId: string;
}

/** Tier order in the output: most urgent first. */
const TIER_ORDER: readonly Defensibility[] = ['cannot-defend', 'needs-review', 'confident'];

/** Builds the prep checklist. */
export class PrepUseCase {
  /**
   * @param claimsResolver - maps a variant's projects to their claims
   * @param now - injected so generated output is testable against a golden file
   */
  public constructor(
    private readonly claimsResolver: ClaimsResolver,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * @param library - already-loaded content
   * @param input - which variant
   */
  public execute(library: ContentLibrary, input: PrepInput): PrepReport {
    const variant = library.getVariant(input.variantId);
    if (!variant.ok) {
      return {
        variantId: input.variantId,
        label: input.variantId,
        generatedAt: this.now().toISOString(),
        sections: [],
        diagnostics: [toDiagnostic(variant.error)],
      };
    }

    const resolved = this.claimsResolver.resolve(variant.value, library);
    if (!resolved.ok) {
      return {
        variantId: variant.value.id,
        label: variant.value.label,
        generatedAt: this.now().toISOString(),
        sections: [],
        diagnostics: resolved.error.map(toDiagnostic),
      };
    }

    const sections: PrepSection[] = [];

    for (const tier of TIER_ORDER) {
      const entries = resolved.value
        .filter(({ claim }) => claim.defensibility === tier)
        .map(({ claim, projectIds }) => ({
          claimId: claim.id,
          // Names, not ids: the checklist is read by a person.
          projectNames: projectIds.flatMap((projectId) => {
            const project = library.getProject(projectId);
            return project.ok ? [project.value.name] : [];
          }),
          notes: claim.reviewNotes ?? [],
        }));

      if (entries.length > 0) {
        sections.push({ tier, entries });
      }
    }

    return {
      variantId: variant.value.id,
      label: variant.value.label,
      generatedAt: this.now().toISOString(),
      sections,
      diagnostics: [],
    };
  }
}
