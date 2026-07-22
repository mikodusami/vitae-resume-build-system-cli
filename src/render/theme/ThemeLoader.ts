/**
 * Theme loading and merging.
 *
 * A user's `theme.ts` may specify one field or forty: it is validated as a
 * deep-partial and merged onto {@link DEFAULT_THEME}, so wanting a different
 * font never means restating every spacing constant. A missing theme file is
 * not an error — it means defaults.
 */

import { existsSync } from 'node:fs';

import { z } from 'zod';

import { err, ok, type DomainError, type Result } from '../../domain/index.js';
import { ZodDiagnosticMapper, type ModuleLoader } from '../../infra/index.js';
import { DEFAULT_THEME, type Theme } from './Theme.js';

/**
 * A theme file's contents: any subset of {@link Theme}, nested one level.
 *
 * Each field is explicitly `| undefined` for the same reason `Claim.reviewNotes`
 * is — an optional zod field produces `T | undefined`, and under
 * `exactOptionalPropertyTypes` that must be stated rather than cast away.
 */
export type PartialTheme = {
  readonly [K in keyof Theme]?: Theme[K] extends object
    ? { readonly [P in keyof Theme[K]]?: Theme[K][P] | undefined } | undefined
    : Theme[K] | undefined;
};

/** A length in DXA, or a size in half-points: always a positive number. */
const positive = z.number().positive();

/**
 * Deep-partial theme schema.
 *
 * Not `.strict()` at the top level would let a typo pass silently, so each
 * object rejects unknown keys for the same reason content schemas do — a
 * misspelled `fonts:` that quietly does nothing is worse than a loud failure.
 */
const partialThemeSchema: z.ZodType<PartialTheme> = z.strictObject({
  font: z.string().min(1).optional(),
  page: z
    .strictObject({
      width: positive.optional(),
      height: positive.optional(),
      margin: z.number().nonnegative().optional(),
    })
    .optional(),
  sizes: z
    .strictObject({
      name: positive.optional(),
      sectionHeading: positive.optional(),
      body: positive.optional(),
      meta: positive.optional(),
      link: positive.optional(),
    })
    .optional(),
  rightTab: positive.optional(),
  bullet: z
    .strictObject({
      indent: z.number().nonnegative().optional(),
      hanging: z.number().nonnegative().optional(),
    })
    .optional(),
  spacing: z
    .strictObject({
      sectionBefore: z.number().nonnegative().optional(),
      sectionAfter: z.number().nonnegative().optional(),
      bulletAfter: z.number().nonnegative().optional(),
      line: positive.optional(),
      entryBefore: z.number().nonnegative().optional(),
      entryAfter: z.number().nonnegative().optional(),
    })
    .optional(),
  sectionRule: z
    .strictObject({
      enabled: z.boolean().optional(),
      size: z.number().nonnegative().optional(),
      // Hex RGB without a leading '#': docx rejects the '#' form.
      color: z
        .string()
        .regex(/^[0-9a-fA-F]{6}$/, 'must be a 6-digit hex colour without a leading #')
        .optional(),
    })
    .optional(),
});

/** A group override: every field optional and explicitly nullable. */
type GroupOverride<T> = { readonly [P in keyof T]?: T[P] | undefined };

/**
 * Merges one nested theme group over its defaults.
 *
 * Keys whose value is `undefined` are skipped rather than spread, so writing
 * `page: { margin: undefined }` in a theme file falls back to the default
 * instead of erasing it — a plain object spread would happily overwrite a good
 * value with nothing.
 */
function mergeGroup<T extends object>(defaults: T, override: GroupOverride<T> | undefined): T {
  if (override === undefined) {
    return defaults;
  }

  const merged = { ...defaults };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      merged[key as keyof T] = value as T[keyof T];
    }
  }

  return merged;
}

/**
 * Merges a partial theme onto the defaults.
 *
 * The nesting is exactly one level deep, so an explicit merge per group is
 * clearer — and far easier to reason about — than a general deep-merge helper
 * that would also happily merge things this type can never contain.
 *
 * @param partial - the user's overrides
 * @param base - defaults to merge onto; injectable for tests
 */
export function mergeTheme(partial: PartialTheme, base: Theme = DEFAULT_THEME): Theme {
  return {
    font: partial.font ?? base.font,
    page: mergeGroup(base.page, partial.page),
    sizes: mergeGroup(base.sizes, partial.sizes),
    rightTab: partial.rightTab ?? base.rightTab,
    bullet: mergeGroup(base.bullet, partial.bullet),
    spacing: mergeGroup(base.spacing, partial.spacing),
    sectionRule: mergeGroup(base.sectionRule, partial.sectionRule),
  };
}

/** Reads, validates, and merges a user theme file. */
export class ThemeLoader {
  /**
   * @param moduleLoader - Layer 2's loader, so theme files behave exactly like
   * content files (same runtime TS support, same error shape)
   */
  public constructor(private readonly moduleLoader: ModuleLoader) {}

  /**
   * Loads the theme at `themeFile`, falling back to defaults when absent.
   *
   * @param themeFile - absolute path, normally `workspace.themeFile`
   * @returns the merged theme, or diagnostics that read identically to the
   * content-loading ones
   */
  public async load(themeFile: string): Promise<Result<Theme, DomainError[]>> {
    if (!existsSync(themeFile)) {
      return ok(DEFAULT_THEME);
    }

    const loaded = await this.moduleLoader.load(themeFile);
    if (!loaded.ok) {
      return err([loaded.error]);
    }

    const parsed = partialThemeSchema.safeParse(loaded.value);
    if (!parsed.success) {
      return err(ZodDiagnosticMapper.toDiagnostics(parsed.error, themeFile));
    }

    return ok(mergeTheme(parsed.data));
  }
}
