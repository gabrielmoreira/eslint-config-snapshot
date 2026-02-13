import path from 'node:path'
import { cosmiconfig } from 'cosmiconfig'

export type SnapshotterConfig = {
  workspaceInput: {
    mode: 'discover'
  } | {
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
    hintGlobs: string[]
  }
}

export const DEFAULT_CONFIG: SnapshotterConfig = {
  workspaceInput: { mode: 'discover' },
  grouping: {
    mode: 'match',
    groups: [{ name: 'default', match: ['**/*'] }]
  },
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**'],
    hintGlobs: []
  }
}

const SPEC_SEARCH_PLACES = [
  '.eslint-config-snapshotter.js',
  '.eslint-config-snapshotter.cjs',
  '.eslint-config-snapshotter.mjs',
  'eslint-config-snapshotter.config.js',
  'eslint-config-snapshotter.config.cjs',
  'eslint-config-snapshotter.config.mjs',
  'package.json',
  '.eslint-config-snapshotterrc',
  '.eslint-config-snapshotterrc.json',
  '.eslint-config-snapshotterrc.yaml',
  '.eslint-config-snapshotterrc.yml',
  '.eslint-config-snapshotterrc.js',
  '.eslint-config-snapshotterrc.cjs',
  '.eslint-config-snapshotterrc.mjs'
]

export async function loadConfig(cwd?: string): Promise<SnapshotterConfig> {
  const root = path.resolve(cwd ?? process.cwd())
  const explorer = cosmiconfig('eslint-config-snapshotter', {
    searchPlaces: SPEC_SEARCH_PLACES,
    stopDir: root
  })

  const result = await explorer.search(root)
  if (!result) {
    return DEFAULT_CONFIG
  }

  const maybeConfig = await loadUserConfig(result.config)

  return {
    ...DEFAULT_CONFIG,
    ...maybeConfig,
    grouping: {
      ...DEFAULT_CONFIG.grouping,
      ...(maybeConfig.grouping ?? {})
    },
    sampling: {
      ...DEFAULT_CONFIG.sampling,
      ...(maybeConfig.sampling ?? {})
    }
  }
}

async function loadUserConfig(rawConfig: unknown): Promise<Partial<SnapshotterConfig>> {
  const resolved = typeof rawConfig === 'function' ? await rawConfig() : rawConfig
  if (resolved === null || resolved === undefined) {
    return {}
  }

  if (typeof resolved !== 'object' || Array.isArray(resolved)) {
    throw new Error('Invalid config export: expected object, function, or async function returning an object')
  }

  return resolved as Partial<SnapshotterConfig>
}

export function getConfigScaffold(): string {
  return `export default {
  workspaceInput: { mode: 'discover' },
  grouping: {
    mode: 'match',
    groups: [{ name: 'default', match: ['**/*'] }]
  },
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**'],
    hintGlobs: []
  }
}\n`
}
