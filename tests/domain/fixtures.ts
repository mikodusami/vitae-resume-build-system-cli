/**
 * In-memory content fixtures.
 *
 * Deliberately realistic rather than minimal, so later layers' tests (loading,
 * rendering, CLI) can reuse this builder instead of inventing their own shapes.
 * Every helper takes overrides, so a test states only what it cares about.
 */

import type {
  Claim,
  ContentLibraryData,
  Education,
  Header,
  Job,
  Project,
  Variant,
} from '../../src/domain/model/content.js';
import { ContentLibrary } from '../../src/domain/model/ContentLibrary.js';

/** Builds a header, overridable field by field. */
export function makeHeader(overrides: Partial<Header> = {}): Header {
  return {
    name: 'Ada Lovelace',
    contact: ['ada@example.com', '555-0100', 'github.com/ada'],
    ...overrides,
  };
}

/** Builds an education entry. */
export function makeEducation(overrides: Partial<Education> = {}): Education {
  return {
    institution: 'Analytical University',
    degree: 'B.S. Computer Science',
    date: 'May 2026',
    coursework: 'Algorithms, Databases',
    ...overrides,
  };
}

/** Builds a job (or, unchanged in shape, a leadership entry). */
export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    title: 'Research Assistant',
    org: 'Analytical University',
    location: 'Remote',
    date: 'Jan 2025 - Present',
    bullets: ['Built an ingestion pipeline processing 2M rows nightly.'],
    ...overrides,
  };
}

/** Builds a project; `id` is required because tests reference it by name. */
export function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    claimId: id,
    name: `Project ${id}`,
    tech: 'TypeScript, Postgres',
    link: `github.com/ada/${id}`,
    bullets: [`Shipped ${id} end to end.`],
    ...overrides,
  };
}

/** Builds a claim; defaults to the tier that produces no diagnostics. */
export function makeClaim(id: string, overrides: Partial<Claim> = {}): Claim {
  return {
    id,
    defensibility: 'confident',
    ...overrides,
  };
}

/** Builds a variant; `projectIds` is the field most tests vary. */
export function makeVariant(id: string, overrides: Partial<Variant> = {}): Variant {
  return {
    id,
    label: 'Data Engineer',
    summary: 'Data engineer focused on reliable pipelines.',
    coursework: 'Distributed Systems, Data Mining',
    skills: [
      { label: 'Languages', body: 'TypeScript, Python, SQL' },
      { label: 'Infrastructure', body: 'Postgres, Airflow' },
    ],
    projectIds: ['etl', 'ranker'],
    ...overrides,
  };
}

/** Builds the raw collections behind a library. */
export function makeLibraryData(overrides: Partial<ContentLibraryData> = {}): ContentLibraryData {
  return {
    header: makeHeader(),
    education: makeEducation(),
    jobs: [makeJob()],
    projects: [makeProject('etl'), makeProject('ranker')],
    leadership: [makeJob({ title: 'Teaching Assistant', org: 'CS Department' })],
    awards: { label: 'Awards', entries: ["Dean's List", 'Hackathon Winner'] },
    claims: [makeClaim('etl'), makeClaim('ranker')],
    variants: [makeVariant('data-engineer')],
    ...overrides,
  };
}

/**
 * Builds a library, throwing on invalid fixture data.
 *
 * Throwing is correct here: a fixture with duplicate IDs is a bug in the test,
 * not an expected domain outcome. Tests that assert on duplicate rejection
 * call `ContentLibrary.create` directly.
 */
export function makeLibrary(overrides: Partial<ContentLibraryData> = {}): ContentLibrary {
  const library = ContentLibrary.create(makeLibraryData(overrides));
  if (!library.ok) {
    throw new Error(`invalid fixture: ${library.error.map((e) => e.message).join('; ')}`);
  }
  return library.value;
}
