/**
 * BuildVariantUseCase — compose, validate, render, write.
 *
 * This is where the enforcement decision Layer 1 deliberately deferred finally
 * gets made: by default an undefendable claim blocks writing an artifact, and
 * `force` overrides it. Because that is one branch in one use case rather than
 * a rule baked into the composer, changing it later is trivial.
 */

import type {
  ClaimsPolicy,
  ClaimsResolver,
  ContentLibrary,
  Diagnostic,
  DomainError,
  ResumeComposer,
  Variant,
} from '../../domain/index.js';
import type { ArtifactWriter } from '../ports/ArtifactWriter.js';
import type { BuildStamp, ContentStamper, PdfConverter } from '../ports/environment.js';
import type { NamingStrategy } from '../naming/ArtifactNaming.js';
import type { RendererFactory } from '../render/RendererFactory.js';
import { toDiagnostic, type OutputFormat, type VariantBuildReport } from '../reports/reports.js';

/** What to build, and where. */
export interface BuildVariantInput {
  readonly variantId: string;
  readonly format: OutputFormat;
  /** Write even when a claim cannot be defended. */
  readonly force?: boolean | undefined;
  /** Overrides the workspace's `dist/`. */
  readonly outputDir?: string | undefined;
  /**
   * Also write a dated, hash-stamped copy to `archive/`.
   *
   * An additional write of the same bytes, not a different operation — which
   * is why this is a field rather than a parallel use case.
   */
  readonly archive?: boolean | undefined;
  /** Also convert the result to PDF beside the document. */
  readonly pdf?: boolean | undefined;
}

/** Collaborators, all injected — this class constructs no adapters. */
export interface BuildVariantDependencies {
  readonly writer: ArtifactWriter;
  readonly rendererFactory: RendererFactory;
  readonly naming: NamingStrategy;
  readonly claimsPolicy: ClaimsPolicy;
  readonly composer: ResumeComposer;
  readonly claimsResolver: ClaimsResolver;
  /** Joins path segments; injected so this layer never imports `node:path`. */
  readonly joinPath: (...segments: string[]) => string;
  /** Where archived copies accumulate; from the workspace. */
  readonly archiveDir?: string | undefined;
  /**
   * The workspace root, which is where provenance is read from.
   *
   * Deliberately not `archiveDir`: that directory is created on demand *after*
   * this point, and asking git about a path that does not exist yet reports
   * "not a repository" — silently stamping every first archive `nogit`.
   */
  readonly workspaceRoot?: string | undefined;
  /** Provenance for `--archive`; absent means archiving is unavailable. */
  readonly stamper?: ContentStamper | undefined;
  /** Names archived copies, given a stamp. Injected for testable dates. */
  readonly archiveNaming?: ((stamp: BuildStamp) => NamingStrategy) | undefined;
  /** Converts to PDF for `--pdf`; absent means the feature is unavailable. */
  readonly pdfConverter?: PdfConverter | undefined;
}

/** Builds one variant into one artifact. */
export class BuildVariantUseCase {
  public constructor(private readonly deps: BuildVariantDependencies) {}

  /**
   * Runs the build.
   *
   * @param library - already-loaded content
   * @param defaultOutputDir - the workspace's `dist/`, used unless overridden
   * @param input - what to build
   * @returns a report; this method never throws for expected failures
   */
  public async execute(
    library: ContentLibrary,
    defaultOutputDir: string,
    input: BuildVariantInput,
  ): Promise<VariantBuildReport> {
    const variant = library.getVariant(input.variantId);
    if (!variant.ok) {
      return failed(input.variantId, [variant.error]);
    }

    const composed = this.deps.composer.compose(variant.value, library);
    if (!composed.ok) {
      // Every resolution error, not just the first.
      return failed(input.variantId, composed.error);
    }

    const resolvedClaims = this.deps.claimsResolver.resolve(variant.value, library);
    if (!resolvedClaims.ok) {
      return failed(input.variantId, resolvedClaims.error);
    }

    const validation = this.deps.claimsPolicy.evaluate(resolvedClaims.value);
    if (validation.hasErrors && input.force !== true) {
      // Blocked, not failed: everything worked, policy refused to write.
      return {
        variantId: input.variantId,
        status: 'blocked',
        diagnostics: validation.diagnostics,
      };
    }

    const renderer = this.deps.rendererFactory.create(input.format);
    if (!renderer.ok) {
      return failed(input.variantId, [renderer.error]);
    }

    const outputDir = input.outputDir ?? defaultOutputDir;
    const ensured = await this.deps.writer.ensureDir(outputDir);
    if (!ensured.ok) {
      return failed(input.variantId, [ensured.error], validation.diagnostics);
    }

    const filename = this.deps.naming.filenameFor(variant.value, input.format);
    const outputPath = this.deps.joinPath(outputDir, filename);

    const bytes = await renderer.value.render(composed.value);
    const written = await this.deps.writer.write(outputPath, bytes);
    if (!written.ok) {
      return failed(input.variantId, [written.error], validation.diagnostics);
    }

    const extras: Diagnostic[] = [];

    const archive =
      input.archive === true
        ? await this.archiveCopy(variant.value, input, bytes, extras)
        : undefined;

    const pdfPath =
      input.pdf === true
        ? await this.writePdf(bytes, outputDir, variant.value.id, extras)
        : undefined;

    // Warnings never block. You need to be able to build a resume for a
    // project you have not reviewed yet — you just need to be told.
    return {
      variantId: input.variantId,
      status: 'written',
      outputPath: written.value.path,
      byteLength: written.value.byteLength,
      diagnostics: [...validation.diagnostics, ...extras],
      ...(archive === undefined ? {} : archive),
      ...(pdfPath === undefined ? {} : { pdfPath }),
    };
  }

