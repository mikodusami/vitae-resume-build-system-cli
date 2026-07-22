/**
 * Boundary schemas — the anti-corruption layer's checkpoint.
 *
 * Everything crossing into the process from disk is untrusted: a typo, a stale
 * field name, a half-finished edit. Nothing reaches the domain until it has
 * been verified here, which is what lets Layer 1 assume well-formed inputs and
 * never defensively re-check.
 *
 * Each schema is annotated `z.ZodType<DomainType>` rather than having its type
 * inferred with `z.infer`. That inversion is deliberate: the domain leads and
 * the boundary follows, so adding a field to a domain type and forgetting the
 * schema **breaks the build** instead of confusing a user at runtime.
 *
 * Objects are strict — a mistyped `bullet:` that silently vanishes from a
 * resume is far worse than a loud failure.
 */

import { z } from 'zod';

import type {
  AwardsLine,
  Claim,
  Education,
  GpaEntry,
  Header,
  Job,
  LeadershipEntry,
  Project,
  SkillGroup,
  Variant,
} from '../../domain/index.js';

/** An identifier that must actually identify something. */
const idSchema = z.string().min(1, 'must not be empty');

/** Prose that must actually say something. */
const nonEmptyText = z.string().min(1, 'must not be empty');

export const headerSchema: z.ZodType<Header> = z.strictObject({
  name: nonEmptyText,
  contact: z.array(nonEmptyText).min(1, 'needs at least one contact entry'),
});

export const gpaEntrySchema: z.ZodType<GpaEntry> = z.strictObject({
  label: nonEmptyText,
  value: nonEmptyText,
});

export const educationSchema: z.ZodType<Education> = z.strictObject({
  institution: nonEmptyText,
  location: nonEmptyText,
  degree: nonEmptyText,
  date: nonEmptyText,
  // Absent entirely, not empty, when a resume doesn't show a GPA.
  gpa: gpaEntrySchema.optional(),
  // Coursework may be empty: a variant can supply its own, and some resumes
  // legitimately omit the line entirely.
  coursework: z.string(),
});

export const jobSchema: z.ZodType<Job> = z.strictObject({
  title: nonEmptyText,
  org: nonEmptyText,
  location: nonEmptyText,
  date: nonEmptyText,
  bullets: z.array(nonEmptyText).min(1, 'needs at least one bullet'),
});

/** Leadership entries are jobs; the domain models them as the same shape. */
export const leadershipEntrySchema: z.ZodType<LeadershipEntry> = jobSchema;

export const projectSchema: z.ZodType<Project> = z.strictObject({
  id: idSchema,
  claimId: idSchema,
  name: nonEmptyText,
  tech: z.string(),
  link: z.string(),
  bullets: z.array(nonEmptyText).min(1, 'needs at least one bullet'),
});

export const awardsLineSchema: z.ZodType<AwardsLine> = z.strictObject({
  label: nonEmptyText,
  entries: z.array(nonEmptyText),
});

export const claimSchema: z.ZodType<Claim> = z.strictObject({
  id: idSchema,
  defensibility: z.enum(['confident', 'needs-review', 'cannot-defend']),
  reviewNotes: z.array(nonEmptyText).optional(),
});

export const skillGroupSchema: z.ZodType<SkillGroup> = z.strictObject({
  label: nonEmptyText,
  body: nonEmptyText,
});

export const variantSchema: z.ZodType<Variant> = z.strictObject({
  id: idSchema,
  label: nonEmptyText,
  summary: nonEmptyText,
  coursework: z.string(),
  skills: z.array(skillGroupSchema),
  projectIds: z.array(idSchema).min(1, 'a variant needs at least one project'),
});

/** Collection schemas for the array-valued content files. */
export const jobsSchema: z.ZodType<Job[]> = z.array(jobSchema);
export const projectsSchema: z.ZodType<Project[]> = z.array(projectSchema);
export const leadershipSchema: z.ZodType<LeadershipEntry[]> = z.array(leadershipEntrySchema);
export const claimsSchema: z.ZodType<Claim[]> = z.array(claimSchema);

/**
 * The `leadership.ts` file carries both the leadership entries and the awards
 * line, matching the folder layout in the system design.
 */
export interface LeadershipFile {
  readonly entries: readonly LeadershipEntry[];
  readonly awards: AwardsLine;
}

export const leadershipFileSchema: z.ZodType<LeadershipFile> = z.strictObject({
  entries: z.array(leadershipEntrySchema),
  awards: awardsLineSchema,
});
