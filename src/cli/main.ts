/**
 * The command tree.
 *
 * This file and Commander are the only things in the codebase that know what
 * argv is. Handlers receive typed arguments, call a use case, hand the report
 * to a presenter, and return an exit code — nothing more.
 *
 * The executable itself is `bin.ts`; keeping them separate means importing
 * this module in a test never runs a command.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { RendererFactory, type OutputFormat } from '../app/index.js';
import { runBuild } from './commands/build.js';
import { runCheck } from './commands/check.js';
import { runDiff } from './commands/diff.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runList } from './commands/list.js';
import { runPrep } from './commands/prep.js';
import { runText } from './commands/text.js';
import { runWhere } from './commands/where.js';
import { makeContext } from './context.js';
import { withErrorBoundary } from './errorBoundary.js';
import { EXIT_CODES, type ExitCode } from './exitCodes.js';
import type { GlobalOptions } from './options.js';
import { CONSOLE_OUTPUT, type OutputChannel } from './output.js';

/** Shape Commander produces for the global options. */
interface RawGlobalOptions {
  readonly dir?: string;
  readonly json?: boolean;
  readonly color?: boolean;
  readonly verbose?: boolean;
}

/** Reads the package version, falling back rather than failing a command. */
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

/** Normalizes Commander's options into the tool's own shape. */
function toGlobalOptions(raw: RawGlobalOptions): GlobalOptions {
  return {
    dir: raw.dir,
    json: raw.json === true,
    // Commander models `--no-color` as `color: false`.
    noColor: raw.color === false,
    verbose: raw.verbose === true,
  };
}

/**
 * Builds the command tree.
 *
 * Each action records an exit code rather than calling `process.exit`, so the
 * error boundary and the exit-code policy stay the only things that decide how
 * the process ends.
 *
 * @param output - where commands write; injected so tests can capture it
 * @param setExitCode - receives the code the command produced
 */
