/**
 * Loading-layer error hierarchy.
 *
 * Every error extends the domain's `DomainError`, so the CLI formats a
 * missing content file and an unknown project ID through one code path. The
 * point of this layer is that no zod or jiti stack trace ever reaches a user:
 * everything funnels through these types.
 */

import { DomainError } from '../domain/index.js';

/** Stable identifiers for every loading failure. */
export const INFRA_ERROR_CODES = {
  workspaceNotFound: 'WORKSPACE_NOT_FOUND',
  moduleLoad: 'MODULE_LOAD_FAILED',
  schemaValidation: 'SCHEMA_VALIDATION_FAILED',
  missingContentFile: 'MISSING_CONTENT_FILE',
  variantIdMismatch: 'VARIANT_ID_MISMATCH',
  configInvalid: 'CONFIG_INVALID',
  processFailed: 'PROCESS_FAILED',
  processTimeout: 'PROCESS_TIMEOUT',
  processNotFound: 'PROCESS_NOT_FOUND',
  git: 'GIT_FAILED',
  capabilityUnavailable: 'CAPABILITY_UNAVAILABLE',
  pdfConversion: 'PDF_CONVERSION_FAILED',
  pdfRead: 'PDF_READ_FAILED',
} as const;

/** The `code` of any concrete loading error. */
export type InfraErrorCode = (typeof INFRA_ERROR_CODES)[keyof typeof INFRA_ERROR_CODES];

/** No `.vitae/` folder could be resolved from any of the search locations. */
export class WorkspaceNotFoundError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.workspaceNotFound;

  /**
   * @param searched - locations tried, in order, so the message can show the
   * user exactly where the tool looked
   */
  public constructor(public readonly searched: readonly string[]) {
    super(
      `No .vitae/ folder found. Looked in: ${searched.join(', ')}. ` +
        'Run `vitae init` to create one.',
    );
  }
}

/** A user content module failed to import — a syntax error or a throw. */
export class ModuleLoadError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.moduleLoad;

  /**
   * @param filePath - the module that failed
   * @param reason - the original message, already stripped of the stack
   */
  public constructor(
    public readonly filePath: string,
    public readonly reason: string,
  ) {
    super(`${filePath}: ${reason}`);
  }
}

/** A loaded module did not match its schema. */
export class SchemaValidationError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.schemaValidation;

  /**
   * @param filePath - the file that failed validation
   * @param fieldPath - dotted path within the file, e.g. `skills[2].label`
   * @param detail - what was expected versus what arrived
   */
  public constructor(
    public readonly filePath: string,
    public readonly fieldPath: string,
    public readonly detail: string,
  ) {
    super(`${filePath}: ${fieldPath} — ${detail}`);
  }
}

/** A required file under `content/` is absent. */
export class MissingContentFileError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.missingContentFile;

  public constructor(public readonly expectedPath: string) {
    super(`Missing required content file: ${expectedPath}`);
  }
}

/**
 * A variant file's declared `id` disagrees with its filename.
 *
 * Reported rather than silently preferring one, because ambiguity about which
 * name wins costs an hour the day it finally matters.
 */
export class VariantIdMismatchError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.variantIdMismatch;

  public constructor(
    public readonly filePath: string,
    public readonly declaredId: string,
    public readonly fileNameId: string,
  ) {
    super(
      `${filePath}: variant declares id "${declaredId}" but the filename says ` +
        `"${fileNameId}". Rename the file or change the id so they agree.`,
    );
  }
}

/**
 * A subprocess failed, timed out, or was not installed.
 *
 * One class with three codes rather than three classes: callers branch on the
 * code, and the distinction that matters to a user — "it broke" versus "it is
 * not installed" — is carried by the code, not the type.
 */
export class ProcessError extends DomainError {
  public override readonly code:
    | typeof INFRA_ERROR_CODES.processFailed
    | typeof INFRA_ERROR_CODES.processTimeout
    | typeof INFRA_ERROR_CODES.processNotFound;

  /**
   * @param command - the binary that was run
   * @param code - which kind of failure
   * @param detail - stderr, or a description of the timeout
   */
  public constructor(
    public readonly command: string,
    code: ProcessError['code'],
    detail: string,
  ) {
    super(`${command}: ${detail}`);
    this.code = code;
  }
}

/** A git operation failed. */
export class GitError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.git;

  public constructor(detail: string) {
    super(`git: ${detail}`);
  }
}

/**
 * A feature was asked for that this machine cannot provide.
 *
 * Always names the install step: "soffice not found" tells a user nothing they
 * can act on, and this tool must stay usable by someone who just wants to
 * build a resume.
 */
export class CapabilityUnavailableError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.capabilityUnavailable;

  /**
   * @param capability - what was missing, e.g. `libreoffice`
   * @param needed - the feature that required it
   * @param remedy - how to install it
   */
  public constructor(
    public readonly capability: string,
    needed: string,
    remedy: string,
  ) {
    super(`${needed} requires ${capability}, which was not found. ${remedy}`);
  }
}

/** LibreOffice ran but produced no usable PDF. */
export class PdfConversionError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.pdfConversion;

  public constructor(detail: string) {
    super(`PDF conversion failed: ${detail}`);
  }
}

/** A PDF buffer could not be parsed. */
export class PdfReadError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.pdfRead;

  public constructor(detail: string) {
    super(`Could not read PDF: ${detail}`);
  }
}

/** `config.json` exists but does not parse or validate. */
export class ConfigInvalidError extends DomainError {
  public override readonly code = INFRA_ERROR_CODES.configInvalid;

  public constructor(
    public readonly filePath: string,
    public readonly detail: string,
  ) {
    super(`${filePath}: ${detail}`);
  }
}
