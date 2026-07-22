/**
 * The onboarding test.
 *
 * This is the single highest-value test in the project: it walks the exact
 * path a stranger takes on day one — `init`, then `build --all` — and asserts
 * real files came out. If this breaks, nothing else matters, because nobody
 * gets far enough to hit the other bugs.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { EXIT_CODES } from '../../src/cli/exitCodes.js';
import { cleanupTempDirs, makeTempDir, runCliCaptured } from './harness.js';

afterAll(() => {
  cleanupTempDirs();
});

describe('day one: init then build', () => {
  it('scaffolds a workspace and builds every variant into real .docx files', async () => {
    const dir = makeTempDir();

    const init = await runCliCaptured(['init', dir]);
    expect(init.exitCode).toBe(EXIT_CODES.success);

    const workspace = join(dir, '.vitae');
    const build = await runCliCaptured(['build', '--all', '--dir', workspace]);

    expect(build.exitCode).toBe(EXIT_CODES.success);

    const dist = join(workspace, 'dist');
    const files = readdirSync(dist).sort();
    expect(files).toEqual([
      'resume_backend.docx',
      'resume_data_engineer.docx',
      'resume_software_engineer.docx',
      'resume_systems.docx',
    ]);

    for (const file of files) {
      const path = join(dist, file);
      expect(statSync(path).size).toBeGreaterThan(1000);
      // "PK" — every .docx is a zip, so this catches a truncated or empty write.
      expect(readFileSync(path).subarray(0, 2).toString('utf8')).toBe('PK');
    }
  });

  it('scaffolds content that passes its own check', async () => {
    const dir = makeTempDir();
    await runCliCaptured(['init', dir]);

    const check = await runCliCaptured(['check', '--dir', join(dir, '.vitae')]);

    // The example resume ships with needs-review claims, which warn and pass.
    expect(check.exitCode).toBe(EXIT_CODES.success);
  });

  it('lists the scaffolded variants with their claim tiers', async () => {
    const dir = makeTempDir();
    await runCliCaptured(['init', dir]);

    const list = await runCliCaptured(['list', '--dir', join(dir, '.vitae')]);

    expect(list.exitCode).toBe(EXIT_CODES.success);
    expect(list.stdout).toContain('software-engineer');
    expect(list.stdout).toContain('confident');
    expect(list.stdout).toContain('needs-review');
  });

  it('refuses to clobber an existing workspace without --force', async () => {
    const dir = makeTempDir();
    await runCliCaptured(['init', dir]);
    const marker = join(dir, '.vitae', 'content', 'header.ts');
    writeFileSync(marker, '// edited by the user\n');

    const second = await runCliCaptured(['init', dir]);

    expect(second.exitCode).toBe(EXIT_CODES.failure);
    expect(second.stderr).toContain('already exists');
    // The user's edit must survive a refused init.
    expect(readFileSync(marker, 'utf8')).toContain('edited by the user');
  });

  it('overwrites when --force is given', async () => {
    const dir = makeTempDir();
    await runCliCaptured(['init', dir]);
    const marker = join(dir, '.vitae', 'content', 'header.ts');
    writeFileSync(marker, '// edited by the user\n');

    const forced = await runCliCaptured(['init', dir, '--force']);

    expect(forced.exitCode).toBe(EXIT_CODES.success);
    expect(readFileSync(marker, 'utf8')).not.toContain('edited by the user');
  });
});
