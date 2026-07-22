/**
 * Archive behaviour inside the build use case.
 *
 * All of it against fakes: no disk, no git, no LibreOffice.
 */

import { describe, expect, it } from 'vitest';

import {
  ArchiveNaming,
  BuildVariantUseCase,
  DefaultNaming,
  RendererFactory,
  type BuildStamp,
  type ContentStamper,
  type PdfConverter,
} from '../../src/app/index.js';
import {
  ClaimsPolicy,
  ClaimsResolver,
  ContentLibrary,
  ResumeComposer,
  err,
  ok,
  type DomainError,
  type Result,
} from '../../src/domain/index.js';
import { DEFAULT_THEME } from '../../src/render/index.js';
import { makeLibraryData } from '../domain/fixtures.js';
import { FakeArtifactWriter, joinPath } from './fakes.js';

/** A stamper returning whatever provenance a test wants. */
class FakeStamper implements ContentStamper {
  public readonly seen: string[] = [];

  public constructor(private readonly result: Result<BuildStamp, DomainError>) {}

  public stamp(cwd: string): Promise<Result<BuildStamp, DomainError>> {
    this.seen.push(cwd);
    return Promise.resolve(this.result);
  }
}

/** A converter that always fails, standing in for a machine without LibreOffice. */
class FailingPdfConverter implements PdfConverter {
  public constructor(private readonly error: DomainError) {}

  public convert(): Promise<Result<Buffer, DomainError>> {
    return Promise.resolve(err(this.error));
  }
}

/** A converter that returns fixed bytes. */
class StubPdfConverter implements PdfConverter {
  public convert(): Promise<Result<Buffer, DomainError>> {
    return Promise.resolve(ok(Buffer.from('%PDF-1.7 stub')));
  }
}

/** Builds the library the fixtures describe. */
function library(): ContentLibrary {
  const created = ContentLibrary.create(makeLibraryData());
  if (!created.ok) throw new Error('bad fixture');
  return created.value;
}

/** Assembles the use case with archive support wired in. */
function makeUseCase(
  writer: FakeArtifactWriter,
  stamper: ContentStamper,
  pdfConverter?: PdfConverter,
): BuildVariantUseCase {
  return new BuildVariantUseCase({
    writer,
    rendererFactory: new RendererFactory(DEFAULT_THEME),
    naming: new DefaultNaming(),
    claimsPolicy: new ClaimsPolicy(),
    composer: new ResumeComposer(),
    claimsResolver: new ClaimsResolver(),
    joinPath,
    stamper,
    archiveDir: '/ws/.vitae/archive',
    workspaceRoot: '/ws/.vitae',
    archiveNaming: (stamp) => new ArchiveNaming(stamp, new Date(2026, 6, 22)),
    ...(pdfConverter === undefined ? {} : { pdfConverter }),
  });
}

describe('build --archive', () => {
  it('writes both the dist copy and a stamped archive copy', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: 'a1b2c3d', dirty: false }));

    const report = await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
      archive: true,
    });

    expect(report.status).toBe('written');
    expect(report.archivePath).toBe('/ws/.vitae/archive/2026-07-22_data-engineer_a1b2c3d.docx');
    expect(writer.writes).toHaveLength(2);
  });

  it('reads provenance from the workspace root, not the archive directory', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: 'a1b2c3d', dirty: false }));

    await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
      archive: true,
    });

    // archive/ is created on demand *after* this point; asking git about a
    // path that does not exist yet reports "not a repository" and would stamp
    // every first archive `nogit`.
    expect(stamper.seen).toEqual(['/ws/.vitae']);
  });

  it('warns and marks the filename when the tree is dirty', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: 'a1b2c3d', dirty: true }));

    const report = await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
      archive: true,
    });

    expect(report.archivePath).toContain('a1b2c3d-dirty');
    const warning = report.diagnostics.find((d) => d.code === 'ARCHIVE_DIRTY');
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('does not contain what was built');
  });

  it('warns when the workspace is not a repository', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: undefined, dirty: false }));

    const report = await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
      archive: true,
    });

    expect(report.archivePath).toContain('nogit');
    expect(report.diagnostics.some((d) => d.code === 'ARCHIVE_NO_GIT')).toBe(true);
  });

  it('never overwrites an existing archive — the record is append-only', async () => {
    const existing = '/ws/.vitae/archive/2026-07-22_data-engineer_a1b2c3d.docx';
    const writer = new FakeArtifactWriter().withExisting(existing);
    const stamper = new FakeStamper(ok({ hash: 'a1b2c3d', dirty: false }));

    const report = await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
      archive: true,
    });

    expect(report.archiveSkipped).toBe(true);
    expect(report.diagnostics.some((d) => d.code === 'ARCHIVE_EXISTS')).toBe(true);
    // Only the dist copy was written; the archive was left untouched.
    expect(writer.writes.map((w) => w.path)).toEqual([
      '/ws/.vitae/dist/resume_data_engineer.docx',
    ]);
  });

  it('still writes the resume when archiving fails', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(err(new (class extends Error {
      public readonly code = 'GIT_FAILED';
    })('git exploded') as unknown as DomainError));

    const report = await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
      archive: true,
    });

    // Losing the build because provenance could not be read would be the
    // wrong trade — the .docx is the thing the user asked for.
    expect(report.status).toBe('written');
    expect(report.archivePath).toBeUndefined();
    expect(report.diagnostics.some((d) => d.code === 'ARCHIVE_STAMP_FAILED')).toBe(true);
  });

  it('does not archive unless asked', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: 'a1b2c3d', dirty: false }));

    const report = await makeUseCase(writer, stamper).execute(library(), '/ws/.vitae/dist', {
      variantId: 'data-engineer',
      format: 'docx',
    });

    expect(report.archivePath).toBeUndefined();
    expect(writer.writes).toHaveLength(1);
  });
});

describe('build --pdf', () => {
  it('writes a PDF beside the document', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: 'a', dirty: false }));

    const report = await makeUseCase(writer, stamper, new StubPdfConverter()).execute(
      library(),
      '/ws/.vitae/dist',
      { variantId: 'data-engineer', format: 'docx', pdf: true },
    );

    expect(report.pdfPath).toBe('/ws/.vitae/dist/data-engineer.pdf');
    expect(writer.writes.some((w) => w.path.endsWith('.pdf'))).toBe(true);
  });

  it('warns rather than failing when LibreOffice is missing', async () => {
    const writer = new FakeArtifactWriter();
    const stamper = new FakeStamper(ok({ hash: 'a', dirty: false }));
    const missing = new (class extends Error {
      public readonly code = 'CAPABILITY_UNAVAILABLE';
    })('PDF conversion requires LibreOffice, which was not found.') as unknown as DomainError;

    const report = await makeUseCase(writer, stamper, new FailingPdfConverter(missing)).execute(
      library(),
      '/ws/.vitae/dist',
      { variantId: 'data-engineer', format: 'docx', pdf: true },
    );

    expect(report.status).toBe('written');
    expect(report.pdfPath).toBeUndefined();
    const warning = report.diagnostics.find((d) => d.code === 'PDF_FAILED');
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('LibreOffice');
  });
});
