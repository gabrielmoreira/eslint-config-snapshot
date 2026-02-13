import { access } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

const SUPPORTED_FILES = [
  '.eslint-config-snapshotter.js',
  '.eslint-config-snapshotter.cjs',
  '.eslint-config-snapshotter.mjs',
  'eslint-config-snapshotter.config.js',
  'eslint-config-snapshotter.config.cjs',
  'eslint-config-snapshotter.config.mjs'
]

export async function loadConfig(cwd?: string): Promise<SnapshotterConfig> {
  const root = path.resolve(cwd ?? process.cwd())
  const file = await resolveConfigFile(root)

  if (!file) {
    return DEFAULT_CONFIG
  }

  const mod = await import(pathToFileURL(file).href)
  const exported = 'default' in mod ? mod.default : mod
  const maybeConfig = typeof exported === 'function' ? await exported() : exported

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

async function resolveConfigFile(root: string): Promise<string | null> {
  for (const candidate of SUPPORTED_FILES) {
    const abs = path.join(root, candidate)
    try {
      await access(abs)
      return abs
    } catch {
      // continue
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
