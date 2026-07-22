/**
 * Layer 6 commands through the real CLI.
 *
 * These exercise the paths that must work on a machine with neither git nor
 * LibreOffice — which is most machines someone clones this onto.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { EXIT_CODES } from '../../src/cli/exitCodes.js';
import { cleanupTempDirs, makeTempDir, runCliCaptured } from './harness.js';

afterAll(() => {
  cleanupTempDirs();
});

/** Scaffolds a workspace and returns its `.vitae/` path. */
async function scaffold(): Promise<string> {
  const dir = makeTempDir();
  await runCliCaptured(['init', dir]);
  return join(dir, '.vitae');
}

describe('vitae doctor', () => {
  it('reports the workspace and every capability', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['doctor', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain(workspace);
    expect(result.stdout).toContain('git');
    expect(result.stdout).toContain('libreoffice');
    expect(result.stdout).toContain('4 variant(s)');
  });

  it('exits 0 even when a capability is missing — that is not a broken machine', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['doctor', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('reports broken content as a diagnostic and exits 1', async () => {
    const workspace = await scaffold();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(workspace, 'content', 'header.ts'), 'export default { name: 42 };\n');

    const result = await runCliCaptured(['doctor', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.failure);
    expect(result.stdout).toContain('header.ts');
  });

  it('emits JSON when asked', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['doctor', '--json', '--dir', workspace]);

    const parsed = JSON.parse(result.stdout) as { capabilities: unknown[] };
    expect(parsed.capabilities).toHaveLength(2);
  });
});

describe('vitae build --archive', () => {
  it('archives with a nogit stamp outside a repository, and says why', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured([
      'build',
      'software-engineer',
      '--archive',
      '--dir',
      workspace,
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);

    const archived = readdirSync(join(workspace, 'archive'));
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatch(/^\d{4}-\d{2}-\d{2}_software-engineer_nogit\.docx$/);
    expect(result.stdout).toContain('ARCHIVE_NO_GIT');
  });

  it('leaves an existing archive untouched on a rebuild', async () => {
    const workspace = await scaffold();

    await runCliCaptured(['build', 'software-engineer', '--archive', '--dir', workspace]);
    const archived = readdirSync(join(workspace, 'archive'));
    const first = readFileSync(join(workspace, 'archive', archived[0] as string));

    const second = await runCliCaptured([
      'build',
      'software-engineer',
      '--archive',
      '--dir',
      workspace,
    ]);

    expect(readdirSync(join(workspace, 'archive'))).toHaveLength(1);
    expect(readFileSync(join(workspace, 'archive', archived[0] as string))).toEqual(first);
    expect(second.stdout).toContain('ARCHIVE_EXISTS');
  });
});

describe('vitae prep', () => {
  it('writes markdown to stdout by default', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['prep', 'software-engineer', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('# Interview prep');
    expect(result.stdout).toContain('- [ ]');
  });

  it('saves to a file with --out, keeping stdout clean', async () => {
    const workspace = await scaffold();
    const target = join(workspace, 'prep.md');

    const result = await runCliCaptured([
      'prep',
      'software-engineer',
      '--out',
      target,
      '--dir',
      workspace,
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(readFileSync(target, 'utf8')).toContain('# Interview prep');
    // The confirmation goes to stderr; stdout carries the report or nothing.
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Wrote');
  });

  it('uses the config default variant when given none', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['prep', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain('Software Engineer');
  });
});

describe('vitae diff', () => {
  it('explains what to do when the workspace has no git history', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['diff', 'software-engineer', 'HEAD', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.failure);
    expect(result.stderr).toContain('git init');
    // Never a raw git error.
    expect(result.stderr).not.toContain('fatal:');
  });
});

describe('vitae check --pages', () => {
  it('warns rather than failing when LibreOffice is unavailable', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['check', '--pages', '--dir', workspace]);

    // The gate not running must never be a silent pass, and never a failure.
    if (result.stdout.includes('PAGE_BUDGET_SKIPPED')) {
      expect(result.exitCode).toBe(EXIT_CODES.success);
    } else {
      // On a machine that does have LibreOffice, real counts appear instead.
      expect(result.stdout).toContain('Page counts');
    }
  });
});
