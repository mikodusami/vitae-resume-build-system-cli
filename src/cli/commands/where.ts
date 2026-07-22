/**
 * `vitae where` — which workspace resolved, and by which rule.
 *
 * A small command that is disproportionately useful the first time a build
 * touches a folder you did not expect.
 */

import { toDiagnostic } from '../../app/index.js';
import { Workspace, WORKSPACE_ENV_VAR } from '../../infra/index.js';
import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';

/**
 * Reports the resolved workspace, its paths, and which rule matched.
 *
 * @param context - presenter, output, and global options
 */
export function runWhere(context: CommandContext): ExitCode {
  const explicitDir = context.options.dir;
  const resolved = Workspace.resolve({ explicitDir });

  if (!resolved.ok) {
    context.output.err(context.presenter.diagnostics([toDiagnostic(resolved.error)]));
    context.output.err('\nsearched, in order:');
    for (const location of resolved.error.searched) {
      context.output.err(`  ${location}`);
    }
    return EXIT_CODES.failure;
  }

  const workspace = resolved.value;
  const rule = matchedRule(workspace.root, explicitDir);

  if (context.options.json) {
    context.output.out(
      JSON.stringify(
        {
          root: workspace.root,
          rule,
          contentDir: workspace.contentDir,
          variantsDir: workspace.variantsDir,
          distDir: workspace.distDir,
          archiveDir: workspace.archiveDir,
          themeFile: workspace.themeFile,
          configFile: workspace.configFile,
        },
        null,
        2,
      ),
    );
    return EXIT_CODES.success;
  }

  context.output.out(context.color.path(workspace.root));
  context.output.out(context.color.muted(`  matched by: ${rule}`));
  context.output.out(`  content   ${workspace.contentDir}`);
  context.output.out(`  variants  ${workspace.variantsDir}`);
  context.output.out(`  dist      ${workspace.distDir}`);
  context.output.out(`  archive   ${workspace.archiveDir}`);
  context.output.out(`  theme     ${workspace.themeFile}`);
  context.output.out(`  config    ${workspace.configFile}`);

  return EXIT_CODES.success;
}

/** Names the resolution rule that produced this root. */
function matchedRule(root: string, explicitDir: string | undefined): string {
  if (explicitDir !== undefined) {
    return '--dir';
  }
  if (process.env[WORKSPACE_ENV_VAR] !== undefined) {
    return WORKSPACE_ENV_VAR;
  }

  const home = process.env.HOME ?? '';
  if (home.length > 0 && root === `${home}/.vitae`) {
    return 'home fallback (~/.vitae)';
  }

  return 'walked up from the current directory';
}
