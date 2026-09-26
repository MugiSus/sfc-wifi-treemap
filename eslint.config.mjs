import path from 'node:path';

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import solid from 'eslint-plugin-solid';
import solidTypescript from 'eslint-plugin-solid/configs/typescript';
import tailwindcss from 'eslint-plugin-tailwindcss';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', '.wrangler/**', 'node_modules/**'] },
  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      solid,
      tailwindcss,
      'unused-imports': unusedImports,
    },
    settings: {
      tailwindcss: {
        cssConfigPath: path.resolve(import.meta.dirname, './src/index.css'),
        functions: ['clsx', 'cn'],
      },
    },
    rules: {
      ...solidTypescript.rules,
      ...tailwindcss.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      'tailwindcss/no-custom-classname': [
        'warn',
        { whitelist: ['treemap-scene', 'treemap-cell', 'treemap-label'] },
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'error',
      'no-unmodified-loop-condition': 'error',
    },
  },
  prettierConfig,
);
