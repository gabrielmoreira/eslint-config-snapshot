import { cosmiconfig } from 'cosmiconfig'
import path from 'node:path'


export type SnapshotConfig = {
  workspaceInput:
    | {
        mode: 'discover'
      }
    | {
        mode: 'manual'
        rootAbs?: string
        workspaces: string[]
      }
  grouping: {
    mode: 'match' | 'standalone'
    allowEmptyGroups?: boolean
    groups?: Array<{
      name: string
      match: string[]
    }>
  }
  sampling: {
    maxFilesPerWorkspace: number
    includeGlobs: string[]
    excludeGlobs: string[]
    tokenHints?: string[] | string[][]
  }
}

export const DEFAULT_CONFIG: SnapshotConfig = {
  workspaceInput: { mode: 'discover' },
  grouping: {
    mode: 'match',
    groups: [{ name: 'default', match: ['**/*'] }]
  },
  sampling: {
    maxFilesPerWorkspace: 10,
    includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**']
  }
}

const SPEC_SEARCH_PLACES = [
  '.eslint-config-snapshot.js',
  '.eslint-config-snapshot.cjs',
  '.eslint-config-snapshot.mjs',
  'eslint-config-snapshot.config.js',
  'eslint-config-snapshot.config.cjs',
  'eslint-config-snapshot.config.mjs',
  'package.json',
  '.eslint-config-snapshotrc',
  '.eslint-config-snapshotrc.json',
  '.eslint-config-snapshotrc.yaml',
  '.eslint-config-snapshotrc.yml',
  '.eslint-config-snapshotrc.js',
  '.eslint-config-snapshotrc.cjs',
  '.eslint-config-snapshotrc.mjs'
]

export async function loadConfig(cwd?: string): Promise<SnapshotConfig> {
  const found = await findConfigPath(cwd)
  if (!found) {
    return DEFAULT_CONFIG
  }

  return found.config
}

export async function findConfigPath(
  cwd?: string
): Promise<{ path: string; config: SnapshotConfig } | null> {
  const root = path.resolve(cwd ?? process.cwd())
  const explorer = cosmiconfig('eslint-config-snapshot', {
    searchPlaces: SPEC_SEARCH_PLACES,
    stopDir: root
  })

  const result = await explorer.search(root)
  if (!result) {
    return null
  }

  const maybeConfig = await loadUserConfig(result.config)

  const config: SnapshotConfig = {
    ...DEFAULT_CONFIG,
    ...maybeConfig,
    grouping: {
      ...DEFAULT_CONFIG.grouping,
      ...maybeConfig.grouping
    },
    sampling: {
      ...DEFAULT_CONFIG.sampling,
      ...maybeConfig.sampling
    }
  }

  return {
    path: result.filepath,
    config
  }
}

async function loadUserConfig(rawConfig: unknown): Promise<Partial<SnapshotConfig>> {
  const resolved = typeof rawConfig === 'function' ? await rawConfig() : rawConfig
  if (resolved === null || resolved === undefined) {
    return {}
  }

  if (typeof resolved !== 'object' || Array.isArray(resolved)) {
    throw new TypeError('Invalid config export: expected object, function, or async function returning an object')
  }

  return resolved as Partial<SnapshotConfig>
}

export type ConfigPreset = 'minimal' | 'full'

export function getConfigScaffold(preset: ConfigPreset = 'minimal'): string {
  if (preset === 'minimal') {
    return 'export default {}\n'
  }

  return `export default {
  workspaceInput: { mode: 'discover' },
  grouping: {
    mode: 'match',
    groups: [{ name: 'default', match: ['**/*'] }]
  },
  sampling: {
    maxFilesPerWorkspace: 10,
    includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**'],
    tokenHints: [
      'chunk',
      'conf',
      'config',
      'container',
      'controller',
      'helpers',
      'mock',
      'mocks',
      'presentation',
      'repository',
      'route',
      'routes',
      'schema',
      'setup',
      'spec',
      'stories',
      'style',
      'styles',
      'test',
      'type',
      'types',
      'utils',
      'view',
      'views'
    ]
  }
}\n`
}
