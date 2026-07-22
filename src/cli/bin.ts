#!/usr/bin/env node
/**
 * The executable.
 *
 * Deliberately trivial: it exists so that `main.ts` can be imported by tests
 * without running a command, and so the process's exit code is set in exactly
 * one place.
 */

import { runCli } from './main.js';

process.exitCode = await runCli(process.argv.slice(2));
