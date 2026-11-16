// ESLint flat config. Also enforces the layering rules documented in
// docs/architecture.md: `core` must stay framework- and IO-free, `data` must
// not depend on the UI.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'dev-dist', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Layering: the domain core is pure TypeScript.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*'], message: 'core must not depend on React' },
            { group: ['@data/*', '@ui/*', '**/data/**', '**/ui/**'], message: 'core must not depend on data/ui' },
            { group: ['dexie', '@supabase/*'], message: 'core must not do IO' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@ui/*', '**/ui/**', 'react'], message: 'data must not depend on the UI' }] },
      ],
    },
  },
);
