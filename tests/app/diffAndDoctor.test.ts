/**
 * `diff` and `doctor`, against a scripted process runner.
 *
 * No test here spawns a real git or LibreOffice.
 */

import { describe, expect, it } from 'vitest';

import { DiffUseCase, DoctorUseCase } from '../../src/app/index.js';
import { ContentLibrary } from '../../src/domain/index.js';
import { CapabilityRegistry } from '../../src/infra/capabilities/CapabilityRegistry.js';
import { GitCliProvider } from '../../src/infra/git/GitCliProvider.js';
import { FakeProcessRunner } from '../../src/infra/process/FakeProcessRunner.js';
import { makeLibraryData } from '../domain/fixtures.js';

/** The fixture library. */
function library(): ContentLibrary {
  const created = ContentLibrary.create(makeLibraryData());
  if (!created.ok) throw new Error('bad fixture');
  return created.value;
}

/** A runner that behaves like a working git repository. */
function gitRunner(): FakeProcessRunner {
  return new FakeProcessRunner()
    .withAvailable('git')
    .onRun('git', ['--version'], 'git version 2.50.1\n')
    .onRun('git', ['rev-parse', '--is-inside-work-tree'], 'true\n')
    .onRun('git', ['rev-parse', '--short', 'HEAD'], 'a1b2c3d\n')
    .onRun('git', ['status', '--porcelain'], '')
    .onRun('git', ['diff'], 'diff --git a/content/projects.ts b/content/projects.ts\n');
}

describe('DiffUseCase', () => {
  it('asks for exactly the files this variant depends on', async () => {
    const runner = gitRunner();
    const useCase = new DiffUseCase(new GitCliProvider(runner));

    await useCase.execute(library(), '/ws/.vitae', { variantId: 'data-engineer', ref: 'HEAD~1' });

    const diffCall = runner.calls.find((call) => call.args[0] === 'diff');
    expect(diffCall?.args).toEqual([
      'diff',
      'HEAD~1',
      '--',
      // The variant's own file, then the shared content it reads. Not the
      // other three resumes — narrowing this is why it is a use case.
      'variants/data-engineer.ts',
      'content/header.ts',
      'content/education.ts',
      'content/work.ts',
      'content/projects.ts',
      'content/leadership.ts',
      'content/claims.ts',
    ]);
    expect(diffCall?.cwd).toBe('/ws/.vitae');
  });

  it('returns the patch git produced', async () => {
    const useCase = new DiffUseCase(new GitCliProvider(gitRunner()));

    const report = await useCase.execute(library(), '/ws/.vitae', {
      variantId: 'data-engineer',
      ref: 'HEAD',
    });

    expect(report.patch).toContain('diff --git');
    expect(report.diagnostics).toHaveLength(0);
  });

  it('reports an unknown variant rather than diffing nothing', async () => {
    const useCase = new DiffUseCase(new GitCliProvider(gitRunner()));

    const report = await useCase.execute(library(), '/ws/.vitae', {
      variantId: 'nope',
      ref: 'HEAD',
    });

    expect(report.diagnostics[0]?.code).toBe('UNKNOWN_VARIANT');
  });

  it('explains what to do when the workspace is not a repository', async () => {
    const runner = new FakeProcessRunner().onRunFailure(
      'git',
      ['rev-parse'],
      'not a git repository',
    );
    const useCase = new DiffUseCase(new GitCliProvider(runner));

    const report = await useCase.execute(library(), '/ws/.vitae', {
      variantId: 'data-engineer',
      ref: 'HEAD',
    });

    expect(report.diagnostics[0]?.code).toBe('NOT_A_REPOSITORY');
    expect(report.diagnostics[0]?.message).toContain('git init');
  });
});

