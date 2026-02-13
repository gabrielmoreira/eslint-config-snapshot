import fg from 'fast-glob'
import picomatch from 'picomatch'

import { normalizePath, sortUnique } from './core.js'

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

  if (normalized.length <= config.maxFilesPerWorkspace) {
    return normalized
  }

  if (config.hintGlobs.length === 0) {
    return selectDistributed(normalized, config.maxFilesPerWorkspace)
  }

  const hinted = normalized.filter((entry) => config.hintGlobs.some((pattern) => picomatch(pattern, { dot: true })(entry)))
  const notHinted = normalized.filter((entry) => !hinted.includes(entry))

  return selectDistributed([...hinted, ...notHinted], config.maxFilesPerWorkspace)
}

function selectDistributed(files: string[], count: number): string[] {
  if (files.length <= count) {
    return files
  }

  const selected: string[] = []
  const selectedSet = new Set<string>()

  // First pass: attempt token diversity using simple filename tokenization.
  const tokenSeen = new Set<string>()
  for (const file of files) {
    if (selected.length >= count) {
      break
    }
    const token = getPrimaryToken(file)
    if (!token || tokenSeen.has(token)) {
      continue
    }
    tokenSeen.add(token)
    selected.push(file)
    selectedSet.add(file)
  }

  if (selected.length >= count) {
    return sortUnique(selected).slice(0, count)
  }

  const remaining = files.filter((file) => !selectedSet.has(file))
  const needed = count - selected.length
  const spaced = pickUniformly(remaining, needed)
  return sortUnique([...selected, ...spaced]).slice(0, count)
}

function pickUniformly(files: string[], count: number): string[] {
  if (count <= 0 || files.length === 0) {
    return []
  }
  if (files.length <= count) {
    return files
  }
  if (count === 1) {
    return [files[0]]
  }

  const picked: string[] = []
  const usedIndices = new Set<number>()

  for (let index = 0; index < count; index += 1) {
    const raw = Math.round((index * (files.length - 1)) / (count - 1))
    const safeIndex = nextFreeIndex(raw, usedIndices, files.length)
    usedIndices.add(safeIndex)
    picked.push(files[safeIndex])
  }

  return picked
}

function nextFreeIndex(candidate: number, used: Set<number>, max: number): number {
  if (!used.has(candidate)) {
    return candidate
  }

  for (let delta = 1; delta < max; delta += 1) {
    const forward = candidate + delta
    if (forward < max && !used.has(forward)) {
      return forward
    }
    const backward = candidate - delta
    if (backward >= 0 && !used.has(backward)) {
      return backward
    }
  }

  return candidate
}

function getPrimaryToken(file: string): string | null {
  const parts = file.split('/')
  const basename = parts.slice(-1)[0]
  if (!basename) {
    return null
  }
  const nameOnly = basename.replace(/\.[^.]+$/u, '')
  const expanded = nameOnly
    .replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
    .replaceAll(/[_\-.]+/gu, ' ')
    .toLowerCase()

  const token = expanded
    .split(/\s+/u)
    .find((entry) => entry.length > 1 && !GENERIC_TOKENS.has(entry))

  return token ?? null
}

const GENERIC_TOKENS = new Set(['src', 'index', 'main', 'test', 'spec', 'package', 'packages', 'lib', 'dist'])
