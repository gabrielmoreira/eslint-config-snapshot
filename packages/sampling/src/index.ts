import fg from 'fast-glob'
import picomatch from 'picomatch'

import { normalizePath, sortUnique } from '@eslint-config-snapshotter/core'

export type SamplingConfig = {
  maxFilesPerWorkspace: number
  includeGlobs: string[]
  excludeGlobs: string[]
  hintGlobs: string[]
}

export async function sampleWorkspaceFiles(workspaceAbs: string, config: SamplingConfig): Promise<string[]> {
  const all = await fg(config.includeGlobs, {
    cwd: workspaceAbs,
    ignore: config.excludeGlobs,
    onlyFiles: true,
    dot: true,
    unique: true
  })

  const normalized = sortUnique(all.map((entry) => normalizePath(entry)))
  if (normalized.length === 0) {
    return []
  }

  if (config.hintGlobs.length === 0) {
    return normalized.slice(0, config.maxFilesPerWorkspace)
  }

  const hinted = normalized.filter((entry) => config.hintGlobs.some((pattern) => picomatch(pattern, { dot: true })(entry)))
  const notHinted = normalized.filter((entry) => !hinted.includes(entry))

  return [...hinted, ...notHinted].slice(0, config.maxFilesPerWorkspace)
}
