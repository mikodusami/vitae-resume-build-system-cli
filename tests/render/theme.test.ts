import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INFRA_ERROR_CODES } from '../../src/infra/errors.js';
import { FakeModuleLoader } from '../../src/infra/loader/FakeModuleLoader.js';
import { StyleResolver } from '../../src/render/docx/StyleResolver.js';
import { DEFAULT_THEME } from '../../src/render/theme/Theme.js';
import { ThemeLoader, mergeTheme } from '../../src/render/theme/ThemeLoader.js';

/** A theme path that genuinely exists, so the loader reads rather than defaults. */
const EXISTING_THEME_FILE = join(
  process.cwd(),
  'tests',
  'fixtures',
  'workspace',
  '.vitae',
  'theme.ts',
);

describe('mergeTheme', () => {
  it('overrides only the specified keys', () => {
    const merged = mergeTheme({ font: 'Georgia', sizes: { name: 40 } });

    expect(merged.font).toBe('Georgia');
    expect(merged.sizes.name).toBe(40);
    // Everything unspecified keeps its default, so theme files stay small.
    expect(merged.sizes.body).toBe(DEFAULT_THEME.sizes.body);
    expect(merged.page).toEqual(DEFAULT_THEME.page);
    expect(merged.spacing).toEqual(DEFAULT_THEME.spacing);
  });

  it('yields exact defaults for an empty theme', () => {
    expect(mergeTheme({})).toEqual(DEFAULT_THEME);
  });

  it('ignores an explicitly undefined value rather than erasing a default', () => {
    const merged = mergeTheme({ font: undefined, page: { margin: undefined } });

    expect(merged.font).toBe(DEFAULT_THEME.font);
    expect(merged.page.margin).toBe(DEFAULT_THEME.page.margin);
  });
});

describe('ThemeLoader', () => {
  it('treats a missing theme file as defaults, not an error', async () => {
    const loaded = await new ThemeLoader(new FakeModuleLoader()).load('/nowhere/theme.ts');

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toEqual(DEFAULT_THEME);
  });

  it('merges a partial theme file over the defaults', async () => {
    const loader = new FakeModuleLoader({
      [EXISTING_THEME_FILE]: { font: 'Georgia', spacing: { line: 300 } },
    });

    const loaded = await new ThemeLoader(loader).load(EXISTING_THEME_FILE);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.font).toBe('Georgia');
    expect(loaded.value.spacing.line).toBe(300);
    expect(loaded.value.spacing.bulletAfter).toBe(DEFAULT_THEME.spacing.bulletAfter);
  });

  it('reports an invalid value as a mapped diagnostic, reading like a content error', async () => {
    const loader = new FakeModuleLoader({ [EXISTING_THEME_FILE]: { sizes: { body: -5 } } });

    const loaded = await new ThemeLoader(loader).load(EXISTING_THEME_FILE);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.code).toBe(INFRA_ERROR_CODES.schemaValidation);
    expect(loaded.error[0]?.message).toContain('sizes.body');
  });

  it('rejects an unknown theme key rather than silently ignoring it', async () => {
    const loader = new FakeModuleLoader({ [EXISTING_THEME_FILE]: { fonts: 'Georgia' } });

    const loaded = await new ThemeLoader(loader).load(EXISTING_THEME_FILE);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error[0]?.message).toContain('fonts');
  });

  it('rejects a colour written with a leading #, which docx cannot use', async () => {
    const loader = new FakeModuleLoader({
      [EXISTING_THEME_FILE]: { sectionRule: { color: '#444444' } },
    });

    const loaded = await new ThemeLoader(loader).load(EXISTING_THEME_FILE);

    expect(loaded.ok).toBe(false);
  });
});

describe('StyleResolver', () => {
  it('maps each role to its themed size', () => {
    const resolver = new StyleResolver(DEFAULT_THEME);

    for (const role of ['name', 'body', 'meta', 'link', 'sectionHeading'] as const) {
      const options = resolver.runOptions({ text: 'x', role });
      expect(options.size).toBe(DEFAULT_THEME.sizes[role]);
      expect(options.font).toBe(DEFAULT_THEME.font);
    }
  });

  it('translates emphasis combinations into bold and italics', () => {
    const resolver = new StyleResolver(DEFAULT_THEME);

    expect(resolver.runOptions({ text: 'x', role: 'body' })).toMatchObject({
      bold: false,
      italics: false,
    });
    expect(
      resolver.runOptions({ text: 'x', role: 'body', emphasis: ['bold'] }),
    ).toMatchObject({ bold: true, italics: false });
    expect(
      resolver.runOptions({ text: 'x', role: 'body', emphasis: ['bold', 'italic'] }),
    ).toMatchObject({ bold: true, italics: true });
  });

  it('spaces bullets more tightly than entry lines', () => {
    const resolver = new StyleResolver(DEFAULT_THEME);

    expect(resolver.paragraphSpacing('bullet').after).toBe(DEFAULT_THEME.spacing.bulletAfter);
    expect(resolver.paragraphSpacing('splitLine').before).toBe(DEFAULT_THEME.spacing.entryBefore);
  });

  it('drops the heading border when the theme disables the rule', () => {
    const resolver = new StyleResolver({
      ...DEFAULT_THEME,
      sectionRule: { ...DEFAULT_THEME.sectionRule, enabled: false },
    });

    expect(resolver.sectionHeadingBorder()).toBeUndefined();
  });
});
