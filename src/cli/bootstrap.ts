/**
 * The composition root — the one module that constructs concrete adapters.
 *
 * Everything inward of here receives its collaborators, which is what lets the
 * application layer be tested entirely against fakes. When someone asks "where
 * do I swap the module loader", the answer is this file; if `new SomeAdapter()`
 * ever appears in a command handler, the layering has broken.
 */

import { join } from 'node:path';

import { Application, DefaultNaming, type ApplicationDependencies } from '../app/index.js';
import { toDiagnostic } from '../app/index.js';
import type { Diagnostic } from '../domain/index.js';
import { err, ok, type Result } from '../domain/index.js';
import {
  CapabilityRegistry,
  FileArtifactWriter,
  FileContentRepository,
  GitCliProvider,
  JitiModuleLoader,
  LibreOfficePdfConverter,
  NodeProcessRunner,
  PdfPageCounter,
  Workspace,
  loadConfig,
} from '../infra/index.js';
import { ThemeLoader } from '../render/index.js';
import type { GlobalOptions } from './options.js';

/** A wired application, plus what the CLI needs to say about provenance. */
export interface Bootstrapped {
  readonly app: Application;
  readonly workspaceRoot: string;
  /** What this machine can do, probed once — surfaced by `doctor`. */
  readonly capabilities: CapabilityRegistry;
  /** Non-fatal complaints, e.g. unknown config keys. */
  readonly warnings: readonly string[];
  /** Variant used when a command is given none. */
  readonly defaultVariantId: string | undefined;
}

/**
 * Resolves a workspace and assembles the application.
 *
 * Content itself is loaded lazily by the facade, so a command that only needs
 * the workspace path does not pay for reading every content file.
 *
 * @param options - global options; `--dir` overrides discovery
 * @returns the wired application, or diagnostics explaining why not
 */
export async function bootstrap(
  options: GlobalOptions,
): Promise<Result<Bootstrapped, Diagnostic[]>> {
  const workspace = Workspace.resolve({ explicitDir: options.dir });
  if (!workspace.ok) {
    return err([toDiagnostic(workspace.error)]);
  }

  const config = loadConfig(workspace.value.configFile);
  if (!config.ok) {
    return err([toDiagnostic(config.error)]);
  }

  const moduleLoader = new JitiModuleLoader(workspace.value.root);

  const theme = await new ThemeLoader(moduleLoader).load(workspace.value.themeFile);
  if (!theme.ok) {
    return err(theme.error.map(toDiagnostic));
  }

  const prefix = config.value.config.output?.filenamePrefix;

  // One runner for every subprocess: git, LibreOffice, and the probes.
  const processRunner = new NodeProcessRunner();
  const capabilities = await CapabilityRegistry.probe(processRunner);
  const git = new GitCliProvider(processRunner);

  const dependencies: ApplicationDependencies = {
    workspace: workspace.value,
    repository: new FileContentRepository(workspace.value, moduleLoader),
    writer: new FileArtifactWriter(),
    theme: theme.value,
    joinPath: join,
    capabilities,
    // Git and LibreOffice are optional. Wiring them only when present is what
    // makes every consumer degrade with a warning instead of failing.
    ...(capabilities.has('git') ? { stamper: git, differ: git } : {}),
    ...(capabilities.has('libreoffice')
      ? {
          pdfConverter: new LibreOfficePdfConverter(processRunner),
          pageCounter: new PdfPageCounter(),
        }
      : {}),
    ...(config.value.config.pageLimit === undefined
      ? {}
      : { pageLimit: config.value.config.pageLimit }),
    ...(prefix === undefined ? {} : { naming: new DefaultNaming(prefix) }),
  };

  return ok({
    app: new Application(dependencies),
    workspaceRoot: workspace.value.root,
    capabilities,
    warnings: config.value.warnings,
    defaultVariantId: config.value.config.defaultVariant,
  });
}
