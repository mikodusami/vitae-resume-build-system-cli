/**
 * Built-in sample content.
 *
 * Stands in for a user's `.vitae/` folder until Layer 2 can load one from
 * disk, so `vitae demo` has something real to compose. When the loader lands,
 * this becomes the seed for `vitae init` templates rather than being deleted.
 */

import type { ContentLibraryData } from '../domain/index.js';

/** A complete one-variant resume that composes successfully on first run. */
export const SAMPLE_CONTENT: ContentLibraryData = {
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
    {
      id: 'etl',
      defensibility: 'needs-review',
      reviewNotes: [
        'Read the ETL entrypoint end to end; sketch sources to outputs',
        'Know one concrete data-quality check and one failure it catches',
      ],
    },
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
