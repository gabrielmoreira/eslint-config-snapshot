import {
  aggregateRules,
  assignGroupsByMatch,
  buildSnapshot,
  diffSnapshots,
  discoverWorkspaceRuleCatalog,
  discoverWorkspaces,
  extractRulesForWorkspaceSamples,
  type GroupAssignment,
  hasDiff,
  loadConfig,
  readSnapshotFile,
  resolveEslintVersionForWorkspace,
  sampleWorkspaceFiles,
  type SnapshotConfig,
  type WorkspaceDiscovery,
  writeSnapshotFile
} from '@eslint-config-snapshot/api'
import createDebug from 'debug'
import fg from 'fast-glob'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const debugWorkspace = createDebug('eslint-config-snapshot:workspace')
const debugDiff = createDebug('eslint-config-snapshot:diff')
const debugTiming = createDebug('eslint-config-snapshot:timing')

export type BuiltSnapshot = Awaited<ReturnType<typeof buildSnapshot>>
export type StoredSnapshot = Awaited<ReturnType<typeof readSnapshotFile>>
export type SnapshotDiff = ReturnType<typeof diffSnapshots>
export type GroupEslintVersions = Map<string, string[]>
export type WorkspaceAssignments = {
  discovery: WorkspaceDiscovery
  assignments: GroupAssignment[]
}
export type GroupRuleCatalog = {
  coreRules: string[]
  pluginRulesByPrefix: Record<string, string[]>
  allRules: string[]
}
export type GroupRuleCatalogs = Map<string, GroupRuleCatalog>
export type SkippedWorkspace = {
  groupId: string
  workspaceRel: string
  reason: string
}
type SnapshotComputationOptions = {
  allowWorkspaceExtractionFailure: boolean
  onWorkspacesDiscovered?: (workspacesRel: string[]) => void
  onWorkspaceSkipped?: (skipped: SkippedWorkspace) => void
}

export async function computeCurrentSnapshots(
  cwd: string,
  options?: {
    allowWorkspaceExtractionFailure?: boolean
    onWorkspacesDiscovered?: (workspacesRel: string[]) => void
    onWorkspaceSkipped?: (skipped: SkippedWorkspace) => void
  }
): Promise<Map<string, BuiltSnapshot>> {
  const resolvedOptions: SnapshotComputationOptions = {
    allowWorkspaceExtractionFailure: options?.allowWorkspaceExtractionFailure ?? false,
    onWorkspacesDiscovered: options?.onWorkspacesDiscovered,
    onWorkspaceSkipped: options?.onWorkspaceSkipped
  }
  const computeStartedAt = Date.now()
  const configStartedAt = Date.now()
  const config = await loadConfig(cwd)
  debugTiming('phase=loadConfig elapsedMs=%d', Date.now() - configStartedAt)

  const assignmentStartedAt = Date.now()
  const { discovery, assignments } = await resolveWorkspaceAssignments(cwd, config)
  resolvedOptions.onWorkspacesDiscovered?.(discovery.workspacesRel)
  debugTiming('phase=resolveWorkspaceAssignments elapsedMs=%d', Date.now() - assignmentStartedAt)
  debugWorkspace('root=%s groups=%d workspaces=%d', discovery.rootAbs, assignments.length, discovery.workspacesRel.length)

  const snapshots = new Map<string, BuiltSnapshot>()

  for (const group of assignments) {
    const builtGroup = await buildGroupSnapshot(config, discovery, group, resolvedOptions)
    if (!builtGroup) {
      continue
    }
    snapshots.set(group.name, builtGroup)
  }

  debugTiming('phase=computeCurrentSnapshots elapsedMs=%d', Date.now() - computeStartedAt)
  if (snapshots.size === 0) {
    throw new Error('Unable to extract ESLint config from discovered workspaces in zero-config mode')
  }
  return snapshots
}

async function buildGroupSnapshot(
  config: SnapshotConfig,
  discovery: WorkspaceDiscovery,
  group: GroupAssignment,
  options: SnapshotComputationOptions
): Promise<BuiltSnapshot | undefined> {
  const groupStartedAt = Date.now()
  const extractedForGroup = []
  const extractedWorkspaces: string[] = []
  debugWorkspace('group=%s workspaces=%o', group.name, group.workspaces)

  for (const workspaceRel of group.workspaces) {
    const workspaceOutcome = await extractWorkspaceRules(discovery, group.name, workspaceRel, config, options)
    if (workspaceOutcome.kind === 'skip') {
      continue
    }
    extractedForGroup.push(...workspaceOutcome.rules)
    extractedWorkspaces.push(workspaceRel)
  }

  if (extractedForGroup.length === 0) {
    if (options.allowWorkspaceExtractionFailure) {
      debugWorkspace('group=%s skipped=true reason=no-extracted-workspaces', group.name)
      return undefined
    }
    throw new Error(`Unable to extract ESLint config for group ${group.name}: no workspace produced a valid config`)
  }

  const aggregated = aggregateRules(extractedForGroup)
  debugWorkspace(
    'group=%s aggregatedRules=%d groupElapsedMs=%d',
    group.name,
    aggregated.size,
    Date.now() - groupStartedAt
  )
  return buildSnapshot(group.name, extractedWorkspaces, aggregated)
}

