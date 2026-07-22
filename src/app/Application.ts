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
import type { IoError } from './errors.js';
import { ArchiveNaming } from './naming/ArchiveNaming.js';
import { DefaultNaming, type NamingStrategy } from './naming/ArtifactNaming.js';
import { PageBudgetPolicy } from './policy/PageBudgetPolicy.js';
import type {
  Capabilities,
  ContentStamper,
  PageCounter,
  PdfConverter,
  SourceDiffer,
} from './ports/environment.js';
import type { ArtifactWriter } from './ports/ArtifactWriter.js';
import { NULL_PROGRESS_LISTENER, type ProgressListener } from './ports/ProgressListener.js';
import type { WorkspacePaths } from './ports/WorkspacePaths.js';
import { RendererFactory } from './render/RendererFactory.js';
import type { Theme } from '../render/index.js';
import type {
  BuildReport,
  CheckReport,
  DiffReport,
  DoctorReport,
  ListReport,
  OutputFormat,
  PrepReport,
  VariantBuildReport,
} from './reports/reports.js';
import { BuildAllUseCase } from './usecases/BuildAllUseCase.js';
import { DiffUseCase, type DiffInput } from './usecases/DiffUseCase.js';
import { DoctorUseCase } from './usecases/DoctorUseCase.js';
import { PrepUseCase, type PrepInput } from './usecases/PrepUseCase.js';
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

  // Everything below is optional: each corresponds to an external program the
  // machine may not have, and the tool stays fully usable without any of them.

  /** Probed capabilities, for `doctor`. */
  readonly capabilities?: Capabilities | undefined;
  /** Git provenance for `--archive`. */
  readonly stamper?: ContentStamper | undefined;
  /** Git history access for `diff`. */
  readonly differ?: SourceDiffer | undefined;
  readonly pdfConverter?: PdfConverter | undefined;
  readonly pageCounter?: PageCounter | undefined;
  /** Maximum pages before `check --pages` complains. */
  readonly pageLimit?: number | undefined;
}

/** Orchestrates the tool's use cases against one workspace. */
export class Application {
  private readonly buildVariantUseCase: BuildVariantUseCase;
  private readonly buildAllUseCase: BuildAllUseCase;
  private readonly checkUseCase: CheckWorkspaceUseCase;
  private readonly listUseCase: ListVariantsUseCase;
  private readonly prepUseCase: PrepUseCase;

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

    const rendererFactory = new RendererFactory(deps.theme);

    this.buildVariantUseCase = new BuildVariantUseCase({
      writer: deps.writer,
      rendererFactory,
      naming: deps.naming ?? new DefaultNaming(),
      claimsPolicy,
      composer,
      claimsResolver,
      joinPath: deps.joinPath,
      archiveDir: deps.workspace.archiveDir,
      workspaceRoot: deps.workspace.root,
      stamper: deps.stamper,
      // A factory rather than an instance: the stamp is only known once the
      // repository has been inspected, which happens per build.
      archiveNaming: (stamp, label) => new ArchiveNaming(stamp, undefined, label),
      pdfConverter: deps.pdfConverter,
    });

    this.buildAllUseCase = new BuildAllUseCase(
      this.buildVariantUseCase,
      deps.progress ?? NULL_PROGRESS_LISTENER,
    );
    // The page-budget collaborators are supplied only when this machine can
    // actually render a PDF; otherwise the check reports that it was skipped.
    const pageBudget =
      deps.pdfConverter !== undefined && deps.pageCounter !== undefined
        ? {
            rendererFactory,
            pdfConverter: deps.pdfConverter,
            pageCounter: deps.pageCounter,
            policy: new PageBudgetPolicy(deps.pageLimit),
          }
        : undefined;

    this.checkUseCase = new CheckWorkspaceUseCase(
      composer,
      claimsResolver,
      claimsPolicy,
      pageBudget,
    );
    this.listUseCase = new ListVariantsUseCase(claimsResolver);
    this.prepUseCase = new PrepUseCase(claimsResolver);
  }

  /** Builds one variant. */
  public async build(input: {
    readonly variantId: string;
    readonly format: OutputFormat;
    readonly force?: boolean | undefined;
    readonly outputDir?: string | undefined;
    readonly archive?: boolean | undefined;
    readonly archiveLabel?: string | undefined;
    readonly pdf?: boolean | undefined;
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
    readonly archive?: boolean | undefined;
    readonly pdf?: boolean | undefined;
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
  public async check(
    input: {
      readonly variantId?: string | undefined;
      readonly pages?: boolean | undefined;
    } = {},
  ): Promise<
    Result<CheckReport, DomainError[]>
  > {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(await this.checkUseCase.execute(library.value, input));
  }

  /** Summarizes every variant. */
  public async list(): Promise<Result<ListReport, DomainError[]>> {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(this.listUseCase.execute(library.value));
  }

  /** Builds the interview checklist for one variant. */
  public async prep(input: PrepInput): Promise<Result<PrepReport, DomainError[]>> {
    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(this.prepUseCase.execute(library.value, input));
  }

  /**
   * Shows what changed in a variant's inputs since a git ref.
   *
   * Requires git; without it the caller gets an actionable error rather than a
   * confusing empty diff.
   */
  public async diff(input: DiffInput): Promise<Result<DiffReport, DomainError[]>> {
    if (this.deps.differ === undefined) {
      return ok({
        variantId: input.variantId,
        ref: input.ref,
        paths: [],
        patch: '',
        diagnostics: [
          {
            severity: 'error',
            code: 'CAPABILITY_UNAVAILABLE',
            message: '`vitae diff` requires git, which was not found. Install git to use it.',
          },
        ],
      });
    }

    const library = await this.library();
    if (!library.ok) {
      return err(library.error);
    }

    return ok(
      await new DiffUseCase(this.deps.differ).execute(
        library.value,
        this.deps.workspace.root,
        input,
      ),
    );
  }

  /**
   * Reports what this environment can do.
   *
   * Deliberately tolerant of broken content: an environment report is most
   * useful precisely when something does not load, so load failures become
   * diagnostics inside the report rather than replacing it.
   */
  public async doctor(): Promise<Result<DoctorReport, DomainError[]>> {
    if (this.deps.capabilities === undefined || this.deps.differ === undefined) {
      return err([]);
    }

    const library = await this.library();
    const useCase = new DoctorUseCase(this.deps.capabilities, this.deps.differ);

    return ok(
      await useCase.execute(
        this.deps.workspace.root,
        library.ok ? library.value : library.error,
      ),
    );
  }

  /**
   * Writes text through the injected writer.
   *
   * Exposed so a command can save generated output (`prep --out`) without
   * reaching for `fs` itself — the CLI has no filesystem access of its own
   * outside `init`.
   *
   * @param path - absolute or workspace-relative destination
   * @param text - already-rendered content
   */
  public async writeText(path: string, text: string): Promise<Result<string, IoError>> {
    const written = await this.deps.writer.write(path, text);
    return written.ok ? ok(written.value.path) : err(written.error);
  }

  /** The loaded library, for callers that need the domain objects directly. */
  public library(): Promise<Result<ContentLibrary, DomainError[]>> {
    // The promise itself is cached, not its result: two concurrent calls must
    // not both trigger a load.
    this.libraryPromise ??= this.deps.repository.load();
    return this.libraryPromise;
  }
}
