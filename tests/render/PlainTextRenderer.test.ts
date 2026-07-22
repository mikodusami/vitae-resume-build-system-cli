import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PlainTextRenderer } from '../../src/render/text/PlainTextRenderer.js';
import { makeDocument } from './fixtures.js';

const GOLDEN_FILE = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'resume.txt');

describe('PlainTextRenderer', () => {
  it('matches the committed golden file', async () => {
    const rendered = await new PlainTextRenderer().render(makeDocument());

    // Set UPDATE_GOLDEN=1 to rewrite it after an intentional IR change; the
    // diff it produces is the fastest regression signal this repo has.
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(GOLDEN_FILE, rendered);
    }

    expect(rendered).toBe(readFileSync(GOLDEN_FILE, 'utf8'));
  });

  it('needs no theme at all — the proof the IR is not docx-shaped', async () => {
    // The constructor takes only a line width. If rendering readable text ever
    // required a font or a margin, the document model would have leaked.
    const rendered = await new PlainTextRenderer().render(makeDocument());

    expect(rendered).toContain('Ada Lovelace');
    expect(rendered).not.toContain('Calibri');
  });

  it('renders headings uppercase, bullets with a dash', async () => {
    const rendered = await new PlainTextRenderer().render(makeDocument());

    expect(rendered).toContain('EXPERIENCE');
    expect(rendered).toContain('- Built an ingestion pipeline');
  });

  it('right-aligns the second half of a split line at the given width', async () => {
    const rendered = await new PlainTextRenderer(60).render(makeDocument());

    const dateLine = rendered.split('\n').find((line) => line.includes('Jan 2025 - Present'));
    expect(dateLine).toBeDefined();
    expect(dateLine).toHaveLength(60);
    expect(dateLine?.endsWith('Jan 2025 - Present')).toBe(true);
  });

  it('keeps both sides rather than truncating when they do not fit', async () => {
    const rendered = await new PlainTextRenderer(10).render(makeDocument());

    expect(rendered).toContain('Research Assistant Jan 2025 - Present');
  });
});
