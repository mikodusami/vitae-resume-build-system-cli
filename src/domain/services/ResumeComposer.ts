/**
 * ResumeComposer — turns a variant plus a library into a document IR.
 *
 * Composition and validation are deliberately independent: `compose` never
 * refuses to build over an undefendable claim, it only reports *resolution*
 * failures. Whether a validation error blocks writing a file is the
 * application layer's call, which is what keeps a check-only mode or a
 * `--force` flag trivial to add later.
 */

import {
  bullet,
  paragraph,
  run,
  splitLine,
  type Block,
  type DocumentMeta,
  type ResumeDocument,
  type Section,
  type TextRun,
} from '../document/resumeDocument.js';
import type { DomainError } from '../errors/domainError.js';
import type {
  AwardsLine,
  Education,
  Header,
  Job,
  Project,
  SkillGroup,
  Variant,
} from '../model/content.js';
import type { ContentLibrary } from '../model/ContentLibrary.js';
import { err, ok, type Result } from '../primitives/result.js';

/** Section headings, in the canonical order the composer emits them. */
export const SECTION_HEADINGS = {
  summary: 'Summary',
  education: 'Education',
  skills: 'Skills',
  work: 'Experience',
  projects: 'Projects',
  leadership: 'Leadership & Awards',
} as const;

/** Separator between contact fragments and between skill labels and bodies. */
const CONTACT_SEPARATOR = ' | ';

/** Matches an address that already declares its own scheme, e.g. `mailto:`, `https://`. */
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Matches a bare email address with no scheme. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches a bare domain, optionally with a path, and no whitespace at all. */
const BARE_URL_PATTERN = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/\S*)?$/;

/** Assembles a resume document from a variant and its content library. */
export class ResumeComposer {
  /**
   * Composes the document for one variant.
   *
   * Resolution errors accumulate: a variant naming three unknown projects
   * reports all three, so one run tells the author everything to fix.
   *
   * @param variant - the variant to compose
   * @param library - source of shared content and projects
   * @returns the composed document, or every resolution error
   */
  public compose(
    variant: Variant,
    library: ContentLibrary,
  ): Result<ResumeDocument, DomainError[]> {
    const projects = this.resolveProjects(variant, library);
    if (!projects.ok) {
      return err(projects.error);
    }

    const sections: Section[] = [
      { blocks: composeHeaderBlocks(library.header) },
      { heading: SECTION_HEADINGS.summary, blocks: [paragraph([run(variant.summary, 'body')])] },
      {
        heading: SECTION_HEADINGS.education,
        blocks: composeEducationBlocks(library.education, variant),
      },
      { heading: SECTION_HEADINGS.skills, blocks: composeSkillBlocks(variant.skills) },
      { heading: SECTION_HEADINGS.work, blocks: library.jobs.flatMap(composeJobBlocks) },
      { heading: SECTION_HEADINGS.projects, blocks: projects.value.flatMap(composeProjectBlocks) },
      {
        heading: SECTION_HEADINGS.leadership,
        blocks: [
          ...library.leadership.flatMap(composeJobBlocks),
          composeAwardsBlock(library.awards),
        ],
      },
    ];

    return ok({ meta: composeMeta(library.header, variant), sections });
  }

  /**
   * Resolves the variant's ordered project IDs, accumulating unknown IDs.
   *
   * @param variant - the variant whose `projectIds` to resolve
   * @param library - source of projects
   */
  private resolveProjects(
    variant: Variant,
    library: ContentLibrary,
  ): Result<Project[], DomainError[]> {
    const projects: Project[] = [];
    const errors: DomainError[] = [];

    for (const projectId of variant.projectIds) {
      const project = library.getProject(projectId);
      if (project.ok) {
        projects.push(project.value);
      } else {
        errors.push(project.error);
      }
    }

    return errors.length > 0 ? err(errors) : ok(projects);
  }
}

/**
 * Builds document properties for one variant.
 *
 * Keywords come from the variant's own skill bodies, so every file carries
 * ATS-visible metadata matching what is actually on its page.
 */
function composeMeta(header: Header, variant: Variant): DocumentMeta {
  return {
    title: `${header.name} — ${variant.label}`,
    creator: header.name,
    description: variant.summary,
    keywords: deriveKeywords(variant.skills),
  };
}

/**
 * Splits skill bodies into distinct, trimmed keywords, preserving order.
 *
 * @param skills - the variant's skill groups
 */
function deriveKeywords(skills: readonly SkillGroup[]): string[] {
  const keywords = new Set<string>();

  for (const group of skills) {
    for (const fragment of group.body.split(',')) {
      const keyword = fragment.trim();
      if (keyword.length > 0) {
        keywords.add(keyword);
      }
    }
  }

  return [...keywords];
}

