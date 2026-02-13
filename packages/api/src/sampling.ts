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

  // First pass: pick one representative file per discovered token.
  // This increases the chance of capturing distinct rule contexts per file "kind".
  const tokenToFiles = new Map<string, string[]>()
  const tokenFirstIndex = new Map<string, number>()
  for (const [index, file] of files.entries()) {
    const token = getPrimaryToken(file)
    if (!token) {
      continue
    }
    tokenFirstIndex.set(token, Math.min(tokenFirstIndex.get(token) ?? Number.POSITIVE_INFINITY, index))
    const current = tokenToFiles.get(token) ?? []
    current.push(file)
    tokenToFiles.set(token, current)
  }

  const orderedTokens = [...tokenToFiles.keys()].sort((left, right) => {
    const leftPriority = TOKEN_GROUP_PRIORITY.get(left) ?? Number.POSITIVE_INFINITY
    const rightPriority = TOKEN_GROUP_PRIORITY.get(right) ?? Number.POSITIVE_INFINITY
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }
    const leftIndex = tokenFirstIndex.get(left) ?? Number.POSITIVE_INFINITY
    const rightIndex = tokenFirstIndex.get(right) ?? Number.POSITIVE_INFINITY
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    return left.localeCompare(right)
  })

  for (const token of orderedTokens) {
    if (selected.length >= count) {
      break
    }
    const firstFile = tokenToFiles.get(token)?.[0]
    if (!firstFile || selectedSet.has(firstFile)) {
      continue
    }
    selected.push(firstFile)
    selectedSet.add(firstFile)
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

  // Ensure regional coverage when possible: top, middle, bottom.
  if (count >= 3) {
    const anchorIndices = [0, Math.floor((files.length - 1) / 2), files.length - 1]
    for (const anchorIndex of anchorIndices) {
      if (picked.length >= count || usedIndices.has(anchorIndex)) {
        continue
      }
      usedIndices.add(anchorIndex)
      const anchored = files[anchorIndex]
      if (anchored !== undefined) {
        picked.push(anchored)
      }
    }
  }

  for (const candidate of buildDistributedCandidates(files.length, count)) {
    if (picked.length >= count) {
      break
    }
    const safeIndex = nextFreeIndex(candidate, usedIndices, files.length)
    if (usedIndices.has(safeIndex)) {
      continue
    }
    usedIndices.add(safeIndex)
    const selected = files[safeIndex]
    if (selected !== undefined) {
      picked.push(selected)
    }
  }

  if (picked.length < count) {
    for (let index = 0; index < files.length && picked.length < count; index += 1) {
      if (usedIndices.has(index)) {
        continue
      }
      usedIndices.add(index)
      const fallback = files[index]
      if (fallback !== undefined) {
        picked.push(fallback)
      }
    }
  }

  return picked
}

function buildDistributedCandidates(length: number, count: number): number[] {
  if (length <= 0 || count <= 0) {
    return []
  }
  if (count === 1) {
    return [0]
  }

  const candidates: number[] = []
  for (let index = 0; index < count; index += 1) {
    candidates.push(Math.round((index * (length - 1)) / (count - 1)))
  }
  return candidates
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
  const parts = file.split('/').filter((entry) => entry.length > 0)
  if (parts.length === 0) {
    return null
  }

  const basename = parts[parts.length - 1]
  if (basename === undefined) {
    return null
  }
  const basenameTokens = tokenizePathPart(basename, true)
  const directoryTokensForward = parts.slice(0, -1).flatMap((entry) => tokenizePathPart(entry, false))
  const directoryTokens: string[] = []
  for (let index = directoryTokensForward.length - 1; index >= 0; index -= 1) {
    const token = directoryTokensForward[index]
    if (token !== undefined) {
      directoryTokens.push(token)
    }
  }
  const allTokens = [...basenameTokens, ...directoryTokens].filter((entry) => entry.length > 1)

  const bestKnownToken = pickBestKnownToken(allTokens)
  if (bestKnownToken !== null) {
    return bestKnownToken
  }

  const fallback = allTokens.find((entry) => !GENERIC_TOKENS.has(entry))
  return fallback ?? null
}

function tokenizePathPart(part: string, stripExtension: boolean): string[] {
  const normalized = stripExtension ? part.replace(/\.[^.]+$/u, '') : part
  const expanded = normalized
    .replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
    .replaceAll(/[_\-.]+/gu, ' ')
    .toLowerCase()

  return expanded
    .split(/\s+/u)
    .filter((entry) => entry.length > 0)
}

function pickBestKnownToken(tokens: string[]): string | null {
  let bestToken: string | null = null
  let bestGroupPriority = Number.POSITIVE_INFINITY

  for (const token of tokens) {
    const normalizedToken = normalizeToken(token)
    const groupPriority = TOKEN_GROUP_PRIORITY.get(normalizedToken)
    if (groupPriority === undefined) {
      continue
    }
    if (groupPriority < bestGroupPriority) {
      bestGroupPriority = groupPriority
      bestToken = normalizedToken
    }
  }

  return bestToken
}

function normalizeToken(token: string): string {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`
  }
  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1)
  }
  return token
}

const GENERIC_TOKENS = new Set(['src', 'index', 'main', 'test', 'spec', 'package', 'packages', 'lib', 'dist'])

const TOKEN_GROUP_PRIORITY = new Map<string, number>([
  ...toPriorityEntries([
    'adapter',
    'api',
    'apis',
    'builder',
    'client',
    'component',
    'components',
    'constants',
    'context',
    'core',
    'dto',
    'entity',
    'entry',
    'env',
    'factory',
    'fetcher',
    'handler',
    'hook',
    'hooks',
    'init',
    'integration',
    'interceptor',
    'interface',
    'layout',
    'layouts',
    'listener',
    'logger',
    'manager',
    'mapper',
    'meta',
    'middleware',
    'model',
    'module',
    'normalizer',
    'options',
    'page',
    'pages',
    'parser',
    'plugin',
    'provider',
    'registry',
    'repository',
    'resolver',
    'route',
    'router',
    'runtime',
    'serializer',
    'server',
    'service',
    'settings',
    'shared',
    'slice',
    'state',
    'store',
    'subscriber',
    'theme',
    'tracker',
    'transform',
    'unit',
    'validator',
    'view',
    'views'
  ], 1),
  ...toPriorityEntries([
    'base',
    'bundle',
    'common',
    'compiler',
    'contract',
    'definition',
    'definitions',
    'deserializer',
    'event',
    'events',
    'fixture',
    'fixtures',
    'guard',
    'internal',
    'loader',
    'publisher',
    'reducer',
    'routes',
    'stub',
    'stubs',
    'tests',
    'util'
  ], 2),
  ...toPriorityEntries([
    'chunk',
    'conf',
    'config',
    'container',
    'controller',
    'helpers',
    'mock',
    'mocks',
    'presentation',
    'schema',
    'setup',
    'spec',
    'stories',
    'style',
    'styles',
    'test',
    'type',
    'types',
    'utils'
  ], 3)
])

function toPriorityEntries(tokens: string[], priority: number): Array<[string, number]> {
  return tokens.map((token) => [normalizeToken(token), priority])
}
