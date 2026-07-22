import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES } from '../../src/domain/errors/domainError.js';
import { ResumeComposer, SECTION_HEADINGS } from '../../src/domain/services/ResumeComposer.js';
import type { ResumeDocument } from '../../src/domain/document/resumeDocument.js';
import { makeEducation, makeHeader, makeLibrary, makeProject, makeVariant } from './fixtures.js';

/** Composes, failing the test loudly if composition was expected to succeed. */
function composeOrThrow(variantOverrides = {}): ResumeDocument {
  const library = makeLibrary();
  const result = new ResumeComposer().compose(makeVariant('v', variantOverrides), library);
  if (!result.ok) {
    throw new Error(result.error.map((e) => e.message).join('; '));
  }
  return result.value;
}

describe('ResumeComposer', () => {
  it('emits sections in canonical order', () => {
    const doc = composeOrThrow();

    expect(doc.sections.map((section) => section.heading)).toEqual([
      undefined,
      SECTION_HEADINGS.summary,
      SECTION_HEADINGS.education,
      SECTION_HEADINGS.skills,
      SECTION_HEADINGS.work,
      SECTION_HEADINGS.projects,
      SECTION_HEADINGS.leadership,
    ]);
  });

  it('renders a two-project variant as split lines followed by bullets', () => {
    const doc = composeOrThrow();

    const projects = doc.sections.find((s) => s.heading === SECTION_HEADINGS.projects);
    expect(projects?.blocks.map((block) => block.kind)).toEqual([
      'splitLine',
      'bullet',
      'splitLine',
      'bullet',
    ]);
  });

  it('keeps project order from the variant, not the library', () => {
    const doc = composeOrThrow({ projectIds: ['ranker', 'etl'] });

    const projects = doc.sections.find((s) => s.heading === SECTION_HEADINGS.projects);
    const firstBlock = projects?.blocks[0];
    expect(firstBlock?.kind).toBe('splitLine');
    if (firstBlock?.kind !== 'splitLine') return;
    expect(firstBlock.left[0]?.text).toBe('Project ranker');
  });

  it('adds an https scheme to a scheme-less project link', () => {
    const doc = composeOrThrow({ projectIds: ['etl'] });

    const projects = doc.sections.find((s) => s.heading === SECTION_HEADINGS.projects);
    const firstBlock = projects?.blocks[0];
    expect(firstBlock?.kind).toBe('splitLine');
    if (firstBlock?.kind !== 'splitLine') return;

    // The fixture link is `github.com/ada/etl` — no scheme, which is not
    // something a renderer can open as a URL. The visible text is unchanged;
    // only the link target gains a scheme.
    expect(firstBlock.right[0]?.text).toBe('github.com/ada/etl');
    expect(firstBlock.right[0]?.href).toBe('https://github.com/ada/etl');
  });

  it('leaves a link with an explicit scheme untouched', () => {
    const library = makeLibrary({ projects: [makeProject('etl', { link: 'http://etl.example.com' })] });
    const result = new ResumeComposer().compose(makeVariant('v', { projectIds: ['etl'] }), library);
    if (!result.ok) throw new Error(result.error.map((e) => e.message).join('; '));

    const projects = result.value.sections.find((s) => s.heading === SECTION_HEADINGS.projects);
    const firstBlock = projects?.blocks[0];
    if (firstBlock?.kind !== 'splitLine') throw new Error('expected a split line');

    expect(firstBlock.right[0]?.href).toBe('http://etl.example.com');
  });

  it('leaves an empty project link with no href, rather than linking to nothing', () => {
    const library = makeLibrary({ projects: [makeProject('etl', { link: '' })] });
    const result = new ResumeComposer().compose(makeVariant('v', { projectIds: ['etl'] }), library);
    if (!result.ok) throw new Error(result.error.map((e) => e.message).join('; '));

    const projects = result.value.sections.find((s) => s.heading === SECTION_HEADINGS.projects);
    const firstBlock = projects?.blocks[0];
    if (firstBlock?.kind !== 'splitLine') throw new Error('expected a split line');

    expect(firstBlock.right[0]?.href).toBeUndefined();
  });

  it('centers the header name and contact line', () => {
    const doc = composeOrThrow();

    const header = doc.sections[0];
    expect(header?.blocks).toHaveLength(2);
    const nameBlock = header?.blocks[0];
    expect(nameBlock?.kind).toBe('paragraph');
    if (nameBlock?.kind !== 'paragraph') return;
    expect(nameBlock.align).toBe('center');
    expect(nameBlock.runs[0]?.role).toBe('name');
    expect(nameBlock.runs[0]?.text).toBe('Ada Lovelace');
  });

  it('links an email and a bare URL in the contact line, but not a phone number', () => {
    const doc = composeOrThrow();

    const contactBlock = doc.sections[0]?.blocks[1];
    expect(contactBlock?.kind).toBe('paragraph');
    if (contactBlock?.kind !== 'paragraph') return;

    // Fixture contact: ['ada@example.com', '555-0100', 'github.com/ada'].
    // Each fragment is its own run so a mailto: or https: can attach to just
    // that one, with separator runs carrying no href in between.
    const linked = contactBlock.runs.filter((r) => r.text !== ' | ');
    expect(linked.map((r) => r.text)).toEqual(['ada@example.com', '555-0100', 'github.com/ada']);
    expect(linked[0]?.href).toBe('mailto:ada@example.com');
    // A phone number has no dot and no @ — nothing to link it to, so it must
    // stay plain text rather than the renderer inventing a target.
    expect(linked[1]?.href).toBeUndefined();
    expect(linked[2]?.href).toBe('https://github.com/ada');
  });

  it('leaves a contact entry with its own explicit scheme untouched', () => {
    const library = makeLibrary({
      header: makeHeader({ contact: ['mailto:ada@example.com', 'tel:+15550100'] }),
    });
    const result = new ResumeComposer().compose(makeVariant('v'), library);
    if (!result.ok) throw new Error(result.error.map((e) => e.message).join('; '));

    const contactBlock = result.value.sections[0]?.blocks[1];
    if (contactBlock?.kind !== 'paragraph') throw new Error('expected a paragraph');

    expect(contactBlock.runs[0]?.href).toBe('mailto:ada@example.com');
    expect(contactBlock.runs[2]?.href).toBe('tel:+15550100');
  });

  it('splits institution/location and degree/date onto their own lines', () => {
    const doc = composeOrThrow();

    const education = doc.sections.find((s) => s.heading === SECTION_HEADINGS.education);
    const institutionLine = education?.blocks[0];
    const degreeLine = education?.blocks[1];

    expect(institutionLine?.kind).toBe('splitLine');
    expect(degreeLine?.kind).toBe('splitLine');
    if (institutionLine?.kind !== 'splitLine' || degreeLine?.kind !== 'splitLine') return;

    expect(institutionLine.left[0]?.text).toBe('Analytical University');
    expect(institutionLine.right[0]?.text).toBe('Cambridge, MA');
    expect(degreeLine.left[0]?.text).toBe('B.S. Computer Science');
    expect(degreeLine.right[0]?.text).toBe('May 2026');
  });

  it('shows a GPA line under the degree when the entry has one', () => {
    const library = makeLibrary({
      education: makeEducation({ gpa: { label: 'Major GPA', value: '3.32' } }),
    });
    const result = new ResumeComposer().compose(makeVariant('v'), library);
    if (!result.ok) throw new Error(result.error.map((e) => e.message).join('; '));

    const education = result.value.sections.find((s) => s.heading === SECTION_HEADINGS.education);
    const gpaBlock = education?.blocks[2];
    expect(gpaBlock?.kind).toBe('paragraph');
    if (gpaBlock?.kind !== 'paragraph') return;
    expect(gpaBlock.runs.map((r) => r.text).join('')).toBe('Major GPA: 3.32');
  });

  it('omits the GPA line entirely when the entry has none', () => {
    const doc = composeOrThrow();

    const education = doc.sections.find((s) => s.heading === SECTION_HEADINGS.education);
    // Institution/location, degree/date, coursework — no GPA line between
    // the degree and the coursework when `gpa` is absent.
    expect(education?.blocks).toHaveLength(3);
  });

  it("prefers the variant's coursework over the education default", () => {
    const doc = composeOrThrow({ coursework: 'Compilers' });

    const education = doc.sections.find((s) => s.heading === SECTION_HEADINGS.education);
    const courseworkBlock = education?.blocks[2];
    expect(courseworkBlock?.kind).toBe('paragraph');
    if (courseworkBlock?.kind !== 'paragraph') return;
    expect(courseworkBlock.runs.map((r) => r.text).join('')).toContain('Compilers');
  });

  it('falls back to education coursework when the variant sets none', () => {
    const doc = composeOrThrow({ coursework: '' });

    const education = doc.sections.find((s) => s.heading === SECTION_HEADINGS.education);
    const courseworkBlock = education?.blocks[2];
    if (courseworkBlock?.kind !== 'paragraph') throw new Error('expected coursework paragraph');
    expect(courseworkBlock.runs.map((r) => r.text).join('')).toContain('Algorithms, Databases');
  });

  it('derives document metadata from the owner and the variant', () => {
    const doc = composeOrThrow({ label: 'LLM Infrastructure', summary: 'Infra engineer.' });

    expect(doc.meta.title).toBe('Ada Lovelace — LLM Infrastructure');
    expect(doc.meta.creator).toBe('Ada Lovelace');
    expect(doc.meta.description).toBe('Infra engineer.');
  });

  it('derives distinct keywords from skill group bodies', () => {
    const doc = composeOrThrow({
      skills: [
        { label: 'Languages', body: 'TypeScript, Python' },
        { label: 'Also', body: 'Python, Airflow' },
      ],
    });

    expect(doc.meta.keywords).toEqual(['TypeScript', 'Python', 'Airflow']);
  });

  it('reports an unknown project id, naming the id', () => {
    const library = makeLibrary();

    const result = new ResumeComposer().compose(
      makeVariant('v', { projectIds: ['etl', 'ghost'] }),
      library,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(1);
    expect(result.error[0]?.code).toBe(DOMAIN_ERROR_CODES.unknownProject);
    expect(result.error[0]?.message).toContain('ghost');
  });

  it('accumulates every unknown project id rather than failing on the first', () => {
    const library = makeLibrary();

    const result = new ResumeComposer().compose(
      makeVariant('v', { projectIds: ['ghost', 'etl', 'phantom'] }),
      library,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((e) => e.message).join(' ')).toContain('ghost');
    expect(result.error.map((e) => e.message).join(' ')).toContain('phantom');
    expect(result.error).toHaveLength(2);
  });

  it('produces no font, size, or margin information', () => {
    const doc = composeOrThrow();

    const serialized = JSON.stringify(doc);
    for (const presentational of ['font', 'size', 'margin', 'spacing', 'Calibri']) {
      expect(serialized.toLowerCase()).not.toContain(presentational.toLowerCase());
    }
  });
});
