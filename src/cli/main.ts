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

import { RendererFactory, type OutputFormat } from '../app/index.js';
import { runBuild } from './commands/build.js';
import { runCheck } from './commands/check.js';
import { runDemo } from './commands/demo.js';
import { runList } from './commands/list.js';
import { runPrep } from './commands/prep.js';
import { runText } from './commands/text.js';
import { runWhere } from './commands/where.js';
import { wireApplication } from './compositionRoot.js';
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
  diff: 'show content changes since a git ref — arrives with the archive layer',
};

const USAGE = `vitae — build resume variants from typed content

usage: vitae <command> [variant] [--dir <path>]

commands:
  where             print which .vitae/ folder resolved, and its paths
  build <variant>   render and write to dist/ (needs a real .vitae/ folder)
  build --all       build every variant, continuing past failures
  list              variants, their projects, and defensibility status
  demo [variant]    compose a variant and print its document outline
  text [variant]    render a variant as plain text (ATS-safe) to stdout
  check [variant]   validate claims; exits 1 if a claim cannot be defended
  prep [variant]    interview checklist from that variant's review notes

planned:
  init, diff — see layers.md

options:
  --dir <path>      use this workspace instead of discovering one
  --format <fmt>    docx (default) or txt, for \`build\`
  --out <path>      write builds here instead of the workspace's dist/
  --force           build even when a claim cannot be defended
  --all             build every variant
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
  readonly format: string | undefined;
  readonly outputDir: string | undefined;
  readonly force: boolean;
  readonly all: boolean;
}

/** Flags taking a value, mapped to the parsed field they populate. */
const VALUE_FLAGS = {
  '--dir': 'dir',
  '--width': 'width',
  '--format': 'format',
  '--out': 'outputDir',
} as const;

/** A flag that takes a value. */
type ValueFlag = keyof typeof VALUE_FLAGS;

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
  let force = false;
  let all = false;
  const values: Partial<Record<(typeof VALUE_FLAGS)[ValueFlag], string | undefined>> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    const equalsIndex = argument.indexOf('=');
    const flagName = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);

    if (flagName in VALUE_FLAGS) {
      const field = VALUE_FLAGS[flagName as ValueFlag];
      if (equalsIndex === -1) {
        values[field] = argv[index + 1];
        index += 1;
      } else {
        values[field] = argument.slice(equalsIndex + 1);
      }
      continue;
    }

    if (argument === '--force') {
      force = true;
      continue;
    }
    if (argument === '--all') {
      all = true;
      continue;
    }
    if (index === 0) {
      command = argument;
      continue;
    }
    positional ??= argument;
  }

  const width = values.width === undefined ? Number.NaN : Number(values.width);

  return {
    command,
    positional,
    dir: values.dir,
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    format: values.format,
    outputDir: values.outputDir,
    force,
    all,
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
 * Wires the application and runs a build.
 *
 * Building requires a real workspace: unlike the read-only commands, there is
 * nowhere sensible to write artifacts for content compiled into the tool.
 *
 * @param args - the parsed command line
 * @returns the process exit code
 */
async function buildCommand(args: ParsedArgs): Promise<number> {
  const format = args.format ?? 'docx';
  if (!RendererFactory.isSupported(format)) {
    console.error(`error: unknown format "${format}". Known formats: docx, txt.`);
    return EXIT.usage;
  }

  const wired = await wireApplication({ explicitDir: args.dir });
  if (!wired.ok) {
    for (const diagnostic of wired.diagnostics) {
      console.error(`error [${diagnostic.code}]: ${diagnostic.message}`);
    }
    return EXIT.failure;
  }

  for (const warning of wired.wired.warnings) {
    console.error(`warning: ${warning}`);
  }
  console.error(`workspace: ${wired.wired.workspaceRoot}\n`);

  return runBuild(wired.wired, {
    variantId: args.positional,
    all: args.all,
    format: format satisfies OutputFormat,
    force: args.force,
    outputDir: args.outputDir,
  });
}

/**
 * Dispatches one invocation.
 *
 * @param argv - arguments after the node executable and script path
 * @returns the process exit code
 */
async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const { command, positional, dir, width } = args;

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

  if (command === 'build') {
    return buildCommand(args);
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
