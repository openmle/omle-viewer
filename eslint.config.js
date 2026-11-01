// ESLint flat config for the Vite/React viewer.
//
// Correctness rules only — no formatter, so existing source formatting is
// preserved. Mirrors the scope of the Python lint setup in this project.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-singlefile/**',
      'node_modules/**',
      'python/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { console: 'readonly', window: 'readonly', document: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The long-standing baseline. eslint-plugin-react-hooks v6 adds stricter
      // rules (refs, set-state-in-effect, static-components); they report 25
      // findings in this codebase and are left for a dedicated pass.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // TypeScript resolves identifiers itself.
      'no-undef': 'off',
    },
  },
);
