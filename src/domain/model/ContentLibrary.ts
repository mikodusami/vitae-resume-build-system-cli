/**
 * ContentLibrary — the one place that knows how to find content by ID.
 *
 * Everything else asks the library rather than scanning collections, so the
 * "unknown ID" failure has exactly one implementation and one error shape.
 */

import {
  DuplicateIdError,
  UnknownClaimError,
  UnknownProjectError,
  UnknownVariantError,
} from '../errors/domainError.js';
import { err, ok, type Result } from '../primitives/result.js';
import type {
  AwardsLine,
  Claim,
  ContentLibraryData,
  Education,
  Header,
  Job,
  LeadershipEntry,
  Project,
  Variant,
} from './content.js';

/**
 * Indexes a collection by ID, rejecting duplicates.
 *
 * @param collection - name used in the error message, e.g. `projects`
 * @param items - entities carrying a unique `id`
 * @returns the index, or the first duplicate encountered
 */
function indexById<T extends { readonly id: string }>(
  collection: string,
  items: readonly T[],
): Result<ReadonlyMap<string, T>, DuplicateIdError> {
  const index = new Map<string, T>();

  for (const item of items) {
    if (index.has(item.id)) {
      return err(new DuplicateIdError(collection, item.id));
    }
    index.set(item.id, item);
  }

  return ok(index);
}

/**
 * An immutable, ID-indexed view over a resume content library.
 *
 * Construct with {@link ContentLibrary.create}; the constructor is private
 * because a library with duplicate IDs must never come into existence.
 */
export class ContentLibrary {
  private constructor(
    private readonly data: ContentLibraryData,
    private readonly projectIndex: ReadonlyMap<string, Project>,
    private readonly claimIndex: ReadonlyMap<string, Claim>,
    private readonly variantIndex: ReadonlyMap<string, Variant>,
  ) {}

  /**
   * Builds a library, rejecting duplicate project, claim, or variant IDs.
   *
   * Duplicate IDs are a content bug worth catching at construction rather than
   * at render time, where the symptom would be a silently dropped entry.
   *
   * @param data - the raw collections
   * @returns the library, or every duplicate-ID error found
   */
  public static create(data: ContentLibraryData): Result<ContentLibrary, DuplicateIdError[]> {
    const projects = indexById('projects', data.projects);
    const claims = indexById('claims', data.claims);
    const variants = indexById('variants', data.variants);

    const errors: DuplicateIdError[] = [];
    if (!projects.ok) errors.push(projects.error);
    if (!claims.ok) errors.push(claims.error);
    if (!variants.ok) errors.push(variants.error);

    if (!projects.ok || !claims.ok || !variants.ok) {
      return err(errors);
    }

    return ok(new ContentLibrary(data, projects.value, claims.value, variants.value));
  }

  /** Looks up a project by ID. */
  public getProject(id: string): Result<Project, UnknownProjectError> {
    const project = this.projectIndex.get(id);
    return project === undefined ? err(new UnknownProjectError(id)) : ok(project);
  }

  /** Looks up a claim by ID. */
  public getClaim(id: string): Result<Claim, UnknownClaimError> {
    const claim = this.claimIndex.get(id);
    return claim === undefined ? err(new UnknownClaimError(id)) : ok(claim);
  }

  /** Looks up a variant by ID. */
  public getVariant(id: string): Result<Variant, UnknownVariantError> {
    const variant = this.variantIndex.get(id);
    return variant === undefined ? err(new UnknownVariantError(id)) : ok(variant);
  }

  /** Every variant, in declaration order. */
  public listVariants(): readonly Variant[] {
    return this.data.variants;
  }

  /** Every project, in declaration order. */
  public listProjects(): readonly Project[] {
    return this.data.projects;
  }

  public get header(): Header {
    return this.data.header;
  }

  public get education(): Education {
    return this.data.education;
  }

  public get jobs(): readonly Job[] {
    return this.data.jobs;
  }

  public get leadership(): readonly LeadershipEntry[] {
    return this.data.leadership;
  }

  public get awards(): AwardsLine {
    return this.data.awards;
  }
}
