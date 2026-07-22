/**
 * The composition root — the one place concrete adapters are constructed.
 *
 * Everything inward of here depends on interfaces only, which is what lets the
 * application layer be tested entirely against fakes. If a `new
 * JitiModuleLoader(...)` ever appears outside this file, that property is gone.
 *
 * Unlike the read-only commands, building requires a real workspace: there is
 * nowhere sensible to write artifacts for content compiled into the tool.
 */

import { join } from 'node:path';

import { Application, type ApplicationDependencies } from '../app/index.js';
import type { DomainError } from '../domain/index.js';
import {
  FileArtifactWriter,
  FileContentRepository,
  JitiModuleLoader,
  Workspace,
  loadConfig,
  type WorkspaceResolveOptions,
} from '../infra/index.js';
import { DefaultNaming } from '../app/index.js';
import { ThemeLoader } from '../render/index.js';

/** A wired application plus the provenance the CLI reports. */
export interface WiredApplication {
  readonly app: Application;
  readonly workspaceRoot: string;
  /** Non-fatal complaints, e.g. unknown config keys. */
  readonly warnings: readonly string[];
  /** Variant used when a command is given none. */
  readonly defaultVariantId: string | undefined;
}

/**
 * Resolves a workspace and wires every adapter into an `Application`.
 *
 * @param options - workspace discovery overrides, e.g. an explicit `--dir`
 * @returns the wired application, or the diagnostics explaining why not
 */
export async function wireApplication(
  options: WorkspaceResolveOptions = {},
): Promise<
  { ok: true; wired: WiredApplication } | { ok: false; diagnostics: readonly DomainError[] }
> {
  const workspace = Workspace.resolve(options);
  if (!workspace.ok) {
    return { ok: false, diagnostics: [workspace.error] };
  }

  const config = loadConfig(workspace.value.configFile);
  if (!config.ok) {
    return { ok: false, diagnostics: [config.error] };
  }

  const moduleLoader = new JitiModuleLoader(workspace.value.root);

  const theme = await new ThemeLoader(moduleLoader).load(workspace.value.themeFile);
  if (!theme.ok) {
    return { ok: false, diagnostics: theme.error };
  }

  const prefix = config.value.config.output?.filenamePrefix;

  const dependencies: ApplicationDependencies = {
    workspace: workspace.value,
    repository: new FileContentRepository(workspace.value, moduleLoader),
    writer: new FileArtifactWriter(),
    theme: theme.value,
    joinPath: join,
    ...(prefix === undefined ? {} : { naming: new DefaultNaming(prefix) }),
  };

  return {
    ok: true,
    wired: {
      app: new Application(dependencies),
      workspaceRoot: workspace.value.root,
      warnings: config.value.warnings,
      defaultVariantId: config.value.config.defaultVariant,
    },
  };
}
