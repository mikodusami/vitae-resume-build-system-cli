import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { EXIT_CODES } from '../../src/cli/exitCodes.js';
import { ANSI_ESCAPE, cleanupTempDirs, makeTempDir, runCliCaptured } from './harness.js';

afterAll(() => {
  cleanupTempDirs();
});

/** Scaffolds a workspace and returns its `.vitae/` path. */
async function scaffold(): Promise<string> {
  const dir = makeTempDir();
  await runCliCaptured(['init', dir]);
  return join(dir, '.vitae');
}

/** Rewrites one file inside a scaffolded workspace. */
function overwrite(workspace: string, relativePath: string, contents: string): void {
  writeFileSync(join(workspace, relativePath), contents);
}

/** Flips the first claim to a tier. */
function setFirstClaimTier(workspace: string, tier: string): void {
  const claimsPath = join(workspace, 'content', 'claims.ts');
  const claims = readFileSync(claimsPath, 'utf8');
  writeFileSync(claimsPath, claims.replace("defensibility: 'confident'", `defensibility: '${tier}'`));
}

describe('exit codes', () => {
  it('exits 0 for a clean workspace', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['check', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('exits 2 when a claim cannot be defended', async () => {
    const workspace = await scaffold();
    setFirstClaimTier(workspace, 'cannot-defend');

    const check = await runCliCaptured(['check', '--dir', workspace]);
    const build = await runCliCaptured(['build', '--all', '--dir', workspace]);

    // 2 is deliberately distinct from 1: a CI step reacts to "you cannot
    // defend this claim" differently from "your content is broken".
    expect(check.exitCode).toBe(EXIT_CODES.blocked);
    expect(build.exitCode).toBe(EXIT_CODES.blocked);
  });

  it('exits 1 for broken content', async () => {
    const workspace = await scaffold();
    overwrite(workspace, 'content/header.ts', 'export default { name: 42 };\n');

    const result = await runCliCaptured(['check', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.failure);
  });

  it('prefers 1 over 2 when content is both broken and blocked', async () => {
    const workspace = await scaffold();
    setFirstClaimTier(workspace, 'cannot-defend');
    overwrite(workspace, 'content/header.ts', 'export default { name: 42 };\n');

    const result = await runCliCaptured(['check', '--dir', workspace]);

    // Fix what is broken first: the claim gate cannot be trusted until the
    // content actually loads.
    expect(result.exitCode).toBe(EXIT_CODES.failure);
  });

  it('exits 1 with a searched-paths message when no workspace exists', async () => {
    const empty = makeTempDir();

    const result = await runCliCaptured(['list', '--dir', join(empty, 'nope')]);

    expect(result.exitCode).toBe(EXIT_CODES.failure);
    expect(result.stderr).toContain('WORKSPACE_NOT_FOUND');
    expect(result.stderr).toContain('vitae init');
    // A stack trace here would be the failure this whole tool guards against.
    expect(result.stderr).not.toContain('at Object.');
  });

  it('exits 1 for an unknown output format', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['build', '--format', 'pdf', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.failure);
    expect(result.stderr).toContain('docx');
  });

  it('exits 0 for --help and --version', async () => {
    expect((await runCliCaptured(['--help'])).exitCode).toBe(EXIT_CODES.success);
    expect((await runCliCaptured(['--version'])).exitCode).toBe(EXIT_CODES.success);
  });
});

describe('--json output', () => {
  it('writes parseable JSON to stdout and nothing else', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['list', '--json', '--dir', workspace]);

    const parsed: unknown = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('variants');
    expect((parsed as { variants: unknown[] }).variants).toHaveLength(4);
  });

  it('keeps the workspace notice off stdout so pipes stay clean', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['build', '--all', '--json', '--dir', workspace]);

    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stdout).not.toContain('workspace:');
  });

  it('emits no ANSI escapes under --json', async () => {
    const workspace = await scaffold();
    setFirstClaimTier(workspace, 'cannot-defend');

    const result = await runCliCaptured(['check', '--json', '--dir', workspace]);

    expect(result.stdout).not.toMatch(ANSI_ESCAPE);
  });

  it('reports load failures as JSON too', async () => {
    const empty = makeTempDir();

    const result = await runCliCaptured(['list', '--json', '--dir', join(empty, 'nope')]);

    const parsed: unknown = JSON.parse(result.stderr);
    expect(parsed).toHaveProperty('diagnostics');
  });
});

describe('--dir and where', () => {
  it('overrides discovery and reports the matched rule', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['where', '--dir', workspace]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    expect(result.stdout).toContain(workspace);
    expect(result.stdout).toContain('--dir');
  });

  it('reports every derived path as JSON', async () => {
    const workspace = await scaffold();

    const result = await runCliCaptured(['where', '--json', '--dir', workspace]);

    const parsed = JSON.parse(result.stdout) as Record<string, string>;
    expect(parsed.root).toBe(workspace);
    expect(parsed.distDir).toContain('dist');
    expect(parsed.rule).toBe('--dir');
  });
});
