import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { FileContentRepository } from '../../src/infra/content/FileContentRepository.js';
import { INFRA_ERROR_CODES } from '../../src/infra/errors.js';
import { FakeModuleLoader } from '../../src/infra/loader/FakeModuleLoader.js';
import { JitiModuleLoader } from '../../src/infra/loader/JitiModuleLoader.js';
import { Workspace } from '../../src/infra/workspace/Workspace.js';
import {
  cleanupFakeWorkspaces,
  makeFakeWorkspace,
  registerValidWorkspace,
  removeWorkspaceFile,
} from './fixtures.js';

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'workspace');

afterAll(() => {
  cleanupFakeWorkspaces();
});

/** The committed fixture workspace, loaded exactly as a user's would be. */
function realFixtureRepository(): FileContentRepository {
  const resolved = Workspace.resolve({ cwd: FIXTURE_ROOT, env: {} });
  if (!resolved.ok) throw new Error(resolved.error.message);
  return new FileContentRepository(resolved.value, new JitiModuleLoader(resolved.value.root));
}

describe('FileContentRepository against a real workspace', () => {
  it('loads a complete workspace into a ContentLibrary', async () => {
    const loaded = await realFixtureRepository().load();

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const library = loaded.value;

    expect(library.header.name).toBe('Ada Lovelace');
    expect(library.education.institution).toBe('Analytical University');
    expect(library.jobs).toHaveLength(1);
    expect(library.leadership[0]?.title).toBe('Teaching Assistant');
    expect(library.awards.entries).toContain('Hackathon Winner');
    expect(library.listProjects().map((p) => p.id)).toEqual(['etl', 'ranker']);
  });

  it('discovers variants by convention — a file in variants/ is a variant', async () => {
    const loaded = await realFixtureRepository().load();

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.listVariants().map((v) => v.id)).toEqual([
      'data-engineer',
      'software-engineer',
    ]);
  });

  it('produces content the domain can compose without re-checking', async () => {
    const loaded = await realFixtureRepository().load();
    if (!loaded.ok) throw new Error('expected the fixture workspace to load');

    const variant = loaded.value.getVariant('data-engineer');
    expect(variant.ok).toBe(true);
    if (!variant.ok) return;
    expect(variant.value.projectIds).toEqual(['etl', 'ranker']);
  });
});

describe('FileContentRepository failure reporting', () => {
  it('reports a missing required content file by its expected path', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    removeWorkspaceFile(join(workspace.contentDir, 'projects.ts'));

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.code).toBe(INFRA_ERROR_CODES.missingContentFile);
    expect(loaded.error[0]?.message).toContain(join('content', 'projects.ts'));
  });

  it('names the file and field when a variant field has the wrong type', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.set(join(workspace.variantsDir, 'data-engineer.ts'), {
      id: 'data-engineer',
      label: 42,
      summary: 'ok',
      coursework: '',
      skills: [{ label: 'Languages', body: 'TypeScript' }],
      projectIds: ['etl'],
    });

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    const [diagnostic] = loaded.error;
    expect(diagnostic?.code).toBe(INFRA_ERROR_CODES.schemaValidation);
    expect(diagnostic?.message).toContain('data-engineer.ts');
    expect(diagnostic?.message).toContain('label');
    expect(diagnostic?.message).toContain('expected string, received number');
  });

  it('reports a nested field path the way a user would write it', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.set(join(workspace.variantsDir, 'data-engineer.ts'), {
      id: 'data-engineer',
      label: 'Data Engineer',
      summary: 'ok',
      coursework: '',
      skills: [
        { label: 'Languages', body: 'TypeScript' },
        { label: 'Infra', body: 'Postgres' },
        { label: 7, body: 'Airflow' },
      ],
      projectIds: ['etl'],
    });

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.message).toContain('skills[2].label');
  });

  it('aggregates diagnostics across two bad files rather than stopping at the first', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.set(join(workspace.contentDir, 'header.ts'), { name: '', contact: [] });
    loader.set(join(workspace.variantsDir, 'data-engineer.ts'), { id: 'data-engineer' });

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    const files = loaded.error.map((e) => e.message);
    expect(files.some((m) => m.includes('header.ts'))).toBe(true);
    expect(files.some((m) => m.includes('data-engineer.ts'))).toBe(true);
  });

  it('rejects unknown keys instead of silently dropping them', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.set(join(workspace.contentDir, 'header.ts'), {
      name: 'Ada Lovelace',
      contact: ['ada@example.com'],
      bullet: 'a typo that would otherwise vanish',
    });

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.message).toContain('bullet');
  });

  it('reports a variant whose declared id disagrees with its filename', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.set(join(workspace.variantsDir, 'data-engineer.ts'), {
      id: 'data-engineerr',
      label: 'Data Engineer',
      summary: 'ok',
      coursework: '',
      skills: [],
      projectIds: ['etl'],
    });

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.code).toBe(INFRA_ERROR_CODES.variantIdMismatch);
    expect(loaded.error[0]?.message).toContain('data-engineerr');
  });

  it('surfaces duplicate ids from ContentLibrary as load diagnostics', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.set(join(workspace.contentDir, 'projects.ts'), [
      {
        id: 'etl',
        claimId: 'etl',
        name: 'One',
        tech: '',
        link: '',
        bullets: ['a'],
      },
      {
        id: 'etl',
        claimId: 'etl',
        name: 'Two',
        tech: '',
        link: '',
        bullets: ['b'],
      },
    ]);

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.code).toBe('DUPLICATE_ID');
  });

  it('turns a throwing user module into a ModuleLoadError naming the file', async () => {
    const { workspace, loader } = makeFakeWorkspace();
    registerValidWorkspace(loader, workspace);
    loader.setFailure(
      join(workspace.contentDir, 'claims.ts'),
      "Unexpected token ')' at line 12",
    );

    const loaded = await new FileContentRepository(workspace, loader).load();

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    const diagnostic = loaded.error[0];
    expect(diagnostic?.code).toBe(INFRA_ERROR_CODES.moduleLoad);
    expect(diagnostic?.message).toContain('claims.ts');
    expect(diagnostic?.message).toContain('Unexpected token');
    expect(diagnostic?.message).not.toContain('at Object.<anonymous>');
  });

  it('never rejects — a broken workspace resolves to diagnostics', async () => {
    const { workspace, loader } = makeFakeWorkspace();

    await expect(new FileContentRepository(workspace, loader).load()).resolves.toBeDefined();
  });
});

describe('FakeModuleLoader', () => {
  it('reports a registered failure without throwing', async () => {
    const loader = new FakeModuleLoader().setFailure('/x/broken.ts', 'boom');

    const loaded = await loader.load('/x/broken.ts');

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.filePath).toBe('/x/broken.ts');
    expect(loaded.error.message).toContain('boom');
  });
});
