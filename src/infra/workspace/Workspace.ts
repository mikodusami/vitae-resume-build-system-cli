/**
 * Workspace — a resolved `.vitae/` directory.
 *
 * Every "where does X live" question in the tool goes through an instance of
 * this class, so the folder convention exists in exactly one place. Later
 * layers (rendering output, archiving, `init`) ask the workspace rather than
 * re-deriving paths from a string they were handed.
 */

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

import { err, ok, type Result } from '../../domain/index.js';
import { WorkspaceNotFoundError } from '../errors.js';

/** The directory name searched for, at every level. */
export const WORKSPACE_DIR_NAME = '.vitae';

/** Environment variable that overrides discovery entirely. */
export const WORKSPACE_ENV_VAR = 'VITAE_DIR';

/** Inputs to {@link Workspace.resolve}; all optional. */
export interface WorkspaceResolveOptions {
  /** An explicit directory, e.g. from a `--dir` flag. Wins over everything. */
  readonly explicitDir?: string | undefined;
  /** Where to start walking up from; defaults to `process.cwd()`. */
  readonly cwd?: string | undefined;
  /** Environment to read {@link WORKSPACE_ENV_VAR} from; defaults to the real one. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** Home directory for the `~/.vitae` fallback; defaults to the real one. */
  readonly home?: string | undefined;
}

/** True when `candidate` exists and is a directory. */
function isDirectory(candidate: string): boolean {
  return existsSync(candidate) && statSync(candidate).isDirectory();
}

/**
 * Walks from `startDir` to the filesystem root, collecting `.vitae` candidates.
 *
 * @param startDir - absolute directory to start from
 */
function candidatesWalkingUp(startDir: string): string[] {
  const candidates: string[] = [];
  const root = parse(startDir).root;

  let current = startDir;
  for (;;) {
    candidates.push(join(current, WORKSPACE_DIR_NAME));
    if (current === root) {
      break;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return candidates;
}

/** A resolved `.vitae/` folder and the paths derived from it. */
export class Workspace {
  private constructor(
    /** Absolute path to the `.vitae/` directory itself. */
    public readonly root: string,
  ) {}

  /**
   * Finds the workspace to operate on.
   *
   * Order: explicit directory → `VITAE_DIR` → walking up from `cwd` (the same
   * discovery model as `git`) → `~/.vitae`. An explicit directory that does
   * not exist fails immediately rather than falling through to discovery,
   * because silently building the wrong resume is worse than an error.
   *
   * @param options - overrides for directory, cwd, environment, and home
   * @returns the workspace, or an error listing every location tried
   */
  public static resolve(
    options: WorkspaceResolveOptions = {},
  ): Result<Workspace, WorkspaceNotFoundError> {
    const cwd = options.cwd ?? process.cwd();
    const env = options.env ?? process.env;
    const home = options.home ?? homedir();

    const searched: string[] = [];

    const explicit = options.explicitDir ?? env[WORKSPACE_ENV_VAR];
    if (explicit !== undefined && explicit.length > 0) {
      const absolute = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
      searched.push(absolute);
      return isDirectory(absolute)
        ? ok(new Workspace(absolute))
        : err(new WorkspaceNotFoundError(searched));
    }

    for (const candidate of candidatesWalkingUp(resolve(cwd))) {
      searched.push(candidate);
      if (isDirectory(candidate)) {
        return ok(new Workspace(candidate));
      }
    }

    const homeCandidate = join(home, WORKSPACE_DIR_NAME);
    searched.push(homeCandidate);
    if (isDirectory(homeCandidate)) {
      return ok(new Workspace(homeCandidate));
    }

    return err(new WorkspaceNotFoundError(searched));
  }

  /** Content modules: header, education, work, projects, leadership, claims. */
  public get contentDir(): string {
    return join(this.root, 'content');
  }

  /** One `.ts` file per variant; the filename is the variant ID. */
  public get variantsDir(): string {
    return join(this.root, 'variants');
  }

  /** Latest builds. Created on demand by the rendering layer, not here. */
  public get distDir(): string {
    return join(this.root, 'dist');
  }

  /** Dated, hash-stamped sent versions. Created on demand by the archive layer. */
  public get archiveDir(): string {
    return join(this.root, 'archive');
  }

  /** Path only — the theme is presentational, so a later layer reads it. */
  public get themeFile(): string {
    return join(this.root, 'theme.ts');
  }

  public get configFile(): string {
    return join(this.root, 'config.json');
  }

  /** Joins segments onto the workspace root. */
  public resolvePath(...segments: readonly string[]): string {
    return join(this.root, ...segments);
  }
}