type WorkspaceExtractionOutcome =
  | { kind: 'ok'; rules: Array<NonNullable<Awaited<ReturnType<typeof extractRulesForWorkspaceSamples>>[number]['rules']>> }
  | { kind: 'skip' }

async function extractWorkspaceRules(
  discovery: WorkspaceDiscovery,
  groupName: string,
  workspaceRel: string,
  config: SnapshotConfig,
  options: SnapshotComputationOptions
): Promise<WorkspaceExtractionOutcome> {
  const workspaceAbs = path.resolve(discovery.rootAbs, workspaceRel)
  const sampled = await sampleWorkspaceForGroup(groupName, workspaceRel, workspaceAbs, config)
  const sampledAbs = sampled.map((sampledRel) => path.resolve(workspaceAbs, sampledRel))
  const extracted = await extractRulesForSampledFiles(
    groupName,
    workspaceRel,
    workspaceAbs,
    sampledAbs,
    options.allowWorkspaceExtractionFailure
  )

  if (extracted.extracted.length > 0) {
    debugWorkspace(
      'group=%s workspace=%s extracted=%d failed=%d',
      groupName,
      workspaceRel,
      extracted.extracted.length,
      extracted.total - extracted.extracted.length
    )
    return { kind: 'ok', rules: extracted.extracted }
  }

  const skipReason = extracted.lastError ?? 'unknown extraction failure'
  if (options.allowWorkspaceExtractionFailure && isSkippableWorkspaceExtractionFailure(extracted.lastError)) {
    options.onWorkspaceSkipped?.({
      groupId: groupName,
      workspaceRel,
      reason: skipReason
    })
    debugWorkspace('group=%s workspace=%s skipped=true reason=%s', groupName, workspaceRel, skipReason)
    return { kind: 'skip' }
  }

  const context = extracted.lastError ? ` Last error: ${extracted.lastError}` : ''
  throw new Error(`Unable to extract ESLint config for workspace ${workspaceRel}.${context}`)
}

async function sampleWorkspaceForGroup(
  groupName: string,
  workspaceRel: string,
  workspaceAbs: string,
  config: SnapshotConfig
): Promise<string[]> {
  const sampleStartedAt = Date.now()
  const sampled = await sampleWorkspaceFiles(workspaceAbs, config.sampling)
  debugWorkspace(
    'group=%s workspace=%s sampled=%d sampleElapsedMs=%d files=%o',
    groupName,
    workspaceRel,
    sampled.length,
    Date.now() - sampleStartedAt,
    sampled
  )
  return sampled
}

async function extractRulesForSampledFiles(
  groupName: string,
  workspaceRel: string,
  workspaceAbs: string,
  sampledAbs: string[],
  allowWorkspaceExtractionFailure: boolean
): Promise<{
  extracted: Array<NonNullable<Awaited<ReturnType<typeof extractRulesForWorkspaceSamples>>[number]['rules']>>
  total: number
  lastError?: string
}> {
  const extractStartedAt = Date.now()
  const results = await extractRulesForWorkspaceSamples(workspaceAbs, sampledAbs)
  debugTiming(
    'phase=extract group=%s workspace=%s sampled=%d elapsedMs=%d',
    groupName,
    workspaceRel,
    sampledAbs.length,
    Date.now() - extractStartedAt
  )

  const extracted: Array<NonNullable<Awaited<ReturnType<typeof extractRulesForWorkspaceSamples>>[number]['rules']>> = []
  let lastError: string | undefined
  for (const result of results) {
    if (result.rules) {
      extracted.push(result.rules)
      continue
    }

    const message = result.error instanceof Error ? result.error.message : String(result.error)
    if (isRecoverableExtractionError(message) || allowWorkspaceExtractionFailure) {
      lastError = message
      continue
    }

    throw result.error ?? new Error(message)
  }

  return { extracted, total: results.length, lastError }
}

function isRecoverableExtractionError(message: string): boolean {
  return (
    message.startsWith('Invalid JSON from eslint --print-config') ||
    message.startsWith('Empty ESLint print-config output') ||
    message.includes('File ignored because of a matching ignore pattern') ||
    message.includes('File ignored by default')
  )
}

function isSkippableWorkspaceExtractionFailure(message: string | undefined): boolean {
  if (!message) {
    return true
  }

  return (
    isRecoverableExtractionError(message) ||
    message.startsWith('Failed to load config') ||
    message.startsWith('Failed to run eslint --print-config') ||
    message.startsWith('Unable to resolve eslint from workspace')
  )
}

