#!/usr/bin/env node
/**
 * vitae CLI entry point.
 *
 * Layer 1 built the domain only, so the commands wired up here are the ones
 * the domain can answer on its own — composition and the claims gate — running
 * against built-in sample content. Commands that need the filesystem
 * (`init`, `build`, `where`, `diff`) are listed but refuse to pretend: they
 * exit with a message naming the layer that will implement them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContentLibrary } from '../domain/index.js';
import { runCheck } from './commands/check.js';
import { runDemo } from './commands/demo.js';
import { runList } from './commands/list.js';
import { runPrep } from './commands/prep.js';
import { SAMPLE_CONTENT } from './sampleContent.js';

/** Exit codes; `usage` is separated from `failure` so scripts can tell them apart. */
const EXIT = {
  success: 0,
  failure: 1,
  usage: 2,
} as const;

/** Commands the design calls for that a later layer will implement. */
const PLANNED_COMMANDS: Readonly<Record<string, string>> = {
  init: 'scaffold a .vitae/ folder — arrives with the content layer',
  build: 'write a .docx — arrives with the rendering layer',
  where: 'print the resolved .vitae/ folder — arrives with the content layer',
  diff: 'show content changes since a git ref — arrives with the archive layer',
};

const USAGE = `vitae — build resume variants from typed content

usage: vitae <command> [variant]

available now (running against built-in sample content):
  demo [variant]    compose a variant and print its document outline
  list              variants, their projects, and defensibility status
  check [variant]   validate claims; exits 1 if any claim cannot be defended
  prep [variant]    interview checklist from that variant's review notes

planned:
  init, build, where, diff — see layers.md

  --help, -h        show this message
  --version, -v     print the version

Note: content still comes from a built-in sample. Reading your own .vitae/
folder arrives in the next layer.`;

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
function main(argv: readonly string[]): number {
  const [command = '--help', variantArg] = argv;

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

  const library = ContentLibrary.create(SAMPLE_CONTENT);
  if (!library.ok) {
    for (const error of library.error) {
      console.error(`error [${error.code}]: ${error.message}`);
    }
    return EXIT.failure;
  }

  const defaultVariant = library.value.listVariants()[0]?.id ?? '';
  const variantId = variantArg ?? defaultVariant;

  switch (command) {
    case 'demo':
      return runDemo(library.value, variantId);
    case 'list':
      return runList(library.value);
    case 'check':
      return runCheck(library.value, variantId);
    case 'prep':
      return runPrep(library.value, variantId);
    default:
      console.error(`unknown command: ${command}\n`);
      console.error(USAGE);
      return EXIT.usage;
  }
}

process.exitCode = main(process.argv.slice(2));
