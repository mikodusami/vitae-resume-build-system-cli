import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INFRA_ERROR_CODES } from '../../src/infra/errors.js';
import { Workspace } from '../../src/infra/workspace/Workspace.js';

/**
 * Workspace resolution is filesystem behaviour, so these run against real temp
 * directories rather than a mocked `fs` — faking it here would test the mock.
 */
let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'vitae-workspace-'));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('Workspace.resolve', () => {
  it('finds .vitae/ in the current directory', () => {
    mkdirSync(join(tempRoot, '.vitae'));

    const resolved = Workspace.resolve({ cwd: tempRoot, env: {}, home: tempRoot });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.root).toBe(join(tempRoot, '.vitae'));
  });

  it('walks up three levels to find it, like git', () => {
    mkdirSync(join(tempRoot, '.vitae'));
    const deep = join(tempRoot, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });

    const resolved = Workspace.resolve({ cwd: deep, env: {}, home: tempRoot });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.root).toBe(join(tempRoot, '.vitae'));
  });

  it('honours an explicit directory over discovery', () => {
    mkdirSync(join(tempRoot, '.vitae'));
    const explicit = join(tempRoot, 'elsewhere');
    mkdirSync(explicit);

    const resolved = Workspace.resolve({ explicitDir: explicit, cwd: tempRoot, env: {} });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.root).toBe(explicit);
  });

  it('fails rather than falling through when an explicit directory is absent', () => {
    mkdirSync(join(tempRoot, '.vitae'));

    const resolved = Workspace.resolve({
      explicitDir: join(tempRoot, 'nope'),
      cwd: tempRoot,
      env: {},
    });

    expect(resolved.ok).toBe(false);
  });

  it('honours the VITAE_DIR environment variable', () => {
    const target = join(tempRoot, 'env-workspace');
    mkdirSync(target);

    const resolved = Workspace.resolve({
      cwd: tempRoot,
      env: { VITAE_DIR: target },
      home: tempRoot,
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.root).toBe(target);
  });

  it('falls back to ~/.vitae', () => {
    const home = join(tempRoot, 'home');
    mkdirSync(join(home, '.vitae'), { recursive: true });
    const cwd = join(tempRoot, 'unrelated');
    mkdirSync(cwd);

    const resolved = Workspace.resolve({ cwd, env: {}, home });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.root).toBe(join(home, '.vitae'));
  });

  it('reports every location searched when nothing is found', () => {
    const cwd = join(tempRoot, 'empty');
    mkdirSync(cwd);

    const resolved = Workspace.resolve({ cwd, env: {}, home: join(tempRoot, 'no-home') });

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error.code).toBe(INFRA_ERROR_CODES.workspaceNotFound);
    expect(resolved.error.message).toContain('vitae init');
    expect(resolved.error.searched.length).toBeGreaterThan(1);
  });
});

describe('Workspace paths', () => {
  it('derives every workspace path from the root', () => {
    mkdirSync(join(tempRoot, '.vitae'));
    const resolved = Workspace.resolve({ cwd: tempRoot, env: {}, home: tempRoot });
    if (!resolved.ok) throw new Error('expected resolution to succeed');
    const workspace = resolved.value;

    expect(workspace.contentDir).toBe(join(workspace.root, 'content'));
    expect(workspace.variantsDir).toBe(join(workspace.root, 'variants'));
    expect(workspace.distDir).toBe(join(workspace.root, 'dist'));
    expect(workspace.archiveDir).toBe(join(workspace.root, 'archive'));
    expect(workspace.themeFile).toBe(join(workspace.root, 'theme.ts'));
    expect(workspace.configFile).toBe(join(workspace.root, 'config.json'));
    expect(workspace.resolvePath('a', 'b')).toBe(join(workspace.root, 'a', 'b'));
  });
});
