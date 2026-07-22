import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContent } from '../../src/cli/contentSource.js';

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'workspace');

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'vitae-source-'));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('resolveContent', () => {
  it('reads a real workspace and reports its provenance', async () => {
    const resolved = await resolveContent({ explicitDir: join(FIXTURE_ROOT, '.vitae') });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.content.origin).toBe('workspace');
    expect(resolved.content.library.listVariants()).toHaveLength(2);
    expect(resolved.content.defaultVariantId).toBe('data-engineer');
  });

  it('falls back to sample content when no workspace exists anywhere', async () => {
    const resolved = await resolveContent({ cwd: tempRoot, env: {}, home: tempRoot });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.content.origin).toBe('sample');
    expect(resolved.content.library.header.name).toBe('Ada Lovelace');
  });

  it('fails loudly rather than falling back when a workspace is broken', async () => {
    const root = join(tempRoot, '.vitae');
    mkdirSync(join(root, 'content'), { recursive: true });
    mkdirSync(join(root, 'variants'), { recursive: true });
    writeFileSync(join(root, 'content', 'header.ts'), 'export default { name: 1 };\n');

    const resolved = await resolveContent({ explicitDir: root });

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    // Silently building the sample resume because the user's content has a
    // typo would be the worst possible failure mode.
    expect(resolved.failure.diagnostics.length).toBeGreaterThan(0);
  });
});
