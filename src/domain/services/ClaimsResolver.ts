/**
 * ClaimsResolver — maps a variant's projects onto the claims behind them.
 *
 * Kept separate from both composition and policy: resolution answers "which
 * claims does this variant actually put on the page", the policy decides what
 * that means, and the application layer decides whether it blocks a write.
 */

import type { DomainError } from '../errors/domainError.js';
import type { Claim, Variant } from '../model/content.js';
import type { ContentLibrary } from '../model/ContentLibrary.js';
import { err, ok, type Result } from '../primitives/result.js';

/** A claim together with the variant projects that rely on it. */
export interface ResolvedClaim {
  readonly claim: Claim;
  /** Project IDs on this variant sharing the claim, in variant order. */
  readonly projectIds: readonly string[];
}

/** Resolves a variant's project references to their defensibility claims. */
export class ClaimsResolver {
  /**
   * Collects the distinct claims a variant depends on.
   *
   * Alternate framings of one piece of work share a `claimId`, so the result
   * is deduplicated by claim: the honesty layer treats them as one claim with
   * several projects attached.
   *
   * @param variant - the variant whose projects to resolve
   * @param library - source of projects and claims
   * @returns resolved claims in first-appearance order, or every lookup error
   */
  public resolve(
    variant: Variant,
    library: ContentLibrary,
  ): Result<ResolvedClaim[], DomainError[]> {
    const errors: DomainError[] = [];
    const byClaimId = new Map<string, { claim: Claim; projectIds: string[] }>();

    for (const projectId of variant.projectIds) {
      const project = library.getProject(projectId);
      if (!project.ok) {
        errors.push(project.error);
        continue;
      }

      const existing = byClaimId.get(project.value.claimId);
      if (existing !== undefined) {
        existing.projectIds.push(projectId);
        continue;
      }

      const claim = library.getClaim(project.value.claimId);
      if (!claim.ok) {
        errors.push(claim.error);
        continue;
      }

      byClaimId.set(claim.value.id, { claim: claim.value, projectIds: [projectId] });
    }

    if (errors.length > 0) {
      return err(errors);
    }

    return ok([...byClaimId.values()]);
  }
}
