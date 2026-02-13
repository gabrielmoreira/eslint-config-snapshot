import createDebug from 'debug'
import fg from 'fast-glob'

import { normalizePath, sortUnique } from './core.js'

const debugSampling = createDebug('eslint-config-snapshot:sampling')

export type SamplingConfig = {
  maxFilesPerWorkspace: number
  includeGlobs: string[]
  excludeGlobs: string[]
  tokenHints?: string[] | string[][]
}

export async function sampleWorkspaceFiles(workspaceAbs: string, config: SamplingConfig): Promise<string[]> {
  const startedAt = Date.now()
  const all = await fg(config.includeGlobs, {
    cwd: workspaceAbs,
    ignore: config.excludeGlobs,
    onlyFiles: true,
    dot: true,
    unique: true
  })

  const normalized = sortUnique(all.map((entry) => normalizePath(entry)))
  debugSampling('workspace=%s candidates=%d', workspaceAbs, normalized.length)
  if (normalized.length === 0) {
    return []
  }

  if (normalized.length <= config.maxFilesPerWorkspace) {
    debugSampling('workspace=%s using all files=%d elapsedMs=%d', workspaceAbs, normalized.length, Date.now() - startedAt)
    return normalized
  }

  const selected = selectDistributed(normalized, config.maxFilesPerWorkspace, config.tokenHints)
  debugSampling(
    'workspace=%s selected=%d mode=token-distributed elapsedMs=%d files=%o',
    workspaceAbs,
    selected.length,
    Date.now() - startedAt,
    selected
  )
  return selected
}

function selectDistributed(files: string[], count: number, tokenHints?: string[] | string[][]): string[] {
  if (files.length <= count) {
    return files
  }

  const tokenPriorityMap = createTokenPriorityMap(tokenHints)
  const selected: string[] = []
  const selectedSet = new Set<string>()

  const preferred = files.filter((file) => isPreferredForLintSampling(file))
  const nonPreferred = files.filter((file) => !isPreferredForLintSampling(file))

  // First pass: pick token-diverse representatives from code files.
  // Second pass: include non-code only when needed to fill remaining slots.
  appendTokenRepresentatives(preferred, tokenPriorityMap, selected, selectedSet, count)
  appendTokenRepresentatives(nonPreferred, tokenPriorityMap, selected, selectedSet, count)

  if (selected.length >= count) {
    return sortUnique(selected).slice(0, count)
  }

  const remaining = files.filter((file) => !selectedSet.has(file))
  const needed = count - selected.length
  const preferredRemaining = remaining.filter((file) => isPreferredForLintSampling(file))
  const nonPreferredRemaining = remaining.filter((file) => !isPreferredForLintSampling(file))

  const preferredPicked = pickUniformly(preferredRemaining, needed)
  const afterPreferredNeed = needed - preferredPicked.length
  const fallbackPicked = afterPreferredNeed > 0 ? pickUniformly(nonPreferredRemaining, afterPreferredNeed) : []
  return sortUnique([...selected, ...preferredPicked, ...fallbackPicked]).slice(0, count)
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

function getPrimaryToken(file: string, tokenPriorityMap: Map<string, number>): string | null {
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

  const bestKnownToken = pickBestKnownToken(allTokens, tokenPriorityMap)
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

function pickBestKnownToken(tokens: string[], tokenPriorityMap: Map<string, number>): string | null {
  let bestToken: string | null = null
  let bestGroupPriority = Number.POSITIVE_INFINITY

  for (const token of tokens) {
    const normalizedToken = normalizeToken(token)
    const groupPriority = tokenPriorityMap.get(normalizedToken)
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

function isPreferredForLintSampling(file: string): boolean {
  return CODE_PREFERRED_EXTENSIONS.has(getExtension(file))
}

function getExtension(file: string): string {
  const lastDot = file.lastIndexOf('.')
  if (lastDot === -1 || lastDot === file.length - 1) {
    return ''
  }
  return file.slice(lastDot + 1).toLowerCase()
}

const GENERIC_TOKENS = new Set(['src', 'index', 'main', 'test', 'spec', 'package', 'packages', 'lib', 'dist'])
const CODE_PREFERRED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs'])

const DEFAULT_TOKEN_HINT_GROUPS = [
  [
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
  ],
  [
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
    'resolver',
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
    'validator'
  ],
  [
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
    'stub',
    'stubs',
    'tests',
    'util'
  ]
] as const

function createTokenPriorityMap(input?: string[] | string[][]): Map<string, number> {
  const groups = normalizeTokenHintGroups(input)
  const entries: Array<[string, number]> = []
  for (const [index, group] of groups.entries()) {
    entries.push(...toPriorityEntries(group, index + 1))
  }
  return new Map<string, number>(entries)
}

function normalizeTokenHintGroups(input?: string[] | string[][]): string[][] {
  if (!input || input.length === 0) {
    return DEFAULT_TOKEN_HINT_GROUPS.map((group) => [...group])
  }

  if (Array.isArray(input[0])) {
    const nested = input as string[][]
    return nested.map((group) => group.filter((token) => token.trim().length > 0))
  }

  const flat = input as string[]
  return [flat.filter((token) => token.trim().length > 0)]
}

function toPriorityEntries(tokens: string[], priority: number): Array<[string, number]> {
  return tokens.map((token) => [normalizeToken(token), priority])
}

function appendTokenRepresentatives(
  files: string[],
  tokenPriorityMap: Map<string, number>,
  selected: string[],
  selectedSet: Set<string>,
  count: number
): void {
  if (selected.length >= count || files.length === 0) {
    return
  }

  const tokenToFiles = new Map<string, string[]>()
  const tokenFirstIndex = new Map<string, number>()
  for (const [index, file] of files.entries()) {
    const token = getPrimaryToken(file, tokenPriorityMap)
    if (!token) {
      continue
    }
    tokenFirstIndex.set(token, Math.min(tokenFirstIndex.get(token) ?? Number.POSITIVE_INFINITY, index))
    const current = tokenToFiles.get(token) ?? []
    current.push(file)
    tokenToFiles.set(token, current)
  }

  const orderedTokens = [...tokenToFiles.keys()].sort((left, right) => {
    const leftPriority = tokenPriorityMap.get(left) ?? Number.POSITIVE_INFINITY
    const rightPriority = tokenPriorityMap.get(right) ?? Number.POSITIVE_INFINITY
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
}
