/**
 * `vitae where` — print which workspace resolved.
 *
 * Exists so there is never ambiguity about what you just built. Prints the
 * resolved root and the derived paths; on failure, prints every location that
 * was searched.
 */

import { Workspace, type WorkspaceResolveOptions } from '../../infra/index.js';

/**
 * Reports the resolved workspace and its paths.
 *
 * @param options - discovery overrides, e.g. an explicit `--dir`
 * @returns 0 when a workspace resolved, 1 when none did
 */
export function runWhere(options: WorkspaceResolveOptions = {}): number {
  const resolved = Workspace.resolve(options);

  if (!resolved.ok) {
    console.error(resolved.error.message);
    console.error('\nsearched, in order:');
    for (const location of resolved.error.searched) {
      console.error(`  ${location}`);
    }
    return 1;
  }

  const workspace = resolved.value;
  console.log(workspace.root);
  console.log(`  content   ${workspace.contentDir}`);
  console.log(`  variants  ${workspace.variantsDir}`);
  console.log(`  dist      ${workspace.distDir}`);
  console.log(`  archive   ${workspace.archiveDir}`);
  console.log(`  theme     ${workspace.themeFile}`);
  console.log(`  config    ${workspace.configFile}`);

  return 0;
}