describe('GitCliProvider stamping', () => {
  it('reports a clean tree', async () => {
    const stamp = await new GitCliProvider(gitRunner()).stamp('/ws/.vitae');

    expect(stamp.ok && stamp.value).toEqual({ hash: 'a1b2c3d', dirty: false });
  });

  it('reports a dirty tree', async () => {
    // Built from scratch rather than by overriding `gitRunner`: the first
    // matching script wins, so a later one would never be reached.
    const dirty = new FakeProcessRunner()
      .onRun('git', ['rev-parse', '--is-inside-work-tree'], 'true\n')
      .onRun('git', ['rev-parse', '--short', 'HEAD'], 'a1b2c3d\n')
      .onRun('git', ['status', '--porcelain'], ' M content/projects.ts\n');

    const stamp = await new GitCliProvider(dirty).stamp('/ws/.vitae');

    expect(stamp.ok && stamp.value).toEqual({ hash: 'a1b2c3d', dirty: true });
  });

  it('assumes dirty when the status check itself fails', async () => {
    const runner = new FakeProcessRunner()
      .onRun('git', ['rev-parse', '--is-inside-work-tree'], 'true\n')
      .onRun('git', ['rev-parse', '--short', 'HEAD'], 'a1b2c3d\n')
      .onRunFailure('git', ['status'], 'index.lock exists');

    const stamp = await new GitCliProvider(runner).stamp('/ws/.vitae');

    // An over-cautious `-dirty` costs nothing; a false clean stamp destroys
    // the only guarantee the archive provides.
    expect(stamp.ok && stamp.value.dirty).toBe(true);
  });

  it('reports no hash outside a repository', async () => {
    const runner = new FakeProcessRunner().onRunFailure('git', ['rev-parse'], 'not a repo');

    const stamp = await new GitCliProvider(runner).stamp('/tmp/elsewhere');

    expect(stamp.ok && stamp.value.hash).toBeUndefined();
  });
});

describe('DoctorUseCase', () => {
  it('reports both capabilities present', async () => {
    const runner = gitRunner().withAvailable('git', 'soffice');
    runner.onRun('soffice', ['--version'], 'LibreOffice 24.2.5.2\n');
    const registry = await CapabilityRegistry.probe(runner);

    const report = await new DoctorUseCase(registry, new GitCliProvider(runner)).execute(
      '/ws/.vitae',
      library(),
    );

    expect(report.capabilities.every((c) => c.available)).toBe(true);
    expect(report.variantCount).toBe(1);
    expect(report.isGitRepository).toBe(true);
    expect(report.diagnostics).toHaveLength(0);
  });

  it('names what stops working when a capability is absent', async () => {
    const runner = gitRunner();
    const registry = await CapabilityRegistry.probe(runner);

    const report = await new DoctorUseCase(registry, new GitCliProvider(runner)).execute(
      '/ws/.vitae',
      library(),
    );

    const office = report.capabilities.find((c) => c.name === 'libreoffice');
    expect(office?.available).toBe(false);
    expect(office?.note).toContain('install LibreOffice');
  });

  it('still reports when content does not load', async () => {
    const runner = gitRunner();
    const registry = await CapabilityRegistry.probe(runner);
    const broken = [
      new (class extends Error {
        public readonly code = 'MISSING_CONTENT_FILE';
      })('content/header.ts is missing') as unknown as never,
    ];

    const report = await new DoctorUseCase(registry, new GitCliProvider(runner)).execute(
      '/ws/.vitae',
      broken,
    );

    // An environment report is most useful precisely when something is broken.
    expect(report.variantCount).toBe(0);
    expect(report.diagnostics[0]?.code).toBe('MISSING_CONTENT_FILE');
  });
});

describe('CapabilityRegistry', () => {
  it('caches the probe rather than re-running it', async () => {
    const runner = gitRunner();
    const registry = await CapabilityRegistry.probe(runner);
    const before = runner.calls.length;

    registry.has('git');
    registry.has('libreoffice');
    registry.versionOf('git');

    expect(runner.calls.length).toBe(before);
  });

  it('records the version of what it found', async () => {
    const registry = await CapabilityRegistry.probe(gitRunner());

    expect(registry.versionOf('git')).toContain('git version');
    expect(registry.versionOf('libreoffice')).toBeUndefined();
  });
});
