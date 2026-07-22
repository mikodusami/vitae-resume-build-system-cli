import { describe, expect, it } from 'vitest';

import { ClaimsPolicy, ClaimsResolver, ResumeComposer } from '../../src/domain/index.js';
import { DefaultNaming } from '../../src/app/naming/ArtifactNaming.js';
import { RendererFactory } from '../../src/app/render/RendererFactory.js';
import { BuildVariantUseCase } from '../../src/app/usecases/BuildVariantUseCase.js';
import { DEFAULT_THEME } from '../../src/render/theme/Theme.js';
import { makeClaim, makeLibrary, makeVariant } from '../domain/fixtures.js';
import { FakeArtifactWriter, joinPath } from './fakes.js';

const DIST = '/ws/dist';

/** Builds the use case with fakes, overriding only what a test cares about. */
function makeUseCase(writer: FakeArtifactWriter = new FakeArtifactWriter()): {
  useCase: BuildVariantUseCase;
  writer: FakeArtifactWriter;
} {
  const useCase = new BuildVariantUseCase({
    writer,
    rendererFactory: new RendererFactory(DEFAULT_THEME),
    naming: new DefaultNaming(),
    claimsPolicy: new ClaimsPolicy(),
    composer: new ResumeComposer(),
    claimsResolver: new ClaimsResolver(),
    joinPath,
  });

  return { useCase, writer };
}

describe('BuildVariantUseCase happy path', () => {
  it('writes to the expected path with the expected filename', async () => {
    const { useCase, writer } = makeUseCase();
    const library = makeLibrary({ variants: [makeVariant('data-engineer')] });

    const report = await useCase.execute(library, DIST, {
      variantId: 'data-engineer',
      format: 'txt',
    });

    expect(report.status).toBe('written');
    expect(report.outputPath).toBe('/ws/dist/resume_data_engineer.txt');
    expect(report.byteLength).toBeGreaterThan(0);
    expect(writer.writes).toHaveLength(1);
    expect(writer.ensuredDirs).toContain(DIST);
  });

  it('honours an output directory override', async () => {
    const { useCase } = makeUseCase();
    const library = makeLibrary({ variants: [makeVariant('v')] });

    const report = await useCase.execute(library, DIST, {
      variantId: 'v',
      format: 'txt',
      outputDir: '/tmp/elsewhere',
    });

    expect(report.outputPath).toBe('/tmp/elsewhere/resume_v.txt');
  });

  it('produces a real docx buffer when asked for one', async () => {
    const { useCase, writer } = makeUseCase();
    const library = makeLibrary({ variants: [makeVariant('v')] });

    const report = await useCase.execute(library, DIST, { variantId: 'v', format: 'docx' });

    expect(report.status).toBe('written');
    expect(report.outputPath?.endsWith('.docx')).toBe(true);
    // A .docx is a zip; anything much smaller than this is not one.
    expect(writer.writes[0]?.byteLength).toBeGreaterThan(1000);
  });
});

describe('BuildVariantUseCase enforcement policy', () => {
  it('blocks and writes nothing when a claim cannot be defended', async () => {
    const { useCase, writer } = makeUseCase();
    const library = makeLibrary({
      claims: [makeClaim('etl', { defensibility: 'cannot-defend' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });

    const report = await useCase.execute(library, DIST, { variantId: 'v', format: 'txt' });

    // Blocked, not failed: everything worked, policy refused.
    expect(report.status).toBe('blocked');
    expect(writer.writes).toHaveLength(0);
    expect(report.outputPath).toBeUndefined();
    expect(report.diagnostics[0]?.claimId).toBe('etl');
    expect(report.diagnostics[0]?.code).toBe('CLAIM_CANNOT_DEFEND');
  });

  it('writes the same input when forced', async () => {
    const { useCase, writer } = makeUseCase();
    const library = makeLibrary({
      claims: [makeClaim('etl', { defensibility: 'cannot-defend' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });

    const report = await useCase.execute(library, DIST, {
      variantId: 'v',
      format: 'txt',
      force: true,
    });

    expect(report.status).toBe('written');
    expect(writer.writes).toHaveLength(1);
    // The diagnostic survives the override — forcing silences the gate, not
    // the warning.
    expect(report.diagnostics[0]?.severity).toBe('error');
  });

  it('writes despite a needs-review claim, and reports the warning', async () => {
    const { useCase, writer } = makeUseCase();
    const library = makeLibrary({
      claims: [makeClaim('etl', { defensibility: 'needs-review' }), makeClaim('ranker')],
      variants: [makeVariant('v')],
    });

    const report = await useCase.execute(library, DIST, { variantId: 'v', format: 'txt' });

    // You must be able to build a resume for a project you haven't reviewed
    // yet — you just need to be told.
    expect(report.status).toBe('written');
    expect(writer.writes).toHaveLength(1);
    expect(report.diagnostics[0]?.severity).toBe('warning');
  });
});

describe('BuildVariantUseCase failures', () => {
  it('fails on an unknown variant', async () => {
    const { useCase, writer } = makeUseCase();

    const report = await useCase.execute(makeLibrary(), DIST, {
      variantId: 'ghost',
      format: 'txt',
    });

    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('UNKNOWN_VARIANT');
    expect(writer.writes).toHaveLength(0);
  });

  it('reports every unresolvable project id, not just the first', async () => {
    const { useCase } = makeUseCase();
    const library = makeLibrary({
      variants: [makeVariant('v', { projectIds: ['ghost', 'etl', 'phantom'] })],
    });

    const report = await useCase.execute(library, DIST, { variantId: 'v', format: 'txt' });

    expect(report.status).toBe('failed');
    expect(report.diagnostics).toHaveLength(2);
  });

  it('surfaces a writer failure as failed, naming the path', async () => {
    const writer = new FakeArtifactWriter().failWritesTo('/ws/dist/resume_v.txt');
    const { useCase } = makeUseCase(writer);
    const library = makeLibrary({ variants: [makeVariant('v')] });

    const report = await useCase.execute(library, DIST, { variantId: 'v', format: 'txt' });

    expect(report.status).toBe('failed');
    expect(report.diagnostics.at(-1)?.code).toBe('IO_FAILED');
    expect(report.diagnostics.at(-1)?.message).toContain('/ws/dist/resume_v.txt');
  });

  it('surfaces a directory failure without attempting the write', async () => {
    const writer = new FakeArtifactWriter().failEnsureDir();
    const { useCase } = makeUseCase(writer);
    const library = makeLibrary({ variants: [makeVariant('v')] });

    const report = await useCase.execute(library, DIST, { variantId: 'v', format: 'txt' });

    expect(report.status).toBe('failed');
    expect(writer.writes).toHaveLength(0);
  });

  it('never rejects — expected failures come back as reports', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute(makeLibrary(), DIST, { variantId: 'ghost', format: 'txt' }),
    ).resolves.toBeDefined();
  });
});
