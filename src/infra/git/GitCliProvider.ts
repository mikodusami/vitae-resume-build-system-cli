/**
 * Git access, through the `git` binary.
 *
 * Implements the application's `ContentStamper` and `SourceDiffer` ports.
 *
 * The correctness rule this file exists to uphold: **never report a clean hash
 * for a dirty tree.** The archive's entire value is that `git show <hash>`
 * reconstructs what was sent, and a false stamp is worse than no stamp at all.
 */

import { err, ok, type DomainError, type Result } from '../../domain/index.js';
import type { BuildStamp, ContentStamper, SourceDiffer } from '../../app/index.js';
import { GitError } from '../errors.js';
import type { ProcessRunner } from '../process/ProcessRunner.js';

/** Git is fast; a short timeout keeps a hung invocation from stalling a build. */
const GIT_TIMEOUT_MS = 10_000;

/** Reads repository state for stamping and diffing. */
export class GitCliProvider implements ContentStamper, SourceDiffer {
  public constructor(private readonly runner: ProcessRunner) {}

  /** Whether `cwd` is inside a git working tree. */
  public async isRepository(cwd: string): Promise<boolean> {
    const result = await this.runner.run(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      { cwd, timeoutMs: GIT_TIMEOUT_MS },
    );

    return result.ok && result.value.stdout.trim() === 'true';
  }

  /** The short hash of HEAD. */
  public async headShortHash(cwd: string): Promise<Result<string, GitError>> {
    const result = await this.runner.run('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    });

    if (!result.ok) {
      return err(new GitError(result.error.message));
    }

    const hash = result.value.stdout.trim();
    return hash.length > 0 ? ok(hash) : err(new GitError('HEAD resolved to an empty hash'));
  }

  /** Whether the working tree has uncommitted changes. */
  public async isDirty(cwd: string): Promise<Result<boolean, GitError>> {
    const result = await this.runner.run('git', ['status', '--porcelain'], {
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    });

    if (!result.ok) {
      return err(new GitError(result.error.message));
    }

    return ok(result.value.stdout.trim().length > 0);
  }

  /**
   * Produces the provenance stamp for a build.
   *
   * Degrades rather than fails: outside a repository, or when HEAD cannot be
   * resolved (a repository with no commits yet), the stamp carries no hash and
   * the caller records that fact instead of pretending otherwise.
   */
  public async stamp(cwd: string): Promise<Result<BuildStamp, DomainError>> {
    if (!(await this.isRepository(cwd))) {
      return ok({ hash: undefined, dirty: false });
    }

    const hash = await this.headShortHash(cwd);
    if (!hash.ok) {
      return ok({ hash: undefined, dirty: false });
    }

    const dirty = await this.isDirty(cwd);
    if (!dirty.ok) {
      // The hash is real but its meaning is unverified. Assume dirty: an
      // over-cautious `-dirty` suffix costs nothing, a false clean stamp
      // destroys the guarantee the archive exists to provide.
      return ok({ hash: hash.value, dirty: true });
    }

    return ok({ hash: hash.value, dirty: dirty.value });
  }

  public async diffPaths(
    cwd: string,
    ref: string,
    paths: readonly string[],
  ): Promise<Result<string, DomainError>> {
    // `--` separates revisions from paths, so a path that looks like a ref
    // cannot be misread as one.
    const result = await this.runner.run('git', ['diff', ref, '--', ...paths], {
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    });

    return result.ok ? ok(result.value.stdout) : err(new GitError(result.error.message));
  }
}
