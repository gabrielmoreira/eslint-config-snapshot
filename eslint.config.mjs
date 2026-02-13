import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import sonarjs from 'eslint-plugin-sonarjs'
import promise from 'eslint-plugin-promise'
import n from 'eslint-plugin-n'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/test/fixtures/**', '.nx/**', '**/node_modules/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  promise.configs['flat/recommended'],
  n.configs['flat/recommended'],
  // unicorn.configs['recommended'],
  {
    plugins: {
      sonarjs
    },
    rules: {
      ...sonarjs.configs.recommended.rules
    }
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'n/no-missing-import': 'off',
      'sonarjs/cognitive-complexity': 'warn',
      'unicorn/no-array-sort': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off'
    }
  },
  {
    files: ['**/test/**/*.ts'],
    rules: {
      'n/no-extraneous-import': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'unicorn/numeric-separators-style': 'off',
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
  }
)
