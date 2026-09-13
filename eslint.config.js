// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import globals from 'globals';

/** Modules that must stay pure: no React, no DOM, no network (CLAUDE.md invariants 3 and 4). */
const PURE_DIRS = [
  'packages/shared/src/layout/**',
  'packages/shared/src/kinship/**',
  'packages/shared/src/graph/**',
  'packages/shared/src/relatives/**',
  'packages/shared/src/dates/**',
  'packages/shared/src/gedcom/**',
  'packages/shared/src/csv/**',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'apps/api/var/**',
      '.pgdata/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  comments.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/disable-enable-pair': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      // Radio cards nest their visible text two spans deep inside the label.
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 4 }],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use lib/preferences.ts. Nothing auth-related may be stored in the browser.' },
        { name: 'sessionStorage', message: 'Use lib/preferences.ts. Nothing auth-related may be stored in the browser.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'Use lib/preferences.ts.' },
        { object: 'window', property: 'sessionStorage', message: 'Use lib/preferences.ts.' },
      ],
    },
  },
  {
    // preferences.ts is the one storage module; e2e specs read storage to prove no tokens are in it.
    files: ['apps/web/src/lib/preferences.ts', 'apps/web/e2e/**'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: PURE_DIRS,
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'react/*'], message: 'Pure module: no React.' },
            { group: ['node:*', 'fs', 'http', 'https', 'net'], message: 'Pure module: no Node I/O.' },
            { group: ['@prisma/*', 'fastify', 'fastify/*'], message: 'Pure module: no server code.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Pure module: no DOM.' },
        { name: 'document', message: 'Pure module: no DOM.' },
        { name: 'fetch', message: 'Pure module: no network.' },
        { name: 'XMLHttpRequest', message: 'Pure module: no network.' },
        { name: 'localStorage', message: 'Pure module: no DOM.' },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**', 'apps/web/e2e/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['apps/api/scripts/**', 'apps/api/prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
);
