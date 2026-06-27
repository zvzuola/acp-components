import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Global ignores — generated output and node_modules.
    ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', 'examples/tauri/src-tauri/target/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Lint only the package source (matches the root `lint` script target).
    files: ['packages/*/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The codebase uses console.log/error for provider lifecycle logging.
      'no-console': 'off',
      // Allow unused vars/args/caught-errors prefixed with _.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Test files: relax rules that legitimately appear in tests.
    files: ['packages/*/src/**/*.test.{ts,tsx}', 'packages/*/src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
);
