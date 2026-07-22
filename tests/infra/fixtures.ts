/**
 * Loading-layer test fixtures.
 *
 * `FileContentRepository` deliberately talks to `fs` directly (only module
 * execution is behind a port), so these helpers build a real temp directory of
 * placeholder files and let `FakeModuleLoader` decide what each one "exports".
 * That combination exercises the real discovery logic while keeping the
 * content of each file trivially controllable from a test.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeModuleLoader } from '../../src/infra/loader/FakeModuleLoader.js';

/** The subset of `Workspace` that the repository actually consumes. */
export interface FakeWorkspace {
  readonly root: string;
  readonly contentDir: string;
  readonly variantsDir: string;
}

/** Required content file base names, mirroring the repository's expectations. */
export const CONTENT_FILE_NAMES = [
  'header',
  'education',
  'work',
  'projects',
  'leadership',
  'claims',
] as const;

/** Temp directories created by this module, removed by {@link cleanupFakeWorkspaces}. */
const createdRoots: string[] = [];

/**
 * Creates a temp workspace whose files exist but whose contents come from the
 * returned loader.
 *
 * @returns the workspace paths and the loader to register module values on
 */
export function makeFakeWorkspace(): { workspace: FakeWorkspace; loader: FakeModuleLoader } {
  const root = mkdtempSync(join(tmpdir(), 'vitae-fake-ws-'));
  createdRoots.push(root);

  const contentDir = join(root, 'content');
  const variantsDir = join(root, 'variants');
  mkdirSync(contentDir);
  mkdirSync(variantsDir);

  for (const name of CONTENT_FILE_NAMES) {
    writeFileSync(join(contentDir, `${name}.ts`), '// placeholder\n');
  }
  writeFileSync(join(variantsDir, 'data-engineer.ts'), '// placeholder\n');

  return { workspace: { root, contentDir, variantsDir }, loader: new FakeModuleLoader() };
}

/** Deletes one file from a fake workspace, to test the missing-file path. */
export function removeWorkspaceFile(path: string): void {
  rmSync(path, { force: true });
}

/** Removes every temp workspace created during the run. */
export function cleanupFakeWorkspaces(): void {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Registers a complete, valid set of module values.
 *
 * Tests then overwrite exactly the one file they intend to break, so what a
 * test is actually asserting stays obvious.
 */
export function registerValidWorkspace(loader: FakeModuleLoader, workspace: FakeWorkspace): void {
  loader.set(join(workspace.contentDir, 'header.ts'), {
    name: 'Ada Lovelace',
    contact: ['ada@example.com'],
  });
  loader.set(join(workspace.contentDir, 'education.ts'), {
    institution: 'Analytical University',
    location: 'Cambridge, MA',
    degree: 'B.S. Computer Science',
    date: 'May 2026',
    coursework: 'Algorithms',
  });
  loader.set(join(workspace.contentDir, 'work.ts'), [
    {
      id: 'research-assistant',
      title: 'Research Assistant',
      org: 'Analytical University',
      location: 'Remote',
      date: 'Jan 2025 - Present',
      bullets: ['Built an ingestion pipeline.'],
    },
  ]);
  loader.set(join(workspace.contentDir, 'projects.ts'), [
    {
      id: 'etl',
      claimId: 'etl',
      name: 'MLS ETL',
      tech: 'TypeScript',
      link: 'github.com/ada/mls-etl',
      bullets: ['Parsed 40 feed formats.'],
    },
  ]);
  loader.set(join(workspace.contentDir, 'leadership.ts'), {
    entries: [
      {
        id: 'teaching-assistant',
        title: 'Teaching Assistant',
        org: 'CS Department',
        location: 'On campus',
        date: 'Aug 2024 - Present',
        bullets: ['Ran weekly lab sections.'],
      },
    ],
    awards: { label: 'Awards', entries: ["Dean's List"] },
  });
  loader.set(join(workspace.contentDir, 'claims.ts'), [{ id: 'etl', defensibility: 'confident' }]);
  loader.set(join(workspace.variantsDir, 'data-engineer.ts'), {
    id: 'data-engineer',
    label: 'Data Engineer',
    summary: 'Data engineer focused on reliable pipelines.',
    coursework: '',
    skills: [{ label: 'Languages', body: 'TypeScript' }],
    projectIds: ['etl'],
  });
}
