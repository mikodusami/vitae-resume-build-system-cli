/**
 * Page counting, in-process.
 *
 * Deliberately not `pdfinfo`: shelling out would add a second external
 * dependency to a feature that already needs LibreOffice, and it would make
 * the count untestable without installing poppler. Reading the buffer directly
 * means one optional dependency instead of two, and a unit test against a
 * fixture PDF.
 */

import { PDFDocument } from 'pdf-lib';

import { err, ok, type DomainError, type Result } from '../../domain/index.js';
import type { PageCounter } from '../../app/index.js';
import { PdfReadError } from '../errors.js';

/** Counts pages by parsing the PDF. */
export class PdfPageCounter implements PageCounter {
  public async count(pdf: Buffer): Promise<Result<number, DomainError>> {
    try {
      // Encrypted PDFs would otherwise throw; a page count does not need
      // decrypted content, only the page tree.
      const document = await PDFDocument.load(pdf, { ignoreEncryption: true });
      return ok(document.getPageCount());
    } catch (thrown) {
      const detail = thrown instanceof Error ? thrown.message.split('\n')[0] : String(thrown);
      return err(new PdfReadError(detail ?? 'unknown parse failure'));
    }
  }
}
