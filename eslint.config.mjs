import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import unicorn from 'eslint-plugin-unicorn'
import sonarjs from 'eslint-plugin-sonarjs'
import promise from 'eslint-plugin-promise'
import n from 'eslint-plugin-n'
import deprecate from 'eslint-plugin-deprecate'

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
      deprecate,
      sonarjs
    },
    rules: {
      'deprecate/member-expression': [
        'warn',
        { name: 'fs.rmdir', use: 'fs.rm' },
        { name: 'fs.rmdirSync', use: 'fs.rmSync' },
        { name: 'util.isArray', use: 'Array.isArray' },
        { name: 'util.isDate', use: 'value instanceof Date' },
        { name: 'util.isRegExp', use: 'value instanceof RegExp' },
        { name: 'url.parse', use: 'new URL(...)' }
      ],
      ...sonarjs.configs.recommended.rules
    }
  },
  {
    files: ['eslint.config.mjs', 'scripts/**/*.mjs'],
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
