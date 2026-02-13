import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import importPlugin from 'eslint-plugin-import'
import n from 'eslint-plugin-n'
import promise from 'eslint-plugin-promise'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/test/fixtures/**', '.nx/**', '**/node_modules/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  promise.configs['flat/recommended'],
  n.configs['flat/recommended'],
  unicorn.configs['recommended'],
  {
    plugins: {
      import: importPlugin,
      sonarjs
    },
    rules: {
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          alphabetize: {
            caseInsensitive: true,
            order: 'asc'
          },
          groups: [
            ['builtin', 'external'],
            ['internal'],
            ['parent', 'sibling', 'index', 'object'],
            ['type']
          ],
          'newlines-between': 'always',
          warnOnUnassignedImports: false
        }
      ],
      'sort-imports': ['error', { ignoreCase: true, ignoreDeclarationSort: true }],
      ...sonarjs.configs.recommended.rules
    }
  },
  {
    files: ['eslint.config.mjs', 'eslint-config-snapshotter.config.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules
    }
  },
  {
    files: ['**/src/**/*.ts', '**/src/**/*.mts', '**/src/**/*.cts'],
    languageOptions: {
      parserOptions: {
        projectService: true
      },
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'separate-type-imports',
          prefer: 'type-imports'
        }
      ],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'n/no-missing-import': 'off',
      'sonarjs/different-types-comparison': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/cognitive-complexity': 'warn',
      'unicorn/no-array-sort': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off'
    }
  },
  {
    files: ['**/test/**/*.ts'],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'n/no-extraneous-import': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'separate-type-imports',
          prefer: 'type-imports'
        }
      ],
      'sonarjs/no-nested-template-literals': 'off',
      'unicorn/no-null': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/prefer-string-raw': 'off'
    }
  },
  {
    files: ['packages/cli/src/index.ts'],
    rules: {
      'n/hashbang': 'off',
      'n/no-process-exit': 'off',
      'unicorn/prefer-top-level-await': 'off'
    }
  },
  {
    files: ['packages/api/src/sampling.ts'],
    rules: {
      'unicorn/prefer-at': 'off'
    }
  }
)
