/**
 * Workspace configuration (`config.json`).
 *
 * A missing file is not an error — the defaults are documented and `owner`
 * falls back to the content header's name, so a workspace works before anyone
 * writes a config. Unknown keys warn rather than fail, so a config written by
 * a newer version of the tool does not hard-break an older one.
 */

import { existsSync, readFileSync } from 'node:fs';

import { z } from 'zod';

import { err, ok, type Result } from '../../domain/index.js';
import { ConfigInvalidError } from '../errors.js';

/** Output preferences. */
export interface OutputConfig {
  /** Prefix for generated filenames; defaults to `resume`. */
  readonly filenamePrefix?: string | undefined;
}

/** Validated workspace configuration. */
export interface VitaeConfig {
  /** Document `creator` property; falls back to the header name. */
  readonly owner?: string | undefined;
  /** Variant used when a command is given none. */
  readonly defaultVariant?: string | undefined;
  readonly output?: OutputConfig | undefined;
  /**
   * Maximum pages before `vitae check --pages` complains.
   *
   * One by default: a resume that runs to two pages is usually a resume that
   * has not been edited. Raise it deliberately.
   */
  readonly pageLimit?: number | undefined;
}

/** Config plus any non-fatal complaints raised while reading it. */
export interface ConfigLoadResult {
  readonly config: VitaeConfig;
  /** Human-readable warnings, e.g. unknown keys. Never blocks a build. */
  readonly warnings: readonly string[];
}

/** Applied when `config.json` is absent or omits a field. */
export const DEFAULT_FILENAME_PREFIX = 'resume';

/**
 * Deliberately non-strict: unknown keys are collected as warnings rather than
 * rejected, per the forward-compatibility rule above.
 */
const configSchema: z.ZodType<VitaeConfig> = z.object({
  owner: z.string().min(1).optional(),
  defaultVariant: z.string().min(1).optional(),
  output: z
    .object({
      filenamePrefix: z.string().min(1).optional(),
    })
    .optional(),
  pageLimit: z.number().int().positive().optional(),
});

/** Keys the current version understands; anything else warns. */
const KNOWN_KEYS: readonly string[] = ['owner', 'defaultVariant', 'output', 'pageLimit'];

/**
 * Reads and validates `config.json`.
 *
 * @param configFile - absolute path, normally `workspace.configFile`
 * @returns defaults when the file is absent; an error only when it exists but
 * cannot be parsed or fails validation
 */
export function loadConfig(configFile: string): Result<ConfigLoadResult, ConfigInvalidError> {
  if (!existsSync(configFile)) {
    return ok({ config: {}, warnings: [] });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configFile, 'utf8'));
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : String(thrown);
    return err(new ConfigInvalidError(configFile, `not valid JSON — ${reason}`));
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first === undefined ? 'failed validation' : first.message;
    return err(new ConfigInvalidError(configFile, detail));
  }

  const warnings: string[] = [];
  if (typeof raw === 'object' && raw !== null) {
    for (const key of Object.keys(raw)) {
      if (!KNOWN_KEYS.includes(key)) {
        warnings.push(`${configFile}: unknown config key "${key}" ignored.`);
      }
    }
  }

  return ok({ config: parsed.data, warnings });
}
