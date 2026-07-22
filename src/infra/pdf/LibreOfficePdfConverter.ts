/**
 * PDF conversion through LibreOffice.
 *
 * Two rules this file exists to keep:
 *
 * 1. **Nothing is ever written next to the user's files.** LibreOffice writes
 *    its output beside its input by default, so conversion happens entirely in
 *    a temp directory that is removed even when the conversion fails.
 * 2. **A missing LibreOffice is an actionable message**, not a spawn error.
 *    This is an optional dependency; the tool must stay fully usable without
 *    it.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { err, ok, type DomainError, type Result } from '../../domain/index.js';
import type { PdfConverter } from '../../app/index.js';
import { CapabilityUnavailableError, INFRA_ERROR_CODES, PdfConversionError } from '../errors.js';
import type { ProcessRunner } from '../process/ProcessRunner.js';

/**
 * Conversion is genuinely slow — LibreOffice starts a full office suite — so
 * the timeout is generous. A too-short timeout here produces a mysterious
 * failure on exactly the slower machines least able to diagnose it.
 */
export const CONVERSION_TIMEOUT_MS = 120_000;

/** Binary name; the same on every platform LibreOffice ships for. */
export const SOFFICE_BINARY = 'soffice';

/** Platform-specific hint for installing LibreOffice. */
function installHint(): string {
  if (process.platform === 'darwin') {
    return 'Install it with `brew install --cask libreoffice`, or from libreoffice.org.';
  }
  if (process.platform === 'linux') {
    return 'Install it with your package manager, e.g. `apt install libreoffice`.';
  }
  return 'Install it from libreoffice.org.';
}

/** Converts `.docx` bytes to PDF bytes. */
export class LibreOfficePdfConverter implements PdfConverter {
  public constructor(private readonly runner: ProcessRunner) {}

  public async convert(docx: Buffer, basename: string): Promise<Result<Buffer, DomainError>> {
    if (!(await this.runner.which(SOFFICE_BINARY))) {
      return err(
        new CapabilityUnavailableError('LibreOffice', 'PDF conversion', installHint()),
      );
    }

    const workDir = await mkdtemp(join(tmpdir(), 'vitae-pdf-'));
    const sourcePath = join(workDir, `${basename}.docx`);

    try {
      await writeFile(sourcePath, docx);

      const converted = await this.runner.run(
        SOFFICE_BINARY,
        ['--headless', '--convert-to', 'pdf', '--outdir', workDir, sourcePath],
        { cwd: workDir, timeoutMs: CONVERSION_TIMEOUT_MS },
      );

      if (!converted.ok) {
        const detail =
          converted.error.code === INFRA_ERROR_CODES.processTimeout
            ? `LibreOffice did not finish within ${CONVERSION_TIMEOUT_MS / 1000}s. ` +
              'It is sometimes slow on first run; try again, or run `soffice --headless` once by hand.'
            : converted.error.message;
        return err(new PdfConversionError(detail));
      }

      try {
        return ok(await readFile(join(workDir, `${basename}.pdf`)));
      } catch {
        // LibreOffice reports success even when it silently produced nothing.
        return err(
          new PdfConversionError('LibreOffice reported success but produced no PDF.'),
        );
      }
    } finally {
      // Runs on every path, including the error returns above.
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
