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

  it('renders a project link as a real clickable hyperlink, not styled text', async () => {
    const buffer = await new DocxRenderer().render(makeDocument());
    const xml = readZipEntry(buffer, 'word/document.xml');
    const rels = readZipEntry(buffer, 'word/_rels/document.xml.rels');

    // A `<w:hyperlink>` field pointing at a relationship id, not merely a run
    // styled to look like a link — text with no field behind it is not
    // clickable in any viewer, which was the bug this closes.
    const match = xml.match(/<w:hyperlink[^>]*r:id="(rId[a-z0-9_-]+)"/);
    expect(match).not.toBeNull();

    const relId = match?.[1] ?? '';
    expect(rels).toContain(`Id="${relId}"`);
    expect(rels).toContain('TargetMode="External"');
    // The fixture project link has no scheme; the composer must have added one,
    // or Word cannot open it as a URL at all.
    expect(rels).toMatch(/Target="https:\/\/github\.com\/ada\/[^"]+"/);
  });

  it('links the header email and URL, but never the phone number', async () => {
    const buffer = await new DocxRenderer().render(makeDocument());
    const rels = readZipEntry(buffer, 'word/_rels/document.xml.rels');

    // Fixture contact: ['ada@example.com', '555-0100', 'github.com/ada'] — one
    // run per fragment, so only two of the three should ever become a
    // hyperlink relationship.
    expect(rels).toContain('Target="mailto:ada@example.com"');
    expect(rels).toContain('Target="https://github.com/ada"');
    expect(rels).not.toContain('555-0100');
  });

  it('right-aligns the second half of a split line', async () => {
    const xml = await renderDocumentXml();

    // The date sits in its own right-aligned cell. Asserted structurally
    // because this is the property that was actually broken in the field.
    expect(xml).toContain('<w:jc w:val="right"/>');
  });

  it('renders split lines as tables, not tab stops', async () => {
    const xml = await renderDocumentXml();

    expect(xml).toContain('<w:tbl>');
    // A right tab stop is valid OOXML that Word honours, but Apple's importer
    // discards custom tab stops outright and Google Docs dropped the tab
    // character, so dates collided with titles. Never regress to that.
    expect(xml).not.toContain('w:val="right" w:pos=');
    expect(xml).not.toContain('<w:tab/>');
  });

  it('derives column widths from the page geometry', async () => {
    const xml = await renderDocumentXml();
    const contentWidth = DEFAULT_THEME.page.width - DEFAULT_THEME.page.margin * 2;

    // The grid must agree with the cells, or renderers that lay out from
    // tblGrid put the right column somewhere else entirely.
    expect(xml).toContain(`<w:tblW w:type="dxa" w:w="${contentWidth}"/>`);
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');

    const grid = xml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] ?? '';
    const columns = [...grid.matchAll(/w:w="(\d+)"/g)].map((m) => Number(m[1]));
    expect(columns).toHaveLength(2);
    expect(columns[0]! + columns[1]!).toBe(contentWidth);
  });

  it('tracks a changed page margin without any other theme edit', async () => {
    const theme = { ...DEFAULT_THEME, page: { ...DEFAULT_THEME.page, margin: 1440 } };
    const xml = await renderDocumentXml(theme);

    // The old design had a separate rightTab constant that silently had to
    // equal width - 2 x margin. Widening the margin now just works.
    expect(xml).toContain(`<w:tblW w:type="dxa" w:w="${12240 - 2880}"/>`);
  });

  it('makes the layout tables invisible on every edge', async () => {
    const xml = await renderDocumentXml();

    // A table with no border definition picks up a default hairline grid in
    // several renderers — a faint box around every job title.
    expect(xml).toContain('<w:tblBorders>');
    expect(xml).not.toContain('w:val="single" w:sz="4" w:color="auto"');
  });

  it('keeps split lines flush with surrounding paragraphs', async () => {
    const xml = await renderDocumentXml();

    // Default cell padding would indent every job header relative to its
    // bullets. All four margins must be explicitly zero.
    const margins = xml.match(/<w:tblCellMar>[\s\S]*?<\/w:tblCellMar>/);
    expect(margins?.[0] ?? '').not.toMatch(/w:w="[1-9]/);
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

/**
 * Docx assigns each hyperlink a random relationship id (`nanoid()`, internal
 * to the library, with no way to seed it) every time a document is packed.
 * It is plumbing — like the zip entry timestamps already excluded from the
 * determinism claim below — not content, so it is normalized out before
 * comparing rather than treated as a genuine difference.
 */
function normalizeVolatileIds(xml: string): string {
  return xml.replace(/r:id="rId[a-z0-9_-]+"/g, 'r:id="rId_STABLE"');
}

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
    expect(normalizeVolatileIds(first)).toBe(normalizeVolatileIds(second));
  });
});
