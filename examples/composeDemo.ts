/**
 * Runnable demo of the Layer 1 domain core.
 *
 * There is no CLI yet — this script is how you exercise the domain by hand:
 *
 * ```
 * npx vite-node examples/composeDemo.ts
 * ```
 *
 * It builds an in-memory library, composes a variant into the document IR,
 * prints the resulting structure, then deliberately triggers the two failure
 * paths (unknown project IDs and an undefendable claim).
 */

import {
  ClaimsPolicy,
  ClaimsResolver,
  ContentLibrary,
  ResumeComposer,
  type ContentLibraryData,
} from '../src/domain/index.js';

const data: ContentLibraryData = {
  header: {
    name: 'Ada Lovelace',
    contact: ['ada@example.com', '555-0100', 'github.com/ada'],
  },
  education: {
    institution: 'Analytical University',
    degree: 'B.S. Computer Science',
    date: 'May 2026',
    coursework: 'Algorithms, Databases',
  },
  jobs: [
    {
      title: 'Research Assistant',
      org: 'Analytical University',
      location: 'Remote',
      date: 'Jan 2025 - Present',
      bullets: ['Built an ingestion pipeline processing 2M rows nightly.'],
    },
  ],
  projects: [
    {
      id: 'etl',
      claimId: 'etl',
      name: 'MLS ETL',
      tech: 'TypeScript, Postgres',
      link: 'github.com/ada/mls-etl',
      bullets: ['Parsed 40 feed formats into one validated schema.'],
    },
    {
      id: 'ranker',
      claimId: 'ranker',
      name: 'Ranker',
      tech: 'Python, FAISS',
      link: 'github.com/ada/ranker',
      bullets: ['Cut retrieval latency from 400ms to 60ms.'],
    },
  ],
  leadership: [
    {
      title: 'Teaching Assistant',
      org: 'CS Department',
      location: 'On campus',
      date: 'Aug 2024 - Present',
      bullets: ['Ran weekly lab sections for 60 students.'],
    },
  ],
  awards: { label: 'Awards', entries: ["Dean's List", 'Hackathon Winner'] },
  claims: [
    { id: 'etl', defensibility: 'needs-review', reviewNotes: ['Reread the ETL entrypoint'] },
    { id: 'ranker', defensibility: 'confident' },
  ],
  variants: [
    {
      id: 'data-engineer',
      label: 'Data Engineer',
      summary: 'Data engineer focused on reliable pipelines.',
      coursework: 'Distributed Systems, Data Mining',
      skills: [
        { label: 'Languages', body: 'TypeScript, Python, SQL' },
        { label: 'Infrastructure', body: 'Postgres, Airflow' },
      ],
      projectIds: ['etl', 'ranker'],
    },
  ],
};

const library = ContentLibrary.create(data);
if (!library.ok) {
  console.error('library rejected:', library.error.map((e) => e.message));
  process.exit(1);
}

const variant = library.value.getVariant('data-engineer');
if (!variant.ok) {
  console.error(variant.error.message);
  process.exit(1);
}

// --- Happy path: compose the document IR ------------------------------------
const composed = new ResumeComposer().compose(variant.value, library.value);
if (!composed.ok) {
  console.error('compose failed:', composed.error.map((e) => e.message));
  process.exit(1);
}

console.log('=== document meta ===');
console.log(composed.value.meta);
console.log('\n=== sections ===');
for (const section of composed.value.sections) {
  const kinds = section.blocks.map((block) => block.kind).join(', ');
  console.log(`${section.heading ?? '(header)'}: ${kinds}`);
}

// --- Claims: resolve, then evaluate against the policy ----------------------
const resolved = new ClaimsResolver().resolve(variant.value, library.value);
if (resolved.ok) {
  console.log('\n=== claims report (default policy) ===');
  console.log(new ClaimsPolicy().evaluate(resolved.value));

  console.log('\n=== claims report (strict policy: needs-review is an error) ===');
  const strict = new ClaimsPolicy({
    'cannot-defend': 'error',
    'needs-review': 'error',
    confident: 'none',
  });
  console.log(strict.evaluate(resolved.value));
}

// --- Failure path: unknown project IDs accumulate ---------------------------
const broken = { ...variant.value, projectIds: ['ghost', 'etl', 'phantom'] };
const failed = new ResumeComposer().compose(broken, library.value);
console.log('\n=== unknown project ids ===');
console.log(failed.ok ? 'unexpectedly succeeded' : failed.error.map((e) => `${e.code}: ${e.message}`));
