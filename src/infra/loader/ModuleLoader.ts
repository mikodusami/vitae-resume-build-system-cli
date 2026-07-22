/**
 * ModuleLoader port.
 *
 * Executing the user's TypeScript at runtime is the genuinely
 * awkward-to-test part of loading, so it sits behind an interface with a
 * jiti-backed implementation and a fake for tests. Plain file reads are not
 * abstracted — those are tested against real temp directories, because
 * faking `fs` would be ceremony without payoff.
 */

import type { Result } from '../../domain/index.js';
import type { ModuleLoadError } from '../errors.js';

/** Imports a user module and hands back its exported value. */
export interface ModuleLoader {
  /**
   * Loads one module.
   *
   * Implementations prefer a default export and fall back to a single named
   * export, and must convert any throw from user code into a
   * `ModuleLoadError` — a typo in a bullet should never surface as a stack
   * trace from inside the loader.
   *
   * @param absPath - absolute path to a `.ts` or `.js` file
   */
  load<T = unknown>(absPath: string): Promise<Result<T, ModuleLoadError>>;
}
