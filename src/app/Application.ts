/**
 * Application — the facade the CLI talks to.
 *
 * Holds the resolved workspace, the memoized content library, and the
 * constructed use cases. Everything arrives through a dependency bundle, so
 * Layer 5 supplies real adapters and tests supply fakes; this class constructs
 * no adapters of its own.
 */

import {
  ClaimsPolicy,
  ClaimsResolver,
  ResumeComposer,
  type ContentLibrary,
  type ContentRepository,
  type DomainError,
  type Result,
} from '../domain/index.js';
import { err, ok } from '../domain/index.js';
import { DefaultNaming, type NamingStrategy } from './naming/ArtifactNaming.js';
import type { ArtifactWriter } from './ports/ArtifactWriter.js';
import { NULL_PROGRESS_LISTENER, type ProgressListener } from './ports/ProgressListener.js';
import type { WorkspacePaths } from './ports/WorkspacePaths.js';
import { RendererFactory } from './render/RendererFactory.js';
import type { Theme } from '../render/index.js';
import type {
  BuildReport,
  CheckReport,
  ListReport,
  OutputFormat,
  VariantBuildReport,
} from './reports/reports.js';
import { BuildAllUseCase } from './usecases/BuildAllUseCase.js';
import { BuildVariantUseCase } from './usecases/BuildVariantUseCase.js';
import { CheckWorkspaceUseCase } from './usecases/CheckWorkspaceUseCase.js';
import { ListVariantsUseCase } from './usecases/ListVariantsUseCase.js';

/** Everything the application needs from the outside world. */
export interface ApplicationDependencies {
  readonly workspace: WorkspacePaths;
  readonly repository: ContentRepository;
  readonly writer: ArtifactWriter;
  readonly theme: Theme;
  /** Joins path segments; injected so this layer never imports `node:path`. */
  readonly joinPath: (...segments: string[]) => string;
  readonly naming?: NamingStrategy | undefined;
  readonly claimsPolicy?: ClaimsPolicy | undefined;
  readonly progress?: ProgressListener | undefined;
}

/** Orchestrates the tool's use cases against one workspace. */
export class Application {
  private readonly buildVariantUseCase: BuildVariantUseCase;
  private readonly buildAllUseCase: BuildAllUseCase;
  private readonly checkUseCase: CheckWorkspaceUseCase;
  private readonly listUseCase: ListVariantsUseCase;

  /**
   * Memoized library.
   *
   * `build --all` reads content once and composes every variant from the same
   * in-memory library. Memoizing at the facade rather than inside each use
   * case means no use case has to know it might be called repeatedly.
   */
  private libraryPromise: Promise<Result<ContentLibrary, DomainError[]>> | undefined;

  public constructor(private readonly deps: ApplicationDependencies) {
    const composer = new ResumeComposer();
    const claimsResolver = new ClaimsResolver();
    const claimsPolicy = deps.claimsPolicy ?? new ClaimsPolicy();

    this.buildVariantUseCase = new BuildVariantUseCase({
      writer: deps.writer,
      rendererFactory: new RendererFactory(deps.theme),
      naming: deps.naming ?? new DefaultNaming(),
      claimsPolicy,
      composer,
      claimsResolver,
      joinPath: deps.joinPath,
    });

    this.buildAllUseCase = new BuildAllUseCase(
      this.buildVariantUseCase,
      deps.progress ?? NULL_PROGRESS_LISTENER,
    );
    this.checkUseCase = new CheckWorkspaceUseCase(composer, claimsResolver, claimsPolicy);
    this.listUseCase = new ListVariantsUseCase(claimsResolver);
  }

  /** Builds one variant. */
  public async build(input: {
    readonly variantId: string;
    readonly format: OutputFormat;
    readonly force?: boolean | undefined;
    readonly outputDir?: string | undefined;
  }): Promise<Result<VariantBuildReport, DomainError[]>> {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(
      await this.buildVariantUseCase.execute(library.value, this.deps.workspace.distDir, input),
    );
  }

  /** Builds every variant, continuing past failures. */
  public async buildAll(input: {
    readonly format: OutputFormat;
    readonly force?: boolean | undefined;
    readonly outputDir?: string | undefined;
  }): Promise<Result<BuildReport, DomainError[]>> {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(
      await this.buildAllUseCase.execute(
        library.value,
        this.deps.workspace.root,
        this.deps.workspace.distDir,
        input,
      ),
    );
  }

  /** Validates without writing anything. */
  public async check(input: { readonly variantId?: string | undefined } = {}): Promise<
    Result<CheckReport, DomainError[]>
  > {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(this.checkUseCase.execute(library.value, input));
  }

  /** Summarizes every variant. */
  public async list(): Promise<Result<ListReport, DomainError[]>> {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(this.listUseCase.execute(library.value));
  }

  /** The loaded library, for callers that need the domain objects directly. */
  public library(): Promise<Result<ContentLibrary, DomainError[]>> {
    // The promise itself is cached, not its result: two concurrent calls must
    // not both trigger a load.
    this.libraryPromise ??= this.deps.repository.load();
    return this.libraryPromise;
  }
}
