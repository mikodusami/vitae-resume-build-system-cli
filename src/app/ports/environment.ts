/**
 * Ports for capabilities the environment may or may not provide.
 *
 * Declared here rather than imported from `infra/` for the same reason
 * `ArtifactWriter` is: the application layer must depend only on interfaces it
 * owns, and the lint rules enforce it. The git and LibreOffice adapters in
 * `infra/` implement these.
 *
 * Everything here is **optional**. Someone who cloned this to build a resume
 * must not be blocked because they have no LibreOffice, so every consumer
 * degrades rather than fails.
 */

import type { DomainError, Result } from '../../domain/index.js';

/** Identifies an external capability. */
export type CapabilityName = 'git' | 'libreoffice';

/** Answers what this machine can do. */
export interface Capabilities {
  /** Whether a capability was found at startup. */
  has(capability: CapabilityName): boolean;
  /** Version string when known, for `doctor`. */
  versionOf(capability: CapabilityName): string | undefined;
}

/**
 * Identifies the content that produced a build.
 *
 * The stamp describes *inputs*, not outputs: the point of an archive is that
 * the recorded hash reconstructs the source that was sent.
 */
export interface BuildStamp {
  /** Short commit hash, or `undefined` when this is not a git repository. */
  readonly hash: string | undefined;
  /**
   * Whether the working tree had uncommitted changes.
   *
   * Load-bearing: a dirty tree means the hash does *not* reconstruct what was
   * built, so this is what forces the `-dirty` suffix and the warning.
   */
  readonly dirty: boolean;
}

/** Supplies the provenance stamp for an archived build. */
export interface ContentStamper {
  stamp(cwd: string): Promise<Result<BuildStamp, DomainError>>;
}

/** Shows what changed in the files a variant depends on. */
export interface SourceDiffer {
  /** Whether `cwd` is inside a repository at all. */
  isRepository(cwd: string): Promise<boolean>;

  /**
   * @param ref - any git revision
   * @param paths - files to restrict the diff to
   */
  diffPaths(
    cwd: string,
    ref: string,
    paths: readonly string[],
  ): Promise<Result<string, DomainError>>;
}

/** Converts a rendered document to PDF. */
export interface PdfConverter {
  /**
   * @param docx - the rendered document bytes
   * @param basename - filename stem, used only for the temporary file
   * @returns the PDF bytes, or an error naming what to install when absent
   */
  convert(docx: Buffer, basename: string): Promise<Result<Buffer, DomainError>>;
}

/** Counts pages in a PDF, in-process. */
export interface PageCounter {
  count(pdf: Buffer): Promise<Result<number, DomainError>>;
}
