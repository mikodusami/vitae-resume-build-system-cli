/**
 * jiti-backed module loader.
 *
 * Runtime TypeScript loading is what lets `.vitae/` have no build step: you
 * edit a bullet, you run the command, done.
 */

import { createJiti } from 'jiti';

import { err, ok, type Result } from '../../domain/index.js';
import { ModuleLoadError } from '../errors.js';
import type { ModuleLoader } from './ModuleLoader.js';

/** Shape of a module namespace we might pull a value out of. */
type ModuleNamespace = Record<string, unknown>;

/**
 * Picks the value a content file means to export.
 *
 * A default export wins; otherwise a single named export is unambiguous
 * enough to accept. Anything else is reported rather than guessed at.
 *
 * @param loaded - the module namespace as returned by jiti
 * @param filePath - used only for the error message
 */
function selectExport(loaded: unknown, filePath: string): Result<unknown, ModuleLoadError> {
  if (loaded === null || typeof loaded !== 'object') {
    return ok(loaded);
  }

  const namespace = loaded as ModuleNamespace;
  if ('default' in namespace) {
    return ok(namespace.default);
  }

  const names = Object.keys(namespace).filter((key) => key !== '__esModule');
  if (names.length === 1) {
    return ok(namespace[names[0] as string]);
  }

  if (names.length === 0) {
    return err(new ModuleLoadError(filePath, 'the file exports nothing'));
  }

  return err(
    new ModuleLoadError(
      filePath,
      `expected a default export, but found ${names.length} named exports ` +
        `(${names.join(', ')}). Add \`export default\` to say which one to use.`,
    ),
  );
}

/** Reduces any thrown value to a single readable line. */
function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message.split('\n')[0] ?? thrown.message;
  }
  return String(thrown);
}

/** Loads user `.ts`/`.js` content modules through jiti. */
export class JitiModuleLoader implements ModuleLoader {
  private readonly jiti: ReturnType<typeof createJiti>;

  /**
   * @param rootPath - the module resolution root, normally the workspace root
   */
  public constructor(rootPath: string) {
    // Caching is off: content changes between runs are the entire point, and
    // a stale cached bullet would be a maddening bug to chase.
    this.jiti = createJiti(rootPath, { fsCache: false, moduleCache: false, interopDefault: false });
  }

  public async load<T = unknown>(absPath: string): Promise<Result<T, ModuleLoadError>> {
    let loaded: unknown;
    try {
      loaded = await this.jiti.import(absPath);
    } catch (thrown) {
      return err(new ModuleLoadError(absPath, describeThrown(thrown)));
    }

    const selected = selectExport(loaded, absPath);
    return selected.ok ? ok(selected.value as T) : err(selected.error);
  }
}
