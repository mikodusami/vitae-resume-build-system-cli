/**
 * Page counting and subprocess handling.
 *
 * The page counter runs against real PDF bytes built in-memory, which is the
 * payoff of counting in-process rather than shelling out to `pdfinfo`.
 */

import { describe, expect, it } from 'vitest';

import { PDFDocument } from 'pdf-lib';

import { INFRA_ERROR_CODES } from '../../src/infra/errors.js';
import { LibreOfficePdfConverter } from '../../src/infra/pdf/LibreOfficePdfConverter.js';
import { PdfPageCounter } from '../../src/infra/pdf/PdfPageCounter.js';
import { FakeProcessRunner } from '../../src/infra/process/FakeProcessRunner.js';
import { NodeProcessRunner } from '../../src/infra/process/NodeProcessRunner.js';

/** Builds a real PDF with the requested number of pages. */
async function makePdf(pages: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    document.addPage([612, 792]);
  }
  return Buffer.from(await document.save());
}

describe('PdfPageCounter', () => {
  it('counts a one-page document', async () => {
    const counted = await new PdfPageCounter().count(await makePdf(1));

    expect(counted.ok && counted.value).toBe(1);
  });

  it('counts a two-page document — the case the budget gate exists for', async () => {
    const counted = await new PdfPageCounter().count(await makePdf(2));

    expect(counted.ok && counted.value).toBe(2);
  });

  it('reports unreadable bytes rather than throwing', async () => {
    const counted = await new PdfPageCounter().count(Buffer.from('this is not a pdf'));

    expect(counted.ok).toBe(false);
    if (counted.ok) return;
    expect(counted.error.code).toBe(INFRA_ERROR_CODES.pdfRead);
  });
});

describe('LibreOfficePdfConverter', () => {
  it('names the install step when LibreOffice is absent', async () => {
    // No `withAvailable`, so `which` reports nothing installed.
    const converter = new LibreOfficePdfConverter(new FakeProcessRunner());

    const converted = await converter.convert(Buffer.from('docx'), 'resume');

    expect(converted.ok).toBe(false);
    if (converted.ok) return;
    expect(converted.error.code).toBe(INFRA_ERROR_CODES.capabilityUnavailable);
    // An actionable message, not a spawn error.
    expect(converted.error.message).toContain('libreoffice.org');
  });

  it('reports a conversion failure without leaking a spawn error', async () => {
    const runner = new FakeProcessRunner()
      .withAvailable('soffice')
      .onRunFailure('soffice', ['--headless'], 'source file could not be loaded');
    const converter = new LibreOfficePdfConverter(runner);

    const converted = await converter.convert(Buffer.from('docx'), 'resume');

    expect(converted.ok).toBe(false);
    if (converted.ok) return;
    expect(converted.error.code).toBe(INFRA_ERROR_CODES.pdfConversion);
  });

  it('never writes beside the user files — conversion happens in a temp dir', async () => {
    const runner = new FakeProcessRunner()
      .withAvailable('soffice')
      .onRun('soffice', ['--headless'], '');
    const converter = new LibreOfficePdfConverter(runner);

    await converter.convert(Buffer.from('docx'), 'resume');

    const call = runner.calls.find((candidate) => candidate.cmd === 'soffice');
    const outdirIndex = call?.args.indexOf('--outdir') ?? -1;
    const outdir = call?.args[outdirIndex + 1] ?? '';

    // LibreOffice writes beside its input by default, so the outdir must be a
    // temp directory and the input must live there too.
    expect(outdir).toContain('vitae-pdf-');
    expect(call?.args.at(-1)).toContain(outdir);
  });
});

describe('NodeProcessRunner', () => {
  it('captures stdout from a real process', async () => {
    const result = await new NodeProcessRunner().run('echo', ['hello']);

    expect(result.ok && result.value.stdout.trim()).toBe('hello');
  });

  it('maps a missing binary to its own code', async () => {
    const result = await new NodeProcessRunner().run('vitae-no-such-binary-xyz', []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(INFRA_ERROR_CODES.processNotFound);
  });

  it('maps a non-zero exit to a failure carrying stderr', async () => {
    const result = await new NodeProcessRunner().run('sh', ['-c', 'echo boom >&2; exit 3']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(INFRA_ERROR_CODES.processFailed);
    expect(result.error.message).toContain('boom');
  });

  it('kills and reports a process that overruns its timeout', async () => {
    const result = await new NodeProcessRunner().run('sleep', ['5'], { timeoutMs: 100 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(INFRA_ERROR_CODES.processTimeout);
  });

  it('passes arguments without a shell, so metacharacters stay literal', async () => {
    // If this went through a shell, the `;` would start a second command.
    const result = await new NodeProcessRunner().run('echo', ['a; echo b']);

    expect(result.ok && result.value.stdout.trim()).toBe('a; echo b');
  });

  it('finds a binary that exists and misses one that does not', async () => {
    const runner = new NodeProcessRunner();

    expect(await runner.which('sh')).toBe(true);
    expect(await runner.which('vitae-no-such-binary-xyz')).toBe(false);
  });
});
