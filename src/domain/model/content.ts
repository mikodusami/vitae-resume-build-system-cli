/**
 * Content model — the typed shape of a resume library.
 *
 * These are plain data shapes with no behavior; lookup and invariants live in
 * {@link ContentLibrary}. Nothing here is presentational: no fonts, sizes, or
 * spacing, only what the resume says and what each piece means.
 */

/** How well the owner can defend a claim in an interview. */
export type Defensibility = 'confident' | 'needs-review' | 'cannot-defend';

/** Name and contact line for the top of the document. */
export interface Header {
  /** The resume owner's display name. */
  readonly name: string;
  /** Contact fragments in display order; the renderer decides the separator. */
  readonly contact: readonly string[];
}

/** The education entry, with per-variant coursework selection. */
export interface Education {
  readonly institution: string;
  readonly degree: string;
  readonly date: string;
  /** Default coursework line; a variant may override it. */
  readonly coursework: string;
}

/** A work experience entry. */
export interface Job {
  readonly title: string;
  readonly org: string;
  readonly location: string;
  /** Free-form range as written, e.g. `Jan 2024 - Present`. */
  readonly date: string;
  readonly bullets: readonly string[];
}

/**
 * A leadership entry.
 *
 * Structurally identical to {@link Job} on purpose — a TA role is a job with a
 * different heading — so the composer can render both through one path.
 */
export type LeadershipEntry = Job;

/** A project, including alternate framings of the same underlying work. */
export interface Project {
  /** Unique within the library, e.g. `quantumbridge-gov`. */
  readonly id: string;
  /** Alternate framings of one piece of work share a claim. */
  readonly claimId: string;
  readonly name: string;
  readonly tech: string;
  readonly link: string;
  readonly bullets: readonly string[];
}

/** The single awards line, rendered as a label followed by entries. */
export interface AwardsLine {
  readonly label: string;
  readonly entries: readonly string[];
}

/** A defensibility record for one piece of work. */
export interface Claim {
  readonly id: string;
  readonly defensibility: Defensibility;
  /**
   * Preparation notes surfaced by the interview-prep command.
   *
   * Explicitly `| undefined` despite `exactOptionalPropertyTypes`: the loading
   * layer binds zod schemas to these types, and an optional zod field yields
   * `T | undefined`. Widening here keeps the domain the source of truth
   * instead of forcing a cast at the boundary.
   */
  readonly reviewNotes?: readonly string[] | undefined;
}

/** One labelled row of the skills section. */
export interface SkillGroup {
  readonly label: string;
  readonly body: string;
}

/**
 * A resume variant: the selection and ordering that makes one output file.
 *
 * Variants hold project *IDs*, never project text, so one project can appear
 * on many variants and adding a variant is data rather than code.
 */
export interface Variant {
  readonly id: string;
  /** Used for the filename and the document title property. */
  readonly label: string;
  readonly summary: string;
  /** Overrides {@link Education.coursework} when non-empty. */
  readonly coursework: string;
  readonly skills: readonly SkillGroup[];
  /** Ordered references into the project collection. */
  readonly projectIds: readonly string[];
}

/** The raw collections a {@link ContentLibrary} wraps. */
export interface ContentLibraryData {
  readonly header: Header;
  readonly education: Education;
  readonly jobs: readonly Job[];
  readonly projects: readonly Project[];
  readonly leadership: readonly LeadershipEntry[];
  readonly awards: AwardsLine;
  readonly claims: readonly Claim[];
  readonly variants: readonly Variant[];
}
