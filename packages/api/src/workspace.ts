import { getPackages } from '@manypkg/get-packages'
import fg from 'fast-glob'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import picomatch from 'picomatch'

import { normalizePath, sortUnique } from './core.js'

export type WorkspaceDiscovery = {
  rootAbs: string
  workspacesRel: string[]
}

export type WorkspaceInput =
  | {
      mode: 'discover'
    }
  | {
      mode: 'manual'
      rootAbs?: string
      workspaces: string[]
    }

export type GroupDefinition = {
  name: string
  match: string[]
}

export type GroupAssignment = {
  name: string
  workspaces: string[]
}

export async function discoverWorkspaces(options?: {
  cwd?: string
  workspaceInput?: WorkspaceInput
}): Promise<WorkspaceDiscovery> {
  const cwd = options?.cwd ? path.resolve(options.cwd) : process.cwd()
  const workspaceInput = options?.workspaceInput ?? { mode: 'discover' as const }

  if (workspaceInput.mode === 'manual') {
    const rootAbs = path.resolve(workspaceInput.rootAbs ?? cwd)
    return {
      rootAbs,
      workspacesRel: sortUnique(workspaceInput.workspaces)
    }
  }

  try {
    const { rootDir, packages } = await getPackages(cwd)
    const workspacesAbs = packages.map((pkg) => pkg.dir)
    const rootAbs = rootDir ? path.resolve(rootDir) : lowestCommonAncestor(workspacesAbs)
    const workspacesRel = sortUnique(workspacesAbs.map((entry) => normalizePath(path.relative(rootAbs, entry))))
    if (workspacesRel.length > 1 || (workspacesRel.length === 1 && workspacesRel[0] !== '.')) {
      return {
        rootAbs,
        workspacesRel
      }
    }

    const packageJsonFallback = await discoverWorkspacesFromPackageJson(cwd)
    if (packageJsonFallback && packageJsonFallback.workspacesRel.length > 0) {
      return packageJsonFallback
    }

    if (workspacesRel.length > 0) {
      return {
        rootAbs,
        workspacesRel
      }
    }
  } catch {
    // Fallback to package.json workspace patterns when package manager metadata is unavailable.
  }

  const packageJsonFallback = await discoverWorkspacesFromPackageJson(cwd)
  if (packageJsonFallback) {
    return packageJsonFallback
  }

  return {
    rootAbs: cwd,
    workspacesRel: ['.']
  }
}

async function discoverWorkspacesFromPackageJson(cwd: string): Promise<WorkspaceDiscovery | null> {
  const packageJsonPath = path.join(cwd, 'package.json')
  const packageJsonRaw = await safeReadFile(packageJsonPath)
  if (!packageJsonRaw) {
    return null
  }

  const parsed = safeJsonParse(packageJsonRaw)
  if (!isObjectRecord(parsed) || Array.isArray(parsed)) {
    return null
  }

  const workspaceGlobs = extractWorkspaceGlobs(parsed)
  if (workspaceGlobs.length === 0) {
    return null
  }

  const workspacePackageJsonGlobs = workspaceGlobs.map((entry) => normalizePath(path.posix.join(entry, 'package.json')))
  const foundPackageJsonFiles = await fg(workspacePackageJsonGlobs, {
    cwd,
    onlyFiles: true,
    dot: true,
    unique: true,
    ignore: ['**/node_modules/**']
  })

  const workspacesRel = sortUnique(foundPackageJsonFiles.map((entry) => normalizePath(path.posix.dirname(entry))))
  if (workspacesRel.length === 0) {
    return {
      rootAbs: cwd,
      workspacesRel: ['.']
    }
  }

  return {
    rootAbs: cwd,
    workspacesRel
  }
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function extractWorkspaceGlobs(packageJson: Record<string, unknown>): string[] {
  const workspaces = packageJson.workspaces
  if (Array.isArray(workspaces)) {
    return workspaces.filter((entry): entry is string => typeof entry === 'string')
  }

  if (!workspaces || typeof workspaces !== 'object' || Array.isArray(workspaces)) {
    return []
  }

  const packages = (workspaces as { packages?: unknown }).packages
  if (Array.isArray(packages)) {
    return packages.filter((entry): entry is string => typeof entry === 'string')
  }

  return []
}

export function assignGroupsByMatch(workspacesRel: readonly string[], groups: readonly GroupDefinition[]): GroupAssignment[] {
  const sortedWorkspaces = sortUnique([...workspacesRel])
  const assignments = new Map<string, string[]>()

  for (const group of groups) {
    assignments.set(group.name, [])
  }

  const unmatched: string[] = []

  for (const workspace of sortedWorkspaces) {
    let assigned = false

    for (const group of groups) {
      if (matchesWorkspace(workspace, group.match)) {
        assignments.get(group.name)?.push(workspace)
        assigned = true
        break
      }
    }

    if (!assigned) {
      unmatched.push(workspace)
    }
  }

  if (unmatched.length > 0) {
    throw new Error(`Unmatched workspaces: ${unmatched.join(', ')}`)
  }

  return groups.map((group) => ({
    name: group.name,
    workspaces: assignments.get(group.name) ?? []
  }))
}

function matchesWorkspace(workspace: string, patterns: readonly string[]): boolean {
  const positives = patterns.filter((pattern) => !pattern.startsWith('!'))
  const negatives = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))

  const isPositiveMatch = positives.some((pattern) => picomatch(pattern, { dot: true })(workspace))
  if (!isPositiveMatch) {
    return false
  }

  const isNegativeMatch = negatives.some((pattern) => picomatch(pattern, { dot: true })(workspace))
  return !isNegativeMatch
}

function lowestCommonAncestor(paths: readonly string[]): string {
  if (paths.length === 0) {
    return process.cwd()
  }

  const segments = paths.map((entry) => path.resolve(entry).split(path.sep))
  const minLen = Math.min(...segments.map((parts) => parts.length))

  const common: string[] = []
  for (let index = 0; index < minLen; index += 1) {
    const value = segments[0][index]
    if (segments.every((parts) => parts[index] === value)) {
      common.push(value)
    } else {
      break
    }
  }

  if (common.length === 0) {
    return path.parse(path.resolve(paths[0])).root
  }

  return common.join(path.sep)
}
