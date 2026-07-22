/**
 * Scaffold templates for `vitae init`.
 *
 * Held as string constants rather than as files on disk so packaging stays
 * trivial: `tsc` emits this module and the templates ship with it, with no
 * build step that copies a directory and no runtime path resolution that
 * breaks under `npm link`.
 *
 * The content is a plausible complete resume, not empty stubs — the fastest
 * way to learn the schema is to read one filled in. It is curated rather than
 * copied from the test fixture, because a fixture optimized for edge cases
 * makes a poor first impression.
 */

/** One scaffolded file: path relative to `.vitae/`, plus its contents. */
export interface TemplateFile {
  readonly path: string;
  readonly contents: string;
}

const CONFIG_JSON = `{
  "owner": "Jordan Rivera",
  "defaultVariant": "software-engineer",
  "output": { "filenamePrefix": "resume" }
}
`;

const THEME_TS = `/**
 * Presentation lives here. Everything you leave out uses vitae's defaults, so
 * this file only ever states what you actually want changed.
 *
 * Units: lengths are DXA (1440 = 1 inch); \`sizes\` are half-points (19 = 9.5pt).
 */
export default {
  font: 'Calibri',
  sizes: {
    name: 30,
    sectionHeading: 20,
    body: 19,
    meta: 18,
  },
};
`;

const HEADER_TS = `/** Your name and the contact line under it. */
export default {
  name: 'Jordan Rivera',
  contact: [
    'jordan.rivera@example.com',
    '(555) 010-4477',
    'github.com/jrivera',
    'linkedin.com/in/jrivera',
  ],
};
`;

const EDUCATION_TS = `/**
 * Your degree. \`coursework\` here is the default; a variant may override it
 * with a more relevant list. \`gpa\` is optional — delete the line entirely
 * if you'd rather not show one.
 */
export default {
  institution: 'State University',
  location: 'Blacksburg, VA',
  degree: 'B.S. Computer Science',
  date: 'May 2026',
  gpa: { label: 'Major GPA', value: '3.32' },
  coursework: 'Data Structures, Algorithms, Databases, Operating Systems',
};
`;

const WORK_TS = `/**
 * Work history, shared across every variant by default.
 *
 * A variant's optional \`jobIds\` selects and orders a subset — omit it to show
 * every job here, in this file's order.
 *
 * Bullets lead with what changed and carry a number wherever one exists — a
 * reader remembers "cut p95 from 800ms to 210ms", never "improved performance".
 */
export default [
  {
    id: 'swe-intern',
    title: 'Software Engineering Intern',
    org: 'Northwind Logistics',
    location: 'Chicago, IL',
    date: 'Jun 2025 - Aug 2025',
    bullets: [
      'Rewrote the shipment-status endpoint, cutting p95 latency from 800ms to 210ms.',
      'Added contract tests across 6 service boundaries, catching 3 breaking changes before release.',
      'Migrated a nightly cron to an idempotent job, ending a recurring duplicate-invoice bug.',
    ],
  },
  {
    id: 'research-assistant',
    title: 'Undergraduate Research Assistant',
    org: 'State University Systems Lab',
    location: 'Remote',
    date: 'Jan 2025 - Present',
    bullets: [
      'Built an ingestion pipeline processing 2M sensor rows nightly with schema validation at the boundary.',
      'Reduced a weekly analysis from 40 minutes to 90 seconds by replacing per-row queries with a single aggregate.',
    ],
  },
];
`;

const PROJECTS_TS = `/**
 * Every project you might put on a resume.
 *
 * Variants reference these by \`id\`, so a project can appear on several
 * resumes without the text being duplicated. Two entries may share a
 * \`claimId\` when they are alternate framings of the same underlying work —
 * the claims registry then treats them as one thing you have to defend.
 */
export default [
  {
    id: 'ledger',
    claimId: 'ledger',
    name: 'Ledger',
    tech: 'TypeScript, Postgres, Docker',
    link: 'github.com/jrivera/ledger',
    bullets: [
      'Double-entry accounting service with an append-only journal and derived balances.',
      'Property tests assert the invariant that every transaction sums to zero across 10k generated cases.',
    ],
  },
  {
    id: 'tempo',
    claimId: 'tempo',
    name: 'Tempo',
    tech: 'Python, FastAPI, Redis',
    link: 'github.com/jrivera/tempo',
    bullets: [
      'Job scheduler with at-least-once delivery and exponential backoff, running 40k jobs/day.',
      'Cut queue latency from 6s to 400ms by batching Redis round-trips.',
    ],
  },
  {
    id: 'atlas',
    claimId: 'atlas',
    name: 'Atlas',
    tech: 'Go, SQLite, WebAssembly',
    link: 'github.com/jrivera/atlas',
    bullets: [
      'Offline-first map annotation tool syncing through a conflict-free merge log.',
      'Ships as a 2MB WASM bundle that loads in under a second on a cold cache.',
    ],
  },
  {
    id: 'sift',
    claimId: 'sift',
    name: 'Sift',
    tech: 'Rust, tokio',
    link: 'github.com/jrivera/sift',
    bullets: [
      'Streaming log filter sustaining 1.2GB/s on a laptop by avoiding per-line allocation.',
      'Fuzzed against 500k malformed inputs with no panics.',
    ],
  },
];
`;

