import { describe, expect, it } from 'vitest';

import { Application } from '../../src/app/Application.js';
import { UnknownVariantError } from '../../src/domain/index.js';
import { DEFAULT_THEME } from '../../src/render/theme/Theme.js';
import { makeClaim, makeProject, makeVariant } from '../domain/fixtures.js';
import {
  FakeArtifactWriter,
  FakeContentRepository,
  RecordingProgressListener,
  joinPath,
} from './fakes.js';

const WORKSPACE = { root: '/ws', distDir: '/ws/dist', archiveDir: '/ws/.vitae/archive' };

/** Assembles an application over fakes, as the composition root would. */
function makeApplication(
  repository: FakeContentRepository,
  extras: { progress?: RecordingProgressListener } = {},
): { app: Application; writer: FakeArtifactWriter } {
  const writer = new FakeArtifactWriter();
  const app = new Application({
    workspace: WORKSPACE,
    repository,
    writer,
    theme: DEFAULT_THEME,
    joinPath,
    ...(extras.progress === undefined ? {} : { progress: extras.progress }),
  });

  return { app, writer };
}

describe('Application.buildAll', () => {
  it('builds every variant and records the workspace root', async () => {
    const repository = FakeContentRepository.withContent({
      variants: [makeVariant('a'), makeVariant('b')],
    });
    const { app, writer } = makeApplication(repository);

    const result = await app.buildAll({ format: 'txt' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workspaceRoot).toBe('/ws');
    expect(result.value.variants.map((v) => v.variantId)).toEqual(['a', 'b']);
    expect(writer.writes).toHaveLength(2);
  });

  it('continues past a broken variant so the others still report', async () => {
    const repository = FakeContentRepository.withContent({
      variants: [
        makeVariant('good-one'),
        makeVariant('broken', { projectIds: ['ghost'] }),
        makeVariant('good-two'),
      ],
    });
    const { app } = makeApplication(repository);

    const result = await app.buildAll({ format: 'txt' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const statuses = Object.fromEntries(
      result.value.variants.map((v) => [v.variantId, v.status]),
    );
    // One broken variant must not hide the status of the others.
    expect(statuses).toEqual({ 'good-one': 'written', broken: 'failed', 'good-two': 'written' });
  });

  it('loads content exactly once across a full build', async () => {
    const repository = FakeContentRepository.withContent({
      variants: [makeVariant('a'), makeVariant('b'), makeVariant('c')],
    });
    const { app } = makeApplication(repository);

    await app.buildAll({ format: 'txt' });
    await app.list();
    await app.check();

    expect(repository.loadCount).toBe(1);
  });

  it('does not load twice when two calls race', async () => {
    const repository = FakeContentRepository.withContent();
    const { app } = makeApplication(repository);

    await Promise.all([app.list(), app.check(), app.buildAll({ format: 'txt' })]);

    expect(repository.loadCount).toBe(1);
  });

  it('emits progress events for each variant', async () => {
    const progress = new RecordingProgressListener();
    const repository = FakeContentRepository.withContent({
      variants: [makeVariant('a'), makeVariant('b')],
    });
    const { app } = makeApplication(repository, { progress });

    await app.buildAll({ format: 'txt' });

    expect(progress.started).toEqual(['a', 'b']);
    expect(progress.finished.map((r) => r.status)).toEqual(['written', 'written']);
  });

  it('reports a load failure without attempting any build', async () => {
    const repository = FakeContentRepository.failing([new UnknownVariantError('x')]);
    const { app, writer } = makeApplication(repository);

    const result = await app.buildAll({ format: 'txt' });

    expect(result.ok).toBe(false);
    expect(writer.writes).toHaveLength(0);
  });
});

describe('Application.check', () => {
  it('validates every variant and writes nothing', async () => {
    const repository = FakeContentRepository.withContent({
      claims: [makeClaim('etl', { defensibility: 'cannot-defend' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });
    const { app, writer } = makeApplication(repository);

    const result = await app.check();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variants[0]?.passed).toBe(false);
    expect(writer.writes).toHaveLength(0);
  });

  it('passes a variant whose claims are all confident', async () => {
    const repository = FakeContentRepository.withContent({ variants: [makeVariant('v')] });
    const { app } = makeApplication(repository);

    const result = await app.check({ variantId: 'v' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variants).toHaveLength(1);
    expect(result.value.variants[0]?.passed).toBe(true);
  });

  it('reports an unknown variant rather than silently checking nothing', async () => {
    const repository = FakeContentRepository.withContent();
    const { app } = makeApplication(repository);

    const result = await app.check({ variantId: 'ghost' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variants[0]?.passed).toBe(false);
    expect(result.value.variants[0]?.diagnostics[0]?.code).toBe('UNKNOWN_VARIANT');
  });

  it('leaves the page-count seam unset until a later layer fills it', async () => {
    const { app } = makeApplication(FakeContentRepository.withContent());

    const result = await app.check();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pageCounts).toBeUndefined();
  });
});

describe('Application.list', () => {
  it('summarizes projects by name and claims by tier', async () => {
    const repository = FakeContentRepository.withContent({
      projects: [makeProject('etl', { name: 'MLS ETL' }), makeProject('ranker', { name: 'Ranker' })],
      claims: [makeClaim('etl', { defensibility: 'needs-review' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });
    const { app } = makeApplication(repository);

    const result = await app.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = result.value.variants[0];
    // Names, not IDs, so the CLI can print a row without further lookups.
    expect(summary?.projectNames).toEqual(['MLS ETL', 'Ranker']);
    expect(summary?.claimTiers).toEqual({
      confident: 1,
      'needs-review': 1,
      'cannot-defend': 0,
    });
  });

  it('reports unresolvable projects instead of omitting them silently', async () => {
    const repository = FakeContentRepository.withContent({
      variants: [makeVariant('v', { projectIds: ['etl', 'ghost'] })],
    });
    const { app } = makeApplication(repository);

    const result = await app.list();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variants[0]?.diagnostics.length).toBeGreaterThan(0);
  });
});
