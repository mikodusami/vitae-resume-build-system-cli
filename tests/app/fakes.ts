/**
 * Application-layer test doubles.
 *
 * Every collaborator the use cases need, faked: no disk, no jiti, no docx.
 * That is the payoff of constructor injection — if a test here ever needs a
 * temp directory, a dependency has been constructed somewhere it shouldn't be.
 */

import {
  ContentLibrary,
  err,
  ok,
  type ContentRepository,
  type DomainError,
  type Renderer,
  type Result,
  type ResumeDocument,
} from '../../src/domain/index.js';
import {
  IoError,
  type ArtifactWriter,
  type ProgressListener,
  type VariantBuildReport,
  type WrittenArtifact,
} from '../../src/app/index.js';
import { makeLibraryData } from '../domain/fixtures.js';
import type { ContentLibraryData } from '../../src/domain/index.js';

/** Joins path segments the way the real composition root does, POSIX-style. */
export function joinPath(...segments: string[]): string {
  return segments.join('/');
}

/** Serves a library, counting loads so memoization can be proven. */
export class FakeContentRepository implements ContentRepository {
  public loadCount = 0;

  public constructor(
    private readonly result: Result<ContentLibrary, DomainError[]>,
  ) {}

  /** Builds a repository over the Layer 1 fixtures. */
  public static withContent(overrides: Partial<ContentLibraryData> = {}): FakeContentRepository {
    const library = ContentLibrary.create(makeLibraryData(overrides));
    if (!library.ok) {
      throw new Error('invalid fixture content');
    }
    return new FakeContentRepository(ok(library.value));
  }

  /** Builds a repository that fails to load. */
  public static failing(errors: DomainError[]): FakeContentRepository {
    return new FakeContentRepository(err(errors));
  }

  public load(): Promise<Result<ContentLibrary, DomainError[]>> {
    this.loadCount += 1;
    return Promise.resolve(this.result);
  }
}

/** Records writes in memory; can be told to fail. */
export class FakeArtifactWriter implements ArtifactWriter {
  public readonly writes: { path: string; byteLength: number }[] = [];
  public readonly ensuredDirs: string[] = [];
  private failWritePath: string | undefined;
  private failEnsure = false;

  /** Makes `write` fail for one path, as a full disk or bad permission would. */
  public failWritesTo(path: string): this {
    this.failWritePath = path;
    return this;
  }

  /** Makes `ensureDir` fail. */
  public failEnsureDir(): this {
    this.failEnsure = true;
    return this;
  }

  public ensureDir(absPath: string): Promise<Result<void, IoError>> {
    if (this.failEnsure) {
      return Promise.resolve(err(new IoError(absPath, 'permission denied')));
    }
    this.ensuredDirs.push(absPath);
    return Promise.resolve(ok(undefined));
  }

  public write(absPath: string, bytes: Buffer | string): Promise<Result<WrittenArtifact, IoError>> {
    if (this.failWritePath === absPath) {
      return Promise.resolve(err(new IoError(absPath, 'no space left on device')));
    }

    const byteLength = typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length;
    this.writes.push({ path: absPath, byteLength });
    return Promise.resolve(ok({ path: absPath, byteLength }));
  }
}

/** A renderer that produces a predictable string, so byte counts are stable. */
export class FakeRenderer implements Renderer<string> {
  public renderCount = 0;

  public render(doc: ResumeDocument): Promise<string> {
    this.renderCount += 1;
    return Promise.resolve(`rendered:${doc.meta.title}`);
  }
}

/** Records the progress events a build emitted. */
export class RecordingProgressListener implements ProgressListener {
  public readonly started: string[] = [];
  public readonly finished: VariantBuildReport[] = [];

  public onVariantStart(variantId: string): void {
    this.started.push(variantId);
  }

  public onVariantDone(report: VariantBuildReport): void {
    this.finished.push(report);
  }
}
