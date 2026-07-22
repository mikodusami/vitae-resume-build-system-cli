/**
 * FileContentRepository — the `ContentRepository` port, backed by a workspace.
 *
 * Reads content once per process into an immutable `ContentLibrary`: no lazy
 * per-command re-reads and no cache invalidation logic to get wrong.
 *
 * The governing rule is aggregation. A load never stops at the first bad file;
 * it collects every diagnostic so one run tells the author everything that is
 * wrong with their content.
 */

import { existsSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import type { z } from 'zod';

import {
  ContentLibrary,
  err,
  ok,
  type AwardsLine,
  type Claim,
  type ContentLibraryData,
  type DomainError,
  type Education,
  type Header,
  type Job,
  type LeadershipEntry,
  type Project,
  type Result,
  type Variant,
  type ContentRepository,
} from '../../domain/index.js';
import { MissingContentFileError, VariantIdMismatchError } from '../errors.js';
import type { ModuleLoader } from '../loader/ModuleLoader.js';
import {
  claimsSchema,
  educationSchema,
  headerSchema,
  jobsSchema,
  leadershipFileSchema,
  projectsSchema,
  type LeadershipFile,
} from '../schema/contentSchemas.js';
import { variantSchema } from '../schema/contentSchemas.js';
import { ZodDiagnosticMapper } from '../schema/mapper.js';

/** Extensions accepted for user content, in preference order. */
const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.js'];

/** Base names required under `content/`, without extension. */
const REQUIRED_CONTENT_FILES = {
  header: 'header',
  education: 'education',
  work: 'work',
  projects: 'projects',
  leadership: 'leadership',
  claims: 'claims',
} as const;

/** Everything a workspace load produced, alongside any non-fatal warnings. */
export interface ContentLoadSuccess {
  readonly library: ContentLibrary;
  readonly warnings: readonly string[];
}

/** Reads a `.vitae/` workspace into a validated content library. */
export class FileContentRepository implements ContentRepository {
  /**
   * @param workspace - resolved workspace supplying every path
   * @param moduleLoader - how user TypeScript is executed
   */
  public constructor(
    private readonly workspace: {
      readonly contentDir: string;
      readonly variantsDir: string;
    },
    private readonly moduleLoader: ModuleLoader,
  ) {}

  public async load(): Promise<Result<ContentLibrary, DomainError[]>> {
    const diagnostics: DomainError[] = [];

    const header = await this.loadContentFile(
      REQUIRED_CONTENT_FILES.header,
      headerSchema,
      diagnostics,
    );
    const education = await this.loadContentFile(
      REQUIRED_CONTENT_FILES.education,
      educationSchema,
      diagnostics,
    );
    const jobs = await this.loadContentFile(REQUIRED_CONTENT_FILES.work, jobsSchema, diagnostics);
    const projects = await this.loadContentFile(
      REQUIRED_CONTENT_FILES.projects,
      projectsSchema,
      diagnostics,
    );
    const leadership = await this.loadContentFile(
      REQUIRED_CONTENT_FILES.leadership,
      leadershipFileSchema,
      diagnostics,
    );
    const claims = await this.loadContentFile(
      REQUIRED_CONTENT_FILES.claims,
      claimsSchema,
      diagnostics,
    );
    const variants = await this.loadVariants(diagnostics);

    if (diagnostics.length > 0) {
      return err(diagnostics);
    }

    // Every value is present: a missing one would have pushed a diagnostic and
    // returned above.
    const data: ContentLibraryData = {
      header: header as Header,
      education: education as Education,
      jobs: jobs as Job[],
      projects: projects as Project[],
      leadership: (leadership as LeadershipFile).entries as LeadershipEntry[],
      awards: (leadership as LeadershipFile).awards as AwardsLine,
      claims: claims as Claim[],
      variants,
    };

    // Layer 1's duplicate-ID checks still run here; surfacing them as load
    // diagnostics keeps every content problem in one list.
    const library = ContentLibrary.create(data);
    return library.ok ? ok(library.value) : err([...library.error]);
  }

  /**
   * Loads and validates one required file under `content/`.
   *
   * @param baseName - file name without extension
   * @param schema - boundary schema bound to the domain type
   * @param diagnostics - accumulator; appended to on any failure
   * @returns the validated value, or `undefined` when anything went wrong
   */
  private async loadContentFile<T>(
    baseName: string,
    schema: z.ZodType<T>,
    diagnostics: DomainError[],
  ): Promise<T | undefined> {
    const filePath = this.findContentFile(baseName);
    if (filePath === undefined) {
      diagnostics.push(
        new MissingContentFileError(join(this.workspace.contentDir, `${baseName}.ts`)),
      );
      return undefined;
    }

    const loaded = await this.moduleLoader.load(filePath);
    if (!loaded.ok) {
      diagnostics.push(loaded.error);
      return undefined;
    }

    const parsed = schema.safeParse(loaded.value);
    if (!parsed.success) {
      diagnostics.push(...ZodDiagnosticMapper.toDiagnostics(parsed.error, filePath));
      return undefined;
    }

    return parsed.data;
  }

  /**
   * Discovers and validates every variant file.
   *
   * Convention over manifest: any module in `variants/` is a variant and its
   * filename is its ID, so adding one is dropping in a file. A declared `id`
   * that disagrees with the filename is an error rather than a silent
   * preference — ambiguity about which name wins costs an hour someday.
   *
   * @param diagnostics - accumulator; appended to on any failure
   */
  private async loadVariants(diagnostics: DomainError[]): Promise<Variant[]> {
    if (!existsSync(this.workspace.variantsDir)) {
      diagnostics.push(new MissingContentFileError(this.workspace.variantsDir));
      return [];
    }

    const fileNames = readdirSync(this.workspace.variantsDir)
      .filter((name) => MODULE_EXTENSIONS.includes(extname(name)) && !name.endsWith('.d.ts'))
      .sort();

    const variants: Variant[] = [];

    for (const fileName of fileNames) {
      const filePath = join(this.workspace.variantsDir, fileName);
      const fileNameId = basename(fileName, extname(fileName));

      const loaded = await this.moduleLoader.load(filePath);
      if (!loaded.ok) {
        diagnostics.push(loaded.error);
        continue;
      }

      const parsed = variantSchema.safeParse(loaded.value);
      if (!parsed.success) {
        diagnostics.push(...ZodDiagnosticMapper.toDiagnostics(parsed.error, filePath));
        continue;
      }

      if (parsed.data.id !== fileNameId) {
        diagnostics.push(new VariantIdMismatchError(filePath, parsed.data.id, fileNameId));
        continue;
      }

      variants.push(parsed.data);
    }

    return variants;
  }

  /** Finds `content/<baseName>.<ext>` for the first extension that exists. */
  private findContentFile(baseName: string): string | undefined {
    for (const extension of MODULE_EXTENSIONS) {
      const candidate = join(this.workspace.contentDir, `${baseName}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }
}
