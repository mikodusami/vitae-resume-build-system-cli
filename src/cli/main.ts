#!/usr/bin/env node
/**
 * vitae CLI entry point.
 *
 * Commands operate on a real `.vitae/` workspace when one resolves, and fall
 * back to built-in sample content when none does — always saying which, so you
 * never wonder whose resume you are looking at. A workspace that exists but
 * fails to load is a hard error rather than a silent fallback.
 *
 * Commands still awaiting their layer (`init`, `build`, `diff`) are listed but
 * refuse to pretend: they exit naming the layer that will implement them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCheck } from './commands/check.js';
import { runDemo } from './commands/demo.js';
import { runList } from './commands/list.js';
import { runPrep } from './commands/prep.js';
import { runText } from './commands/text.js';
import { runWhere } from './commands/where.js';
import { resolveContent } from './contentSource.js';

/** Exit codes; `usage` is separated from `failure` so scripts can tell them apart. */
const EXIT = {
  success: 0,
  failure: 1,
  usage: 2,
} as const;

/** Commands the design calls for that a later layer will implement. */
const PLANNED_COMMANDS: Readonly<Record<string, string>> = {
  init: 'scaffold a .vitae/ folder — arrives with the templates layer',
  build: 'write a .docx — arrives with the rendering layer',
  diff: 'show content changes since a git ref — arrives with the archive layer',
};

const USAGE = `vitae — build resume variants from typed content

usage: vitae <command> [variant] [--dir <path>]

commands:
  where             print which .vitae/ folder resolved, and its paths
  list              variants, their projects, and defensibility status
  demo [variant]    compose a variant and print its document outline
  text [variant]    render a variant as plain text (ATS-safe) to stdout
  check [variant]   validate claims; exits 1 if a claim cannot be defended
  prep [variant]    interview checklist from that variant's review notes

planned:
  init, build, diff — see layers.md

options:
  --dir <path>      use this workspace instead of discovering one
  --width <n>       line width for \`text\` (default 80)
  --help, -h        show this message
  --version, -v     print the version

Content is read from the nearest .vitae/ folder (searching up from the current
directory, then ~/.vitae). VITAE_DIR overrides discovery. With no workspace
anywhere, commands fall back to built-in sample content and say so.`;

/** Parsed argv: a command, an optional positional, and the flags we accept. */
interface ParsedArgs {
  readonly command: string;
  readonly positional: string | undefined;
  readonly dir: string | undefined;
  readonly width: number | undefined;
}

/**
 * Parses argv without a dependency.
 *
 * Four commands and one flag do not justify an argument-parsing library; this
 * is the moment to add one if the surface grows.
 *
 * @param argv - arguments after the node executable and script path
 */
function parseArgs(argv: readonly string[]): ParsedArgs {
  let command = '--help';
  let positional: string | undefined;
  let dir: string | undefined;
  let width: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    if (argument === '--dir') {
      dir = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('--dir=')) {
      dir = argument.slice('--dir='.length);
      continue;
    }
    if (argument === '--width') {
      width = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith('--width=')) {
      width = Number(argument.slice('--width='.length));
      continue;
    }
    if (index === 0) {
      command = argument;
      continue;
    }
    positional ??= argument;
  }

  return {
    command,
    positional,
    dir,
    width: width !== undefined && Number.isFinite(width) && width > 0 ? width : undefined,
  };
}

/**
 * Reads the package version from disk.
 *
 * Reading rather than hard-coding keeps the CLI honest when `package.json`
 * bumps; a failure here is non-fatal because a missing version should never
 * stop a command from running.
 */
function readVersion(): string {
  try {
    const packagePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const parsed: unknown = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      return String((parsed as { version: unknown }).version);
    }
  } catch {
    // Fall through to the unknown marker below.
  }
  return 'unknown';
}

/**
 * Dispatches one invocation.
 *
 * @param argv - arguments after the node executable and script path
 * @returns the process exit code
 */
async function main(argv: readonly string[]): Promise<number> {
  const { command, positional, dir, width } = parseArgs(argv);

  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE);
    return EXIT.success;
  }

  if (command === '--version' || command === '-v') {
    console.log(readVersion());
    return EXIT.success;
  }

  const planned = PLANNED_COMMANDS[command];
  if (planned !== undefined) {
    console.error(`vitae ${command} is not implemented yet: ${planned}.`);
    return EXIT.usage;
  }

  if (command === 'where') {
    return runWhere({ explicitDir: dir });
  }

  if (!['demo', 'list', 'check', 'prep', 'text'].includes(command)) {
    console.error(`unknown command: ${command}\n`);
    console.error(USAGE);
    return EXIT.usage;
  }

  const resolved = await resolveContent({ explicitDir: dir });
  if (!resolved.ok) {
    for (const diagnostic of resolved.failure.diagnostics) {
      console.error(`error [${diagnostic.code}]: ${diagnostic.message}`);
    }
    console.error(`\n${resolved.failure.diagnostics.length} problem(s) found; nothing was built.`);
    return EXIT.failure;
  }

  const { library, origin, workspaceRoot, defaultVariantId, warnings } = resolved.content;

  for (const warning of warnings) {
    console.error(`warning: ${warning}`);
  }
  if (origin === 'sample') {
    console.error('note: no .vitae/ folder found — using built-in sample content.\n');
  } else {
    console.error(`workspace: ${workspaceRoot ?? ''}\n`);
  }

  const variantId = positional ?? defaultVariantId ?? library.listVariants()[0]?.id ?? '';

  switch (command) {
    case 'demo':
      return runDemo(library, variantId);
    case 'text':
      return runText(library, variantId, width);
    case 'list':
      return runList(library);
    case 'check':
      return runCheck(library, variantId);
    case 'prep':
      return runPrep(library, variantId);
    default:
      return EXIT.usage;
  }
}

process.exitCode = await main(process.argv.slice(2));