const LEADERSHIP_TS = `/**
 * Leadership entries have the same shape as jobs, plus the awards line that
 * closes the resume.
 */
export default {
  entries: [
    {
      id: 'teaching-assistant',
      title: 'Teaching Assistant, Data Structures',
      org: 'State University',
      location: 'On campus',
      date: 'Aug 2024 - Present',
      bullets: [
        'Ran weekly lab sections for 60 students and held office hours for a 300-person course.',
        'Wrote 12 autograded exercises now used across all sections.',
      ],
    },
  ],
  awards: {
    label: 'Awards',
    entries: ["Dean's List (4 semesters)", 'University Hackathon — 1st place, 2025'],
  },
};
`;

const CLAIMS_TS = `/**
 * The defensibility registry — the part of vitae that has no equivalent in
 * other resume tools, and the reason it exists.
 *
 * Every project carries a tier saying how well you could defend it in an
 * interview *today*:
 *
 *   confident      you can explain every line of it under questioning
 *   needs-review   it is real, but you would need to reread it first — builds,
 *                  but warns, and \`vitae prep\` turns reviewNotes into a checklist
 *   cannot-defend  \`vitae build\` refuses to write a resume containing it
 *
 * That last tier is the point: it makes shipping a resume you cannot back up
 * structurally impossible rather than merely unwise. When you have actually
 * reviewed something, flipping it to \`confident\` is a one-line commit — and a
 * dated record of when it became interview-safe.
 */
export default [
  { id: 'ledger', defensibility: 'confident' },
  {
    id: 'tempo',
    defensibility: 'needs-review',
    reviewNotes: [
      'Reread the retry path end to end; be able to sketch what happens when a worker dies mid-job',
      'Know why at-least-once was the right trade here, and what at-most-once would have cost',
      'Prepare one honest "what I would do differently" answer',
    ],
  },
  { id: 'atlas', defensibility: 'confident' },
  {
    id: 'sift',
    defensibility: 'needs-review',
    reviewNotes: [
      'Re-run the benchmark yourself and be ready to say how it was measured',
      'Be able to explain the allocation-free parse loop without notes',
    ],
  },
];
`;

const VARIANT_SOFTWARE_ENGINEER = `/**
 * A variant selects and orders content. It holds project *ids*, never project
 * text, so editing a bullet updates every resume that shows it.
 *
 * The filename is the variant's id — adding a resume means dropping a file in
 * this folder. There is no registry to update.
 */
export default {
  id: 'software-engineer',
  label: 'Software Engineer',
  summary:
    'Software engineer who ships production services and keeps them boring — strong testing habits, comfortable owning a system end to end.',
  coursework: 'Data Structures, Algorithms, Operating Systems, Databases',
  skills: [
    { label: 'Languages', body: 'TypeScript, Python, Go, SQL' },
    { label: 'Infrastructure', body: 'Postgres, Redis, Docker, GitHub Actions' },
    { label: 'Practices', body: 'Testing, code review, incident write-ups' },
  ],
  projectIds: ['ledger', 'tempo', 'atlas'],
};
`;

const VARIANT_DATA_ENGINEER = `export default {
  id: 'data-engineer',
  label: 'Data Engineer',
  summary:
    'Data engineer focused on pipelines that fail loudly and recover cleanly, with validation at every boundary.',
  coursework: 'Databases, Distributed Systems, Data Mining, Algorithms',
  skills: [
    { label: 'Languages', body: 'Python, SQL, TypeScript' },
    { label: 'Data', body: 'Postgres, Airflow, dbt, Parquet' },
    { label: 'Practices', body: 'Schema validation, idempotent jobs, data-quality checks' },
  ],
  projectIds: ['tempo', 'ledger', 'sift'],
};
`;

