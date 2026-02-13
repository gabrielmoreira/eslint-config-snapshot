import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { access } from 'node:fs/promises'

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
  'eslint-config-snapshotter.config.mjs'
]

export async function loadConfig(cwd?: string): Promise<SnapshotterConfig> {
  const root = path.resolve(cwd ?? process.cwd())
  const configFile = await resolveConfigFile(root)
  if (!configFile) {
    return DEFAULT_CONFIG
  }

  const loadedModule = (await import(pathToFileURL(configFile).href)) as { default?: unknown }
  const loaded = loadedModule.default ?? loadedModule
  const maybeConfig = (typeof loaded === 'function' ? await loaded() : loaded) as Partial<SnapshotterConfig>

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

async function resolveConfigFile(rootAbs: string): Promise<string | null> {
  for (const fileName of SPEC_SEARCH_PLACES) {
    const candidate = path.join(rootAbs, fileName)
    try {
      await access(candidate)
      return candidate
    } catch {
      // continue in strict order
    }
  }

  return null
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
