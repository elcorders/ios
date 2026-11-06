import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message: 'supabase-js may only be imported under src/api/supabase/.',
            },
          ],
          patterns: [{ group: ['@supabase/*'], message: 'Only src/api/supabase/ may import supabase packages.' }],
        },
      ],
    },
  },
  {
    files: ['src/api/supabase/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
