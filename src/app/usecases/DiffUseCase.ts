/**
 * DiffUseCase — what changed in the files a variant actually depends on.
 *
 * The reason this is a use case rather than a shell alias: knowing that
 * `data-engineer` depends on its own variant file *plus* the shared content
 * modules — and nothing else — is application knowledge. `git diff` alone
 * would show you changes to three other resumes you did not ask about.
 */

import type { ContentLibrary, Diagnostic } from '../../domain/index.js';
import { toDiagnostic, type DiffReport } from '../reports/reports.js';
import type { SourceDiffer } from '../ports/environment.js';

/** What to diff, and against what. */
export interface DiffInput {
  readonly variantId: string;
  /** Any git revision: a tag, a branch, `HEAD~3`, a hash. */
  readonly ref: string;
}

/**
 * Shared content files every variant reads.
 *
 * Listed rather than globbed so the diff is stable: a stray editor backup in
 * `content/` should not silently join the comparison.
 */
const SHARED_CONTENT_PATHS: readonly string[] = [
  'content/header.ts',
  'content/education.ts',
  'content/work.ts',
  'content/projects.ts',
  'content/leadership.ts',
  'content/claims.ts',
];

/** Diffs a variant's inputs against a git ref. */
export class DiffUseCase {
  public constructor(private readonly differ: SourceDiffer) {}

  /**
   * @param library - already-loaded content, to validate the variant exists
   * @param workspaceRoot - where the git commands run
   * @param input - variant and ref
   */
  public async execute(
    library: ContentLibrary,
    workspaceRoot: string,
    input: DiffInput,
  ): Promise<DiffReport> {
    const empty = (diagnostics: Diagnostic[]): DiffReport => ({
      variantId: input.variantId,
      ref: input.ref,
      paths: [],
      patch: '',
      diagnostics,
    });

    const variant = library.getVariant(input.variantId);
    if (!variant.ok) {
      return empty([toDiagnostic(variant.error)]);
    }

    if (!(await this.differ.isRepository(workspaceRoot))) {
      return empty([
        {
          severity: 'error',
          code: 'NOT_A_REPOSITORY',
          message:
            `${workspaceRoot} is not a git repository, so there is no history to diff. ` +
            'Run `git init` there and commit your content to start tracking it.',
        },
      ]);
    }

    const paths = [`variants/${variant.value.id}.ts`, ...SHARED_CONTENT_PATHS];

    const patch = await this.differ.diffPaths(workspaceRoot, input.ref, paths);
    if (!patch.ok) {
      return { ...empty([toDiagnostic(patch.error)]), paths };
    }

    return { variantId: variant.value.id, ref: input.ref, paths, patch: patch.value, diagnostics: [] };
  }
}
