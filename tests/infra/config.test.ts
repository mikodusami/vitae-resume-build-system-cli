import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/infra/config/config.js';
import { INFRA_ERROR_CODES } from '../../src/infra/errors.js';

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'vitae-config-'));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

/** Writes `config.json` into the temp workspace and returns its path. */
function writeConfig(contents: string): string {
  const path = join(tempRoot, 'config.json');
  writeFileSync(path, contents);
  return path;
}

describe('loadConfig', () => {
  it('treats a missing file as defaults, not an error', () => {
    const loaded = loadConfig(join(tempRoot, 'config.json'));

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.config).toEqual({});
    expect(loaded.value.warnings).toEqual([]);
  });

  it('reads owner, default variant, and output preferences', () => {
    const path = writeConfig(
      JSON.stringify({
        owner: 'Ada Lovelace',
        defaultVariant: 'data-engineer',
        output: { filenamePrefix: 'ada' },
      }),
    );

    const loaded = loadConfig(path);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.config.owner).toBe('Ada Lovelace');
    expect(loaded.value.config.defaultVariant).toBe('data-engineer');
    expect(loaded.value.config.output?.filenamePrefix).toBe('ada');
  });

  it('warns about unknown keys rather than failing', () => {
    const path = writeConfig(JSON.stringify({ owner: 'Ada', futureFeature: true }));

    const loaded = loadConfig(path);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.warnings).toHaveLength(1);
    expect(loaded.value.warnings[0]).toContain('futureFeature');
  });

  it('reports malformed JSON without a raw parser stack', () => {
    const path = writeConfig('{ "owner": ');

    const loaded = loadConfig(path);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.code).toBe(INFRA_ERROR_CODES.configInvalid);
    expect(loaded.error.message).toContain('not valid JSON');
  });

  it('rejects a wrongly typed field', () => {
    const path = writeConfig(JSON.stringify({ owner: 42 }));

    const loaded = loadConfig(path);

    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.code).toBe(INFRA_ERROR_CODES.configInvalid);
  });
});
