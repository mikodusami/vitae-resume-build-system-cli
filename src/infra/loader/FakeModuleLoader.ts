/**
 * In-memory module loader for tests.
 *
 * Ships in `src/` rather than `tests/` on purpose: later layers' tests need it
 * too, and duplicating it per layer is how test helpers drift.
 */

import { err, ok, type Result } from '../../domain/index.js';
import { ModuleLoadError } from '../errors.js';
import type { ModuleLoader } from './ModuleLoader.js';

/** Serves pre-registered values by path, and can be told to fail on demand. */
export class FakeModuleLoader implements ModuleLoader {
  private readonly modules = new Map<string, unknown>();
  private readonly failures = new Map<string, string>();

  /**
   * @param modules - initial path-to-value entries
   */
  public constructor(modules: Readonly<Record<string, unknown>> = {}) {
    for (const [path, value] of Object.entries(modules)) {
      this.modules.set(path, value);
    }
  }

  /** Registers the value a path should return. */
  public set(path: string, value: unknown): this {
    this.modules.set(path, value);
    return this;
  }

  /** Makes a path fail, as user code with a syntax error or a throw would. */
  public setFailure(path: string, reason: string): this {
    this.failures.set(path, reason);
    return this;
  }

  public load<T = unknown>(absPath: string): Promise<Result<T, ModuleLoadError>> {
    const failure = this.failures.get(absPath);
    if (failure !== undefined) {
      return Promise.resolve(err(new ModuleLoadError(absPath, failure)));
    }

    if (!this.modules.has(absPath)) {
      return Promise.resolve(err(new ModuleLoadError(absPath, 'no such module registered')));
    }

    return Promise.resolve(ok(this.modules.get(absPath) as T));
  }
}
