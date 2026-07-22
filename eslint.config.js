// @ts-check
/**
 * ESLint flat config.
 *
 * Beyond ordinary type-aware linting, this file mechanically enforces the
 * Clean/Hexagonal dependency rule: imports may only point inward
 * (cli -> app -> domain, infra -> domain). Without enforcement here the
 * layering erodes silently, so treat any change to the boundary blocks below
 * as an architectural decision, not a lint tweak.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Node built-ins the domain layer must never reach for, in either spelling. */
const NODE_BUILTIN_PATTERNS = ['node:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'url', 'crypto'];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // The domain is the innermost layer: it depends on nothing.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/app/**',
                '**/infra/**',
                '**/cli/**',
                '**/render/**',
                '../app/*',
                '../infra/*',
                '../cli/*',
                '../render/*',
              ],
              message: 'domain/ may not import from outer layers (app, infra, render, cli).',
            },
            {
              group: NODE_BUILTIN_PATTERNS,
              message: 'domain/ must stay free of I/O: no Node built-ins.',
            },
            {
              group: ['docx', 'zod', 'commander', 'jiti'],
              message: 'domain/ must stay free of rendering and parsing libraries.',
            },
          ],
        },
      ],
    },
  },
  {
    // The application layer orchestrates use cases. It may know the domain and
    // the renderers, but never concrete I/O adapters and never the terminal.
    files: ['src/app/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infra/**', '**/cli/**'],
              message:
                'app/ may not import concrete adapters (infra) or the CLI. ' +
                'Depend on a port and let the composition root inject it.',
            },
            {
              group: [...NODE_BUILTIN_PATTERNS, 'docx', 'chalk', 'commander'],
              message: 'app/ must stay free of I/O, rendering libraries, and terminal concerns.',
            },
          ],
        },
      ],
      // Use cases return reports; Layer 5 decides how to display them and what
      // exit code they imply. This is the rule most likely to be violated under
      // deadline pressure, so it is enforced rather than merely agreed.
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'exit',
          message: 'app/ never exits — return a report and let the CLI choose the exit code.',
        },
        {
          object: 'process',
          property: 'stdout',
          message: 'app/ never writes to stdout — return a report instead.',
        },
      ],
    },
  },
  {
    // Adapters implement ports declared by domain/ and app/, so importing a
    // port from app/ is expected here — the dependency that must never exist
    // is the reverse one, and that is forbidden in the app block above.
    files: ['src/infra/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cli/**', '**/render/**'],
              message: 'infra/ may not import from cli or render.',
            },
          ],
        },
      ],
    },
  },
  {
    // The CLI is the only layer allowed to talk to a terminal, but even here
    // output goes through the OutputChannel seam — stdout carries the report
    // and stderr carries everything else, which is what keeps `--json | jq`
    // working. `output.ts` is the single sanctioned exception.
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Rendering adapters consume the domain IR and infra's loading utilities.
    // They own presentation, so they must never be reached into by the domain
    // and must not know about command dispatch.
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cli/**', '**/app/**'],
              message: 'render/ may not import from cli or app.',
            },
          ],
        },
      ],
    },
  },
);