export async function resolveWorkspaceAssignments(cwd: string, config: SnapshotConfig): Promise<WorkspaceAssignments> {
  const discovery = await discoverWorkspaces({ cwd, workspaceInput: config.workspaceInput })

  const assignments =
    config.grouping.mode === 'standalone'
      ? discovery.workspacesRel.map((workspace) => ({ name: workspace, workspaces: [workspace] }))
      : assignGroupsByMatch(discovery.workspacesRel, config.grouping.groups ?? [{ name: 'default', match: ['**/*'] }])

  const allowEmptyGroups = config.grouping.allowEmptyGroups ?? false
  if (!allowEmptyGroups) {
    const empty = assignments.filter((group) => group.workspaces.length === 0)
    if (empty.length > 0) {
      throw new Error(`Empty groups are not allowed: ${empty.map((entry) => entry.name).join(', ')}`)
    }
  }

  return { discovery, assignments }
}

export async function loadStoredSnapshots(cwd: string, snapshotDir: string): Promise<Map<string, StoredSnapshot>> {
  const dir = path.join(cwd, snapshotDir)
  const files = await fg('**/*.json', { cwd: dir, absolute: true, onlyFiles: true, dot: true, suppressErrors: true })
  const snapshots = new Map<string, StoredSnapshot>()
  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b))

  for (const file of sortedFiles) {
    const snapshot = await readSnapshotFile(file)
    snapshots.set(snapshot.groupId, snapshot)
  }

  return snapshots
}

export async function writeSnapshots(cwd: string, snapshotDir: string, snapshots: Map<string, BuiltSnapshot>): Promise<void> {
  await mkdir(path.join(cwd, snapshotDir), { recursive: true })
  for (const snapshot of snapshots.values()) {
    await writeSnapshotFile(path.join(cwd, snapshotDir), snapshot)
  }
}

export function compareSnapshotMaps(before: Map<string, StoredSnapshot>, after: Map<string, BuiltSnapshot>) {
  const startedAt = Date.now()
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort()
  const changes: Array<{ groupId: string; diff: SnapshotDiff }> = []

  for (const id of ids) {
    const prev =
      before.get(id) ??
      ({
        formatVersion: 1,
        groupId: id,
        workspaces: [],
        rules: {}
      } as const)

    const next =
      after.get(id) ??
      ({
        formatVersion: 1,
        groupId: id,
        workspaces: [],
        rules: {}
      } as const)

    const diff = diffSnapshots(prev, next)
    if (hasDiff(diff)) {
      changes.push({ groupId: id, diff })
    }
  }

  debugDiff('groupsCompared=%d changedGroups=%d elapsedMs=%d', ids.length, changes.length, Date.now() - startedAt)
  return changes
}

export async function resolveGroupEslintVersions(cwd: string): Promise<GroupEslintVersions> {
  const config = await loadConfig(cwd)
  const { discovery, assignments } = await resolveWorkspaceAssignments(cwd, config)
  const result = new Map<string, string[]>()

  for (const group of assignments) {
    const versions = new Set<string>()
    for (const workspaceRel of group.workspaces) {
      const workspaceAbs = path.resolve(discovery.rootAbs, workspaceRel)
      versions.add(resolveEslintVersionForWorkspace(workspaceAbs))
    }
    result.set(group.name, [...versions].sort((a, b) => a.localeCompare(b)))
  }

  return result
}

export async function resolveGroupRuleCatalogs(cwd: string): Promise<GroupRuleCatalogs> {
  const config = await loadConfig(cwd)
  const { discovery, assignments } = await resolveWorkspaceAssignments(cwd, config)
  const result: GroupRuleCatalogs = new Map()

  for (const group of assignments) {
    const coreRules = new Set<string>()
    const allRules = new Set<string>()
    const pluginRulesByPrefix: Record<string, string[]> = {}

    for (const workspaceRel of group.workspaces) {
      const workspaceAbs = path.resolve(discovery.rootAbs, workspaceRel)
      const catalog = await discoverWorkspaceRuleCatalog(workspaceAbs)
      for (const ruleName of catalog.coreRules) {
        coreRules.add(ruleName)
      }
      for (const ruleName of catalog.allRules) {
        allRules.add(ruleName)
      }
      for (const [prefix, rules] of Object.entries(catalog.pluginRulesByPrefix)) {
        const current = pluginRulesByPrefix[prefix] ?? []
        current.push(...rules)
        pluginRulesByPrefix[prefix] = [...new Set(current)].sort((a, b) => a.localeCompare(b))
      }
    }

    result.set(group.name, {
      coreRules: [...coreRules].sort((a, b) => a.localeCompare(b)),
      pluginRulesByPrefix: Object.fromEntries(
        Object.entries(pluginRulesByPrefix).sort((a, b) => a[0].localeCompare(b[0]))
      ),
      allRules: [...allRules].sort((a, b) => a.localeCompare(b))
    })
  }

  return result
}
