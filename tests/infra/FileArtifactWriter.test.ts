import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileArtifactWriter } from '../../src/infra/io/FileArtifactWriter.js';

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'vitae-writer-'));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('FileArtifactWriter', () => {
  it('writes bytes and reports the path and length', async () => {
    const target = join(tempRoot, 'resume.txt');

    const written = await new FileArtifactWriter().write(target, 'hello');

    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.value.path).toBe(target);
    expect(written.value.byteLength).toBe(5);
    expect(readFileSync(target, 'utf8')).toBe('hello');
  });

  it('writes binary buffers unchanged', async () => {
    const target = join(tempRoot, 'resume.docx');
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

    await new FileArtifactWriter().write(target, bytes);

    expect(readFileSync(target)).toEqual(bytes);
  });

  it('creates missing parent directories on demand', async () => {
    const nested = join(tempRoot, 'a', 'b', 'c');

    const ensured = await new FileArtifactWriter().ensureDir(nested);

    expect(ensured.ok).toBe(true);
    expect(existsSync(nested)).toBe(true);
  });

  it('leaves no temporary file behind after a successful write', async () => {
    await new FileArtifactWriter().write(join(tempRoot, 'resume.txt'), 'hello');

    // The write is atomic — temp file then rename — so nothing should remain.
    expect(readdirSync(tempRoot)).toEqual(['resume.txt']);
  });

  it('overwrites an existing artifact', async () => {
    const target = join(tempRoot, 'resume.txt');
    writeFileSync(target, 'old');

    await new FileArtifactWriter().write(target, 'new');

    expect(readFileSync(target, 'utf8')).toBe('new');
  });

  it('reports a failure with the offending path instead of throwing', async () => {
    // The destination directory does not exist, so the rename cannot land.
    const target = join(tempRoot, 'missing-dir', 'resume.txt');

    const written = await new FileArtifactWriter().write(target, 'hello');

    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.error.code).toBe('IO_FAILED');
    expect(written.error.message).toContain(target);
  });

  it('reports a directory failure rather than throwing', async () => {
    // A path whose parent is a file, not a directory.
    const file = join(tempRoot, 'not-a-dir');
    writeFileSync(file, 'x');

    const ensured = await new FileArtifactWriter().ensureDir(join(file, 'child'));

    expect(ensured.ok).toBe(false);
  });
});
