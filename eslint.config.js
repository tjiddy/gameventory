import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const noRawErrorLogging = require('./eslint-rules/no-raw-error-logging.cjs');
const noTautologicalExpect = require('./eslint-rules/no-tautological-expect.cjs');

export default tseslint.config(
  // Ignore patterns
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/drizzle/**',
      '**/coverage/**',
      'e2e/**',
      'eslint-rules/**',
      // On-disk reference clones of the legacy apps — behavioral oracles, not
      // our source. Each is its own repo; never lint or build them.
      'frontend/**',
      'backend/**',
      'nextjs-2024/**',
    ],
  },

  // Base config for all files
  js.configs.recommended,

  // TypeScript config
  ...tseslint.configs.recommended,

  // Global settings
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React config for client files
  {
    files: ['**/src/client/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true },
      ],
      // No console in client code
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Server-side code — allow console for logging
  {
    files: ['**/src/server/**/*.ts', '**/src/core/**/*.ts', '**/src/db/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Server-side custom rules — prevent raw error logging that Pino drops
  {
    files: ['**/src/server/**/*.ts'],
    ignores: ['**/*.test.ts'],
    plugins: {
      'gameventory': { rules: { 'no-raw-error-logging': noRawErrorLogging } },
    },
    rules: {
      'gameventory/no-raw-error-logging': 'error',
    },
  },

  // Layering guards — keep client/server/core/shared boundaries enforceable.
  {
    files: ['**/src/client/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/server/**', '**/server/*'],
        paths: [{ name: 'fastify', message: 'fastify must not be imported from client code.' }],
      }],
    },
  },
  {
    files: ['**/src/shared/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/core/**', '**/core/*', '**/server/**', '**/server/*', '@core/**', '@core/*'],
      }],
    },
  },
  {
    files: ['**/src/core/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/server/**', '**/server/*'],
        paths: [{ name: 'fastify', message: 'core adapters must not import fastify; throw errors or return failures and let the calling service log.' }],
      }],
    },
  },
  {
    // Services must not import from routes/ (routes depend on services, not the reverse).
    files: ['**/src/server/services/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/routes/**', '**/routes/*'],
      }],
    },
  },
  {
    // Jobs must not import from routes/.
    files: ['**/src/server/jobs/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/routes/**', '**/routes/*'],
      }],
    },
  },

  // Custom rules for all files
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'complexity': ['error', { max: 15 }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-useless-escape': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Test files — relax structural caps, enforce anti-hollow-assertion rule
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: {
      'gameventory': { rules: { 'no-tautological-expect': noTautologicalExpect } },
    },
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'complexity': 'off',
      'gameventory/no-tautological-expect': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },

  // src/db/schema.ts is a declarative Drizzle table catalog — length scales with
  // the data model, so the generic max-lines cap adds no value.
  {
    files: ['src/db/schema.ts'],
    rules: {
      'max-lines': 'off',
    },
  }
);
