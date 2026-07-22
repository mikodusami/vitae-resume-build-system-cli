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
    // The application layer orchestrates; it knows domain, never infra or cli.
    files: ['src/app/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infra/**', '**/cli/**'],
              message: 'app/ may not import from infra or cli.',
            },
          ],
        },
      ],
    },
  },
  {
    // Adapters implement domain ports; they must not reach sideways into cli.
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
