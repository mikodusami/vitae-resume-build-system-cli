import { describe, expect, it } from 'vitest';

import { ContentLibrary } from '../../src/domain/model/ContentLibrary.js';
import { DOMAIN_ERROR_CODES } from '../../src/domain/errors/domainError.js';
import {
  makeClaim,
  makeJob,
  makeLibrary,
  makeLibraryData,
  makeProject,
  makeVariant,
} from './fixtures.js';

describe('ContentLibrary', () => {
  it('looks up projects, jobs, claims, and variants by id', () => {
    const library = makeLibrary();

    const project = library.getProject('etl');
    const job = library.getJob('ra');
    const claim = library.getClaim('etl');
    const variant = library.getVariant('data-engineer');

    expect(project.ok && project.value.name).toBe('Project etl');
    expect(job.ok && job.value.title).toBe('Research Assistant');
    expect(claim.ok && claim.value.defensibility).toBe('confident');
    expect(variant.ok && variant.value.label).toBe('Data Engineer');
  });

  it('reports unknown ids with the id in the message', () => {
    const library = makeLibrary();

    const project = library.getProject('nope');

    expect(project.ok).toBe(false);
    if (project.ok) return;
    expect(project.error.code).toBe(DOMAIN_ERROR_CODES.unknownProject);
    expect(project.error.message).toContain('nope');
  });

  it('rejects duplicate project ids at construction', () => {
    const data = makeLibraryData({ projects: [makeProject('etl'), makeProject('etl')] });

    const library = ContentLibrary.create(data);

    expect(library.ok).toBe(false);
    if (library.ok) return;
    expect(library.error[0]?.code).toBe(DOMAIN_ERROR_CODES.duplicateId);
    expect(library.error[0]?.message).toContain('projects');
  });

  it('rejects duplicate job ids at construction', () => {
    const data = makeLibraryData({ jobs: [makeJob('ra'), makeJob('ra')] });

    const library = ContentLibrary.create(data);

    expect(library.ok).toBe(false);
    if (library.ok) return;
    expect(library.error[0]?.code).toBe(DOMAIN_ERROR_CODES.duplicateId);
    expect(library.error[0]?.message).toContain('jobs');
  });

  it('reports duplicate ids across every indexed collection at once', () => {
    const data = makeLibraryData({
      projects: [makeProject('etl'), makeProject('etl')],
      jobs: [makeJob('ra'), makeJob('ra')],
      claims: [makeClaim('etl'), makeClaim('etl')],
      variants: [makeVariant('de'), makeVariant('de')],
    });

    const library = ContentLibrary.create(data);

    expect(library.ok).toBe(false);
    if (library.ok) return;
    expect(library.error).toHaveLength(4);
  });

  it('exposes shared content unchanged', () => {
    const library = makeLibrary();

    expect(library.header.name).toBe('Ada Lovelace');
    expect(library.jobs).toHaveLength(1);
    expect(library.leadership[0]?.title).toBe('Teaching Assistant');
    expect(library.awards.entries).toContain('Hackathon Winner');
    expect(library.listVariants()).toHaveLength(1);
  });
});
