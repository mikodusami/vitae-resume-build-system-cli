/**
 * Domain error hierarchy.
 *
 * Every error carries a stable machine-readable `code` alongside its human
 * message: the CLI formats on the code and tests assert on it, so codes are
 * part of the public contract and must not be renamed casually.
 */

/** Stable identifiers for every domain failure. */
export const DOMAIN_ERROR_CODES = {
  unknownProject: 'UNKNOWN_PROJECT',
  unknownJob: 'UNKNOWN_JOB',
  unknownClaim: 'UNKNOWN_CLAIM',
  unknownVariant: 'UNKNOWN_VARIANT',
  duplicateId: 'DUPLICATE_ID',
} as const;

/** The `code` of any concrete domain error. */
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[keyof typeof DOMAIN_ERROR_CODES];

/**
 * Base class for expected domain failures.
 *
 * Extends `Error` for a usable stack in tests and logs, but instances are
 * meant to travel inside `Result`, not to be thrown.
 */
export abstract class DomainError extends Error {
  /**
   * Machine-readable discriminator; see {@link DOMAIN_ERROR_CODES}.
   *
   * Typed as `string` rather than `DomainErrorCode` so outer layers can extend
   * this hierarchy with their own codes (loading, rendering) and the CLI keeps
   * exactly one formatting path for every failure in the tool.
   */
  public abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A variant referenced a project ID absent from the content library. */
export class UnknownProjectError extends DomainError {
  public override readonly code = DOMAIN_ERROR_CODES.unknownProject;

  public constructor(public readonly projectId: string) {
    super(`Unknown project "${projectId}".`);
  }
}

/** A variant referenced a job ID absent from `work.ts`. */
export class UnknownJobError extends DomainError {
  public override readonly code = DOMAIN_ERROR_CODES.unknownJob;

  public constructor(public readonly jobId: string) {
    super(`Unknown job "${jobId}".`);
  }
}

/** A project referenced a claim ID absent from the claims registry. */
export class UnknownClaimError extends DomainError {
  public override readonly code = DOMAIN_ERROR_CODES.unknownClaim;

  public constructor(public readonly claimId: string) {
    super(`Unknown claim "${claimId}".`);
  }
}

/** A command asked for a variant the content library does not define. */
export class UnknownVariantError extends DomainError {
  public override readonly code = DOMAIN_ERROR_CODES.unknownVariant;

  public constructor(public readonly variantId: string) {
    super(`Unknown variant "${variantId}".`);
  }
}

/** Two entities of the same collection share an ID — always a content bug. */
export class DuplicateIdError extends DomainError {
  public override readonly code = DOMAIN_ERROR_CODES.duplicateId;

  /**
   * @param collection - which collection the clash occurred in, e.g. `projects`
   * @param duplicateId - the ID appearing more than once
   */
  public constructor(
    public readonly collection: string,
    public readonly duplicateId: string,
  ) {
    super(`Duplicate ${collection} id "${duplicateId}".`);
  }
}