function buildProgram(output: OutputChannel, setExitCode: (code: ExitCode) => void): Command {
  const program = new Command();

  program
    .name('vitae')
    .description('Build resume variants as .docx files from typed content.')
    .version(readVersion(), '-v, --version')
    .option('--dir <path>', 'use this workspace instead of discovering one')
    .option('--json', 'emit machine-readable JSON on stdout')
    .option('--no-color', 'disable ANSI colour')
    .option('--verbose', 'print stack traces for unexpected failures')
    .showHelpAfterError();

  /** Context for the current invocation, built from the global options. */
  const context = (): ReturnType<typeof makeContext> =>
    makeContext(toGlobalOptions(program.opts<RawGlobalOptions>()), output);

  program
    .command('init')
    .description('scaffold a .vitae/ workspace with an example resume')
    .argument('[dir]', 'directory to scaffold into (default: current)')
    .option('--force', 'overwrite an existing workspace')
    .action(async (dir: string | undefined, options: { force?: boolean }) => {
      setExitCode(
        await runInit(context(), { targetDir: dir, force: options.force === true }),
      );
    });

  program
    .command('build')
    .description('render variants and write them to dist/')
    .argument('[variant]', 'variant id (default: config.json defaultVariant)')
    .option('--all', 'build every variant')
    .option('--format <format>', 'docx or txt', 'docx')
    .option('--force', 'build even when a claim cannot be defended')
    .option('--out <dir>', 'write here instead of the workspace dist/')
    .option('--archive', 'also write a dated, hash-stamped copy to archive/')
    .option(
      '--label <text>',
      'who this archived copy is for, e.g. a company name (requires --archive, single variant only)',
    )
    .option('--pdf', 'also convert to PDF (requires LibreOffice)')
    .action(
      async (
        variant: string | undefined,
        options: {
          all?: boolean;
          format?: string;
          force?: boolean;
          out?: string;
          archive?: boolean;
          label?: string;
          pdf?: boolean;
        },
      ) => {
        const format = options.format ?? 'docx';
        if (!RendererFactory.isSupported(format)) {
          output.err(`error: unknown format "${format}". Known formats: docx, txt.`);
          setExitCode(EXIT_CODES.failure);
          return;
        }

        setExitCode(
          await runBuild(context(), {
            variantId: variant,
            all: options.all === true,
            format: format satisfies OutputFormat,
            force: options.force === true,
            outputDir: options.out,
            archive: options.archive === true,
            label: options.label,
            pdf: options.pdf === true,
          }),
        );
      },
    );

  program
    .command('check')
    .description('validate claims and composition; writes nothing')
    .argument('[variant]', 'variant id (default: every variant)')
    .option('--pages', 'also enforce the page limit (requires LibreOffice)')
    .action(async (variant: string | undefined, options: { pages?: boolean }) => {
      setExitCode(
        await runCheck(context(), { variantId: variant, pages: options.pages === true }),
      );
    });

  program
    .command('list')
    .description('variants, their projects, and defensibility status')
    .action(async () => {
      setExitCode(await runList(context()));
    });

  program
    .command('where')
    .description('print which .vitae/ folder resolved, and by which rule')
    .action(() => {
      setExitCode(runWhere(context()));
    });

  program
    .command('prep')
    .description("interview checklist from a variant's review notes, as markdown")
    .argument('[variant]', 'variant id (default: config.json defaultVariant)')
    .option('--out <file>', 'write the markdown here instead of stdout')
    .action(async (variant: string | undefined, options: { out?: string }) => {
      setExitCode(await runPrep(context(), { variantId: variant, outFile: options.out }));
    });

  program
    .command('text')
    .description('render a variant as plain text to stdout (ATS-safe)')
    .argument('[variant]', 'variant id (default: config.json defaultVariant)')
    .option('--width <n>', 'line width', '80')
    .action(async (variant: string | undefined, options: { width?: string }) => {
      const width = Number(options.width);
      setExitCode(
        await runText(context(), {
          variantId: variant,
          lineWidth: Number.isFinite(width) && width > 0 ? width : undefined,
        }),
      );
    });

  program
    .command('diff')
    .description("what changed in a variant's content since a git ref")
    .argument('<variant>', 'variant id')
    .argument('<ref>', 'any git revision: a tag, branch, HEAD~3, or hash')
    .action(async (variant: string, ref: string) => {
      setExitCode(await runDiff(context(), { variantId: variant, ref }));
    });

  program
    .command('doctor')
    .description('report what this environment can and cannot do')
    .action(async () => {
      setExitCode(await runDoctor(context()));
    });

  return program;
}

/**
 * Runs one invocation.
 *
 * Exported so tests can drive the real CLI in-process, which is what makes the
 * onboarding test — `init` then `build --all` — fast enough to keep.
 *
 * @param argv - arguments after the node executable and script path
 * @param output - where to write; defaults to the real terminal
 */
export async function runCli(
  argv: readonly string[],
  output: OutputChannel = CONSOLE_OUTPUT,
): Promise<ExitCode> {
  let exitCode: ExitCode = EXIT_CODES.success;

  const program = buildProgram(output, (code) => {
    exitCode = code;
  });

  // Commander would otherwise call process.exit itself, taking the decision
  // away from the exit-code policy — and making this untestable in-process.
  program.exitOverride();
  program.configureOutput({
    writeOut: (text) => output.out(text.trimEnd()),
    writeErr: (text) => output.err(text.trimEnd()),
  });

  const verbose = argv.includes('--verbose');

  return withErrorBoundary(
    async () => {
      try {
        await program.parseAsync([...argv], { from: 'user' });
      } catch (thrown) {
        // `--help` and `--version` throw once exitOverride is set; both are
        // successful outcomes the user asked for.
        const code = (thrown as { code?: string }).code ?? '';
        if (code === 'commander.helpDisplayed' || code === 'commander.version') {
          return EXIT_CODES.success;
        }
        if (code.startsWith('commander.')) {
          return EXIT_CODES.failure;
        }
        throw thrown;
      }

      return exitCode;
    },
    output,
    verbose,
  );
}