/** Name line plus contact line, both centered. */
function composeHeaderBlocks(header: Header): Block[] {
  const contactRuns: TextRun[] = [];
  header.contact.forEach((entry, index) => {
    if (index > 0) {
      contactRuns.push(run(CONTACT_SEPARATOR, 'meta'));
    }
    contactRuns.push(run(entry, 'meta', undefined, classifyContactHref(entry)));
  });

  return [
    paragraph([run(header.name, 'name', ['bold'])], 'center'),
    paragraph(contactRuns, 'center'),
  ];
}

/**
 * Decides whether a contact fragment should become a hyperlink, and to where.
 *
 * Contact entries mix things that should link (an email, a GitHub URL) with
 * things that plainly should not (a phone number, a city) — the fragment's
 * own text is the only signal available, so this stays deliberately narrow:
 * an email becomes `mailto:`, a bare domain becomes `https://`, an address
 * that already declares a scheme is left as-is, and everything else — a
 * phone number, a location — is left unlinked rather than guessed at.
 */
function classifyContactHref(value: string): string | undefined {
  if (SCHEME_PATTERN.test(value)) {
    return value;
  }
  if (EMAIL_PATTERN.test(value)) {
    return `mailto:${value}`;
  }
  if (BARE_URL_PATTERN.test(value)) {
    return `https://${value}`;
  }
  return undefined;
}

/**
 * Institution/location, then degree/date, then GPA and coursework.
 *
 * Institution and degree sit on separate lines — each paired with its own
 * right-aligned counterpart — rather than sharing one line the way the
 * original layout did, because location and graduation date are different
 * kinds of fact and neither reads well pushed to the far end of the other's
 * line.
 */
function composeEducationBlocks(education: Education, variant: Variant): Block[] {
  const blocks: Block[] = [
    splitLine([run(education.institution, 'body', ['bold'])], [run(education.location, 'meta')]),
    splitLine([run(education.degree, 'body')], [run(education.date, 'meta')]),
  ];

  if (education.gpa !== undefined) {
    blocks.push(
      paragraph([
        run(`${education.gpa.label}: `, 'meta', ['bold']),
        run(education.gpa.value, 'meta'),
      ]),
    );
  }

  const coursework = variant.coursework.length > 0 ? variant.coursework : education.coursework;
  if (coursework.length > 0) {
    blocks.push(paragraph([run('Relevant Coursework: ', 'meta', ['bold']), run(coursework, 'meta')]));
  }

  return blocks;
}

/** One paragraph per skill group: bold label, then the body. */
function composeSkillBlocks(skills: readonly SkillGroup[]): Block[] {
  return skills.map((group) =>
    paragraph([run(`${group.label}: `, 'body', ['bold']), run(group.body, 'body')]),
  );
}

/** Title/date split line, an org-and-location line, then the bullets. */
function composeJobBlocks(job: Job): Block[] {
  return [
    splitLine([run(job.title, 'body', ['bold'])], [run(job.date, 'meta')]),
    paragraph([run(job.org, 'body', ['italic']), run(`, ${job.location}`, 'meta')]),
    ...job.bullets.map((text) => bullet([run(text, 'body')])),
  ];
}

/** Name/tech split against the project link, then the bullets. */
function composeProjectBlocks(project: Project): Block[] {
  const left: TextRun[] = [run(project.name, 'body', ['bold'])];
  if (project.tech.length > 0) {
    left.push(run(` | ${project.tech}`, 'body', ['italic']));
  }

  return [
    splitLine(left, [run(project.link, 'link', undefined, toHref(project.link))]),
    ...project.bullets.map((text) => bullet([run(text, 'body')])),
  ];
}

/**
 * Normalizes a project link into a URL a hyperlink can target.
 *
 * Content authors write the human-readable form (`github.com/user/repo`),
 * not a full URL — a scheme-less string is not something Word, or any
 * renderer, can open. `undefined` for an empty link means "no run to link,"
 * distinct from a link that is present but somehow unopenable.
 */
function toHref(link: string): string | undefined {
  if (link.length === 0) {
    return undefined;
  }
  return SCHEME_PATTERN.test(link) ? link : `https://${link}`;
}

/** The single awards line: bold label followed by comma-joined entries. */
function composeAwardsBlock(awards: AwardsLine): Block {
  return paragraph([
    run(`${awards.label}: `, 'body', ['bold']),
    run(awards.entries.join(', '), 'body'),
  ]);
}