  /**
   * Writes the dated, hash-stamped archive copy.
   *
   * Archives are append-only: an existing file at the computed name means this
   * exact content was already archived today, so it is reported and skipped.
   * Overwriting would corrupt a historical record to save a rebuild.
   *
   * @param extras - accumulator for warnings; archiving never fails a build
   */
  private async archiveCopy(
    variant: Variant,
    input: BuildVariantInput,
    bytes: Buffer | string,
    extras: Diagnostic[],
  ): Promise<{ archivePath?: string; archiveSkipped?: boolean } | undefined> {
    if (
      this.deps.stamper === undefined ||
      this.deps.archiveNaming === undefined ||
      this.deps.archiveDir === undefined ||
      this.deps.workspaceRoot === undefined
    ) {
      extras.push(warning('ARCHIVE_UNAVAILABLE', 'Archiving is not available in this environment.'));
      return undefined;
    }

    const stamped = await this.deps.stamper.stamp(this.deps.workspaceRoot);
    if (!stamped.ok) {
      extras.push(warning('ARCHIVE_STAMP_FAILED', stamped.error.message));
      return undefined;
    }

    if (stamped.value.hash === undefined) {
      extras.push(
        warning(
          'ARCHIVE_NO_GIT',
          'This workspace is not a git repository, so the archive is stamped "nogit" — ' +
            '`git show` will not reconstruct it. Run `git init` in your .vitae/ folder.',
        ),
      );
    } else if (stamped.value.dirty) {
      extras.push(
        warning(
          'ARCHIVE_DIRTY',
          `Working tree has uncommitted changes, so this archive is stamped ` +
            `"${stamped.value.hash}-dirty" — that commit does not contain what was built. ` +
            'Commit first if you want the archive to be reconstructible.',
        ),
      );
    }

    const naming = this.deps.archiveNaming(stamped.value);
    const filename = naming.filenameFor(variant, input.format);
    const archivePath = this.deps.joinPath(this.deps.archiveDir, filename);

    const ensured = await this.deps.writer.ensureDir(this.deps.archiveDir);
    if (!ensured.ok) {
      extras.push(warning('ARCHIVE_FAILED', ensured.error.message));
      return undefined;
    }

    if (await this.deps.writer.exists(archivePath)) {
      extras.push(
        warning('ARCHIVE_EXISTS', `Already archived today as ${filename}; leaving it untouched.`),
      );
      return { archivePath, archiveSkipped: true };
    }

    const archived = await this.deps.writer.write(archivePath, bytes);
    if (!archived.ok) {
      extras.push(warning('ARCHIVE_FAILED', archived.error.message));
      return undefined;
    }

    return { archivePath };
  }

  /**
   * Converts the rendered document to PDF beside it.
   *
   * A missing LibreOffice warns rather than fails: the `.docx` was written
   * successfully, and losing that because an optional dependency is absent
   * would be the wrong trade.
   */
  private async writePdf(
    bytes: Buffer | string,
    outputDir: string,
    variantId: string,
    extras: Diagnostic[],
  ): Promise<string | undefined> {
    if (this.deps.pdfConverter === undefined) {
      extras.push(warning('PDF_UNAVAILABLE', 'PDF conversion is not available in this environment.'));
      return undefined;
    }

    if (typeof bytes === 'string') {
      extras.push(warning('PDF_SKIPPED', 'PDF conversion applies to docx output, not text.'));
      return undefined;
    }

    const converted = await this.deps.pdfConverter.convert(bytes, variantId);
    if (!converted.ok) {
      extras.push(warning('PDF_FAILED', converted.error.message));
      return undefined;
    }

    const pdfPath = this.deps.joinPath(outputDir, `${variantId}.pdf`);
    const written = await this.deps.writer.write(pdfPath, converted.value);
    if (!written.ok) {
      extras.push(warning('PDF_FAILED', written.error.message));
      return undefined;
    }

    return pdfPath;
  }
}

/** Builds a warning diagnostic; these never block a build. */
function warning(code: string, message: string): Diagnostic {
  return { severity: 'warning', code, message };
}

/** Builds a failure report, preserving any diagnostics gathered before it. */
function failed(
  variantId: string,
  errors: readonly DomainError[],
  existing: readonly Diagnostic[] = [],
): VariantBuildReport {
  return {
    variantId,
    status: 'failed',
    diagnostics: [...existing, ...errors.map(toDiagnostic)],
  };
}
