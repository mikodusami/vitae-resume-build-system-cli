/**
 * `vitae init` — scaffold a workspace.
 *
 * The one command that bypasses the application facade entirely: every other
 * command needs a workspace, and this one creates it. Forcing it through the
 * same path would mean making the facade tolerate a nonexistent workspace,
 * weakening the guarantees every other command relies on.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { WORKSPACE_DIR_NAME } from '../../infra/index.js';
import type { CommandContext } from '../context.js';
import { EXIT_CODES, type ExitCode } from '../exitCodes.js';
import { TEMPLATE_FILES } from '../templates/files.js';

/** Arguments specific to `init`. */
export interface InitArgs {
  /** Directory to scaffold into; defaults to the current one. */
  readonly targetDir: string | undefined;
  /** Overwrite an existing workspace. */
  readonly force: boolean;
  /** Working directory to resolve a relative target against. */
  readonly cwd?: string | undefined;
}

/**
 * Scaffolds a complete `.vitae/` folder.
 *
 * @param context - output and global options
 * @param args - target directory and overwrite flag
 * @returns 0 on success, 1 when the workspace exists and `--force` was not given
 */
export async function runInit(context: CommandContext, args: InitArgs): Promise<ExitCode> {
  const cwd = args.cwd ?? process.cwd();
  const target = args.targetDir ?? cwd;
  const base = isAbsolute(target) ? target : resolve(cwd, target);
  const root = join(base, WORKSPACE_DIR_NAME);

  if (existsSync(root) && !args.force) {
    context.output.err(
      context.color.error(`A workspace already exists at ${root}.`) +
        '\nRefusing to overwrite it. Pass --force if that is really what you want.',
    );
    return EXIT_CODES.failure;
  }

  for (const file of TEMPLATE_FILES) {
    const destination = join(root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.contents);
  }

  context.output.out(printSuccess(context, root));
  return EXIT_CODES.success;
}

/** The success message, including what to do next. */
function printSuccess(context: CommandContext, root: string): string {
  if (context.options.json) {
    return JSON.stringify({ created: root, files: TEMPLATE_FILES.map((file) => file.path) }, null, 2);
  }

  return [
    `${context.color.success('Created')} ${context.color.path(root)}`,
    `  ${TEMPLATE_FILES.length} files, including 4 example variants and a filled-in example resume.`,
    '',
    'Next:',
    `  ${context.color.heading('vitae list')}        see what is on each resume`,
    `  ${context.color.heading('vitae build --all')} write them all to dist/`,
    '',
    'Then edit content/ and variants/ to replace the example with your own.',
    'Start with content/claims.ts — it is the part that makes this tool different.',
  ].join('\n');
}
