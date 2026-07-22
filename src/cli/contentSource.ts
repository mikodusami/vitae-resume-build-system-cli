/**
 * Decides where a command's content comes from.
 *
 * One rule governs this file: a workspace that exists but fails to load is a
 * hard error, never a quiet fall back to the sample. Silently building someone
 * else's example resume because your own content has a typo would be the worst
 * possible failure mode.
 */

import {
  ContentLibrary,
  type ContentLibraryData,
  type DomainError,
} from '../domain/index.js';
import {
  FileContentRepository,
  JitiModuleLoader,
  Workspace,
  loadConfig,
  type WorkspaceResolveOptions,
} from '../infra/index.js';
import { SAMPLE_CONTENT } from './sampleContent.js';

/** Where the content a command is about to use came from. */
export type ContentOrigin = 'workspace' | 'sample';

/** A library plus the provenance a command needs in order to be honest about it. */
export interface ResolvedContent {
  readonly library: ContentLibrary;
  readonly origin: ContentOrigin;
  /** Absolute path to the `.vitae/` folder, when one was used. */
  readonly workspaceRoot?: string | undefined;
  /** Variant to use when a command is given none. */
  readonly defaultVariantId: string | undefined;
  /** Non-fatal complaints, e.g. unknown config keys. */
  readonly warnings: readonly string[];
}

/** Failure to produce a library, with everything wrong reported at once. */
export interface ContentLoadFailure {
  readonly diagnostics: readonly DomainError[];
}

/** Builds the fallback library from content compiled into the tool. */
function sampleLibrary(): ContentLibrary {
  const library = ContentLibrary.create(SAMPLE_CONTENT as ContentLibraryData);
  if (!library.ok) {
    // The sample ships with the tool; a duplicate ID here is our bug, not the
    // user's, and there is nothing they could do about it.
    throw new Error(`built-in sample content is invalid: ${library.error[0]?.message ?? ''}`);
  }
  return library.value;
}

/**
 * Resolves the content a command should operate on.
 *
 * @param options - workspace discovery overrides, e.g. an explicit `--dir`
 * @returns the library and its provenance, or the diagnostics explaining why
 * a discovered workspace could not be loaded
 */
export async function resolveContent(
  options: WorkspaceResolveOptions = {},
): Promise<{ ok: true; content: ResolvedContent } | { ok: false; failure: ContentLoadFailure }> {
  const workspace = Workspace.resolve(options);

  if (!workspace.ok) {
    // No workspace anywhere is not an error yet — the tool still demonstrates
    // itself against sample content until `vitae init` exists.
    return {
      ok: true,
      content: {
        library: sampleLibrary(),
        origin: 'sample',
        defaultVariantId: undefined,
        warnings: [],
      },
    };
  }

  const repository = new FileContentRepository(
    workspace.value,
    new JitiModuleLoader(workspace.value.root),
  );
  const loaded = await repository.load();
  if (!loaded.ok) {
    return { ok: false, failure: { diagnostics: loaded.error } };
  }

  const config = loadConfig(workspace.value.configFile);
  if (!config.ok) {
    return { ok: false, failure: { diagnostics: [config.error] } };
  }

  return {
    ok: true,
    content: {
      library: loaded.value,
      origin: 'workspace',
      workspaceRoot: workspace.value.root,
      defaultVariantId: config.value.config.defaultVariant,
      warnings: config.value.warnings,
    },
  };
}
