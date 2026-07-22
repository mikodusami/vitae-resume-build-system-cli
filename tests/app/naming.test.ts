import { describe, expect, it } from 'vitest';

import { DefaultNaming } from '../../src/app/naming/ArtifactNaming.js';
import { RendererFactory } from '../../src/app/render/RendererFactory.js';
import { DEFAULT_THEME } from '../../src/render/theme/Theme.js';
import { makeVariant } from '../domain/fixtures.js';

describe('DefaultNaming', () => {
  it('builds the latest-build filename from prefix, variant, and format', () => {
    const naming = new DefaultNaming();

    expect(naming.filenameFor(makeVariant('llm-infrastructure'), 'docx')).toBe(
      'resume_llm_infrastructure.docx',
    );
    expect(naming.filenameFor(makeVariant('llm-infrastructure'), 'txt')).toBe(
      'resume_llm_infrastructure.txt',
    );
  });

  it('takes its prefix from config', () => {
    expect(new DefaultNaming('ada').filenameFor(makeVariant('backend'), 'docx')).toBe(
      'ada_backend.docx',
    );
  });

  it('strips characters that would turn a filename into a path', () => {
    // A variant ID becomes a path; a stray slash must not become a write
    // somewhere surprising.
    const name = new DefaultNaming().filenameFor(makeVariant('../../etc/passwd'), 'txt');

    expect(name).toBe('resume_etc_passwd.txt');
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });
});

describe('RendererFactory', () => {
  it('builds a docx renderer for docx', () => {
    const created = new RendererFactory(DEFAULT_THEME).create('docx');

    expect(created.ok).toBe(true);
  });

  it('builds a text renderer for txt', () => {
    const created = new RendererFactory(DEFAULT_THEME).create('txt');

    expect(created.ok).toBe(true);
  });

  it('returns a typed error for an unknown format rather than throwing', () => {
    const created = new RendererFactory(DEFAULT_THEME).create('pdf');

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe('UNKNOWN_FORMAT');
    // The message should tell the user what they can ask for instead.
    expect(created.error.message).toContain('docx');
    expect(created.error.message).toContain('txt');
  });

  it('narrows supported format strings', () => {
    expect(RendererFactory.isSupported('docx')).toBe(true);
    expect(RendererFactory.isSupported('pdf')).toBe(false);
  });
});
