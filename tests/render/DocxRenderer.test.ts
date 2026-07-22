import { describe, expect, it } from 'vitest';

import { DocxRenderer } from '../../src/render/docx/DocxRenderer.js';
import { DEFAULT_THEME } from '../../src/render/theme/Theme.js';
import { makeDocument, readZipEntry } from './fixtures.js';

/** Renders the fixture document and returns its main body XML. */
async function renderDocumentXml(theme = DEFAULT_THEME): Promise<string> {
  const buffer = await new DocxRenderer(theme).render(makeDocument());
  return readZipEntry(buffer, 'word/document.xml');
}

describe('DocxRenderer document body', () => {
  it('produces a real .docx container', async () => {
    const buffer = await new DocxRenderer().render(makeDocument());

    // "PK" — the zip magic every Office file starts with.
    expect(buffer.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(readZipEntry(buffer, '[Content_Types].xml')).toContain('wordprocessingml');
  });

  it('renders bullets through the numbering config, never as literal characters', async () => {
    const xml = await renderDocumentXml();

    expect(xml).toContain('<w:numPr>');
    // A literal • would look identical on screen but is not a list to Word, to
    // an ATS parser, or to a screen reader.
    expect(xml).not.toContain('•');
  });

  it('gives split lines a right tab stop at the themed position', async () => {
    const xml = await renderDocumentXml();

    expect(xml).toContain(`w:val="right" w:pos="${DEFAULT_THEME.rightTab}"`);
    expect(xml).toContain('<w:tab/>');
  });

  it('moves the tab stop when the theme moves it', async () => {
    const xml = await renderDocumentXml({ ...DEFAULT_THEME, rightTab: 9000 });

    expect(xml).toContain('w:pos="9000"');
    expect(xml).not.toContain(`w:pos="${DEFAULT_THEME.rightTab}"`);
  });

  it('draws the rule under section headings', async () => {
    const xml = await renderDocumentXml();

    expect(xml).toContain('<w:pBdr>');
    expect(xml).toContain(`w:color="${DEFAULT_THEME.sectionRule.color}"`);
  });

  it('omits the rule when the theme disables it', async () => {
    const xml = await renderDocumentXml({
      ...DEFAULT_THEME,
      sectionRule: { ...DEFAULT_THEME.sectionRule, enabled: false },
    });

    expect(xml).not.toContain('<w:pBdr>');
  });

  it('sets page size explicitly so the output is never silently A4', async () => {
    const xml = await renderDocumentXml();

    expect(xml).toContain(`w:w="${DEFAULT_THEME.page.width}"`);
    expect(xml).toContain(`w:h="${DEFAULT_THEME.page.height}"`);
  });

  it('applies the themed font and role sizes', async () => {
    const xml = await renderDocumentXml({ ...DEFAULT_THEME, font: 'Georgia' });

    expect(xml).toContain('w:ascii="Georgia"');
    // The name run carries the `name` role's size.
    expect(xml).toContain(`w:val="${DEFAULT_THEME.sizes.name}"`);
  });

  it('never emits a newline inside a run', async () => {
    const xml = await renderDocumentXml();

    const runTexts = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]);
    expect(runTexts.length).toBeGreaterThan(0);
    for (const text of runTexts) {
      expect(text).not.toContain('\n');
    }
  });

  it('renders section headings in uppercase, and nothing the IR did not say', async () => {
    const xml = await renderDocumentXml();

    expect(xml).toContain('EXPERIENCE');
    expect(xml).toContain('Ada Lovelace');
    // The renderer must not invent content the document never contained.
    expect(xml).not.toContain('Lorem');
  });
});

describe('DocxRenderer document properties', () => {
  it('carries DocumentMeta into the core properties', async () => {
    const doc = makeDocument();
    const buffer = await new DocxRenderer().render(doc);

    const core = readZipEntry(buffer, 'docProps/core.xml');
    expect(core).toContain(doc.meta.title);
    expect(core).toContain(doc.meta.creator);
    expect(core).toContain('vitae');
  });

  it('carries the derived keywords for ATS visibility', async () => {
    const doc = makeDocument();
    const buffer = await new DocxRenderer().render(doc);

    const core = readZipEntry(buffer, 'docProps/core.xml');
    for (const keyword of doc.meta.keywords) {
      expect(core).toContain(keyword);
    }
  });
});

describe('DocxRenderer determinism', () => {
  it('renders identical content for identical input', async () => {
    const doc = makeDocument();
    const renderer = new DocxRenderer();

    const first = readZipEntry(await renderer.render(doc), 'word/document.xml');
    const second = readZipEntry(await renderer.render(doc), 'word/document.xml');

    // Whole-buffer byte-identity is not achievable: docx 9.x stamps
    // dcterms:created/modified from its own `new Date()` with no override, and
    // the zip records entry timestamps. The rendered content is what must be
    // stable, and nothing downstream depends on docx bytes — the archive
    // convention stamps builds with the git hash of the source content.
    expect(first).toBe(second);
  });
});