const VARIANT_BACKEND = `export default {
  id: 'backend',
  label: 'Backend Engineer',
  summary:
    'Backend engineer who likes correctness problems: transactional integrity, retry semantics, and APIs that are hard to misuse.',
  coursework: 'Operating Systems, Databases, Distributed Systems',
  skills: [
    { label: 'Languages', body: 'Go, TypeScript, Rust, SQL' },
    { label: 'Infrastructure', body: 'Postgres, Redis, Docker, Kubernetes' },
    { label: 'Practices', body: 'Property testing, load testing, observability' },
  ],
  projectIds: ['ledger', 'sift', 'tempo'],
};
`;

const VARIANT_SYSTEMS = `export default {
  id: 'systems',
  label: 'Systems Engineer',
  summary:
    'Systems-leaning engineer comfortable close to the metal — profiling, allocation behaviour, and getting throughput out of one machine.',
  coursework: 'Operating Systems, Computer Architecture, Compilers',
  skills: [
    { label: 'Languages', body: 'Rust, Go, C, TypeScript' },
    { label: 'Tools', body: 'perf, flamegraphs, WebAssembly, SQLite' },
    { label: 'Practices', body: 'Benchmarking, fuzzing, profiling' },
  ],
  projectIds: ['sift', 'atlas', 'ledger'],
};
`;

const GITIGNORE = `# Latest builds are disposable — rebuild them any time.
dist/
`;

const README_MD = `# Your vitae workspace

This folder is yours. It is plain TypeScript, so \`git diff\` shows exactly
which bullet changed between two versions of your resume — the thing a binary
\`.docx\` can never tell you. Consider running \`git init\` here.

## Layout

    config.json      your name, default variant, filename prefix
    theme.ts         fonts, sizes, spacing — everything presentational
    content/         the shared library every variant draws from
      header.ts        name + contact line
      education.ts     institution, location, degree, date, GPA, coursework
      work.ts          job history, referenced by id from a variant's jobIds
      projects.ts      every project, referenced by id
      leadership.ts    leadership entries + the awards line
      claims.ts        the defensibility registry (read this one)
    variants/        one file per resume; the filename is its id
    dist/            latest builds (gitignored)

## Commands

    vitae list             what is on each resume, and whether you can defend it
    vitae build --all      write every variant to dist/
    vitae build <variant>  write one
    vitae check            validate without writing anything
    vitae prep <variant>   interview checklist for that resume's claims
    vitae where            which workspace resolved

Add \`--format txt\` for an ATS-safe plain-text version, and \`--json\` to any
command for machine-readable output.

## Adding a resume

Drop a file in \`variants/\`. The filename is the id, and it must match the
\`id\` field inside. Variants hold project *ids*, never project text, so one
project can appear on several resumes and editing a bullet updates all of them.

## The claims registry

\`content/claims.ts\` records how well you could defend each project in an
interview today. A \`cannot-defend\` claim makes \`vitae build\` refuse to write
that resume; \`needs-review\` builds but warns, and \`vitae prep\` turns its
\`reviewNotes\` into a checklist for exactly the resume you are about to send.

That is the whole idea: it should be structurally impossible to ship a resume
you cannot back up.
`;

/** Every file `vitae init` writes, relative to the `.vitae/` directory. */
export const TEMPLATE_FILES: readonly TemplateFile[] = [
  { path: 'config.json', contents: CONFIG_JSON },
  { path: 'theme.ts', contents: THEME_TS },
  { path: 'README.md', contents: README_MD },
  { path: '.gitignore', contents: GITIGNORE },
  { path: 'content/header.ts', contents: HEADER_TS },
  { path: 'content/education.ts', contents: EDUCATION_TS },
  { path: 'content/work.ts', contents: WORK_TS },
  { path: 'content/projects.ts', contents: PROJECTS_TS },
  { path: 'content/leadership.ts', contents: LEADERSHIP_TS },
  { path: 'content/claims.ts', contents: CLAIMS_TS },
  { path: 'variants/software-engineer.ts', contents: VARIANT_SOFTWARE_ENGINEER },
  { path: 'variants/data-engineer.ts', contents: VARIANT_DATA_ENGINEER },
  { path: 'variants/backend.ts', contents: VARIANT_BACKEND },
  { path: 'variants/systems.ts', contents: VARIANT_SYSTEMS },
];
