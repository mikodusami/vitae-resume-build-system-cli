/**
 * FileArtifactWriter — the filesystem implementation of `ArtifactWriter`.
 *
 * Writes atomically: bytes go to a temporary file in the destination directory
 * and are then renamed into place. `rename` within one filesystem is atomic,
 * so a build interrupted mid-write leaves either the previous file or the new
 * one — never a truncated `.docx` that Word refuses to open.
 */

import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { err, ok, type Result } from '../../domain/index.js';
import { IoError, type ArtifactWriter, type WrittenArtifact } from '../../app/index.js';

/** Reduces any thrown value to one readable line. */
function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message.split('\n')[0] ?? thrown.message;
  }
  return String(thrown);
}

/** Writes rendered artifacts to disk. */
export class FileArtifactWriter implements ArtifactWriter {
  public async ensureDir(absPath: string): Promise<Result<void, IoError>> {
    try {
      await mkdir(absPath, { recursive: true });
      return ok(undefined);
    } catch (thrown) {
      return err(new IoError(absPath, describeThrown(thrown)));
    }
  }

  public async write(
    absPath: string,
    bytes: Buffer | string,
  ): Promise<Result<WrittenArtifact, IoError>> {
    // Same directory as the destination, so the rename stays within one
    // filesystem and therefore stays atomic.
    const tempPath = join(dirname(absPath), `.${Date.now()}.vitae.tmp`);

    try {
      await writeFile(tempPath, bytes);
      await rename(tempPath, absPath);
    } catch (thrown) {
      await unlink(tempPath).catch(() => undefined);
      return err(new IoError(absPath, describeThrown(thrown)));
    }

    return ok({
      path: absPath,
      byteLength: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length,
    });
  }
}
