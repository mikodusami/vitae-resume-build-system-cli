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
} from '../../domain/index.js';
import type { ArtifactWriter } from '../ports/ArtifactWriter.js';
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

    // Warnings never block. You need to be able to build a resume for a
    // project you have not reviewed yet — you just need to be told.
    return {
      variantId: input.variantId,
      status: 'written',
      outputPath: written.value.path,
      byteLength: written.value.byteLength,
      diagnostics: validation.diagnostics,
    };
  }
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
