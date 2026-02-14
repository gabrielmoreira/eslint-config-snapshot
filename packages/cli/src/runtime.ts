import {
  aggregateRules,
  assignGroupsByMatch,
  buildSnapshot,
  diffSnapshots,
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
export type SkippedWorkspace = {
  groupId: string
  workspaceRel: string
  reason: string
}

export async function computeCurrentSnapshots(
  cwd: string,
  options?: {
    allowWorkspaceExtractionFailure?: boolean
    onWorkspacesDiscovered?: (workspacesRel: string[]) => void
    onWorkspaceSkipped?: (skipped: SkippedWorkspace) => void
  }
): Promise<Map<string, BuiltSnapshot>> {
  const allowWorkspaceExtractionFailure = options?.allowWorkspaceExtractionFailure ?? false
  const onWorkspacesDiscovered = options?.onWorkspacesDiscovered
  const onWorkspaceSkipped = options?.onWorkspaceSkipped
  const computeStartedAt = Date.now()
  const configStartedAt = Date.now()
  const config = await loadConfig(cwd)
  debugTiming('phase=loadConfig elapsedMs=%d', Date.now() - configStartedAt)

  const assignmentStartedAt = Date.now()
  const { discovery, assignments } = await resolveWorkspaceAssignments(cwd, config)
  onWorkspacesDiscovered?.(discovery.workspacesRel)
  debugTiming('phase=resolveWorkspaceAssignments elapsedMs=%d', Date.now() - assignmentStartedAt)
  debugWorkspace('root=%s groups=%d workspaces=%d', discovery.rootAbs, assignments.length, discovery.workspacesRel.length)

  const snapshots = new Map<string, BuiltSnapshot>()

  for (const group of assignments) {
    const groupStartedAt = Date.now()
    const extractedForGroup = []
    const extractedWorkspaces: string[] = []
    debugWorkspace('group=%s workspaces=%o', group.name, group.workspaces)

    for (const workspaceRel of group.workspaces) {
      const workspaceAbs = path.resolve(discovery.rootAbs, workspaceRel)
      const sampleStartedAt = Date.now()
      const sampled = await sampleWorkspaceFiles(workspaceAbs, config.sampling)
      debugWorkspace(
        'group=%s workspace=%s sampled=%d sampleElapsedMs=%d files=%o',
        group.name,
        workspaceRel,
        sampled.length,
        Date.now() - sampleStartedAt,
        sampled
      )
      let extractedCount = 0
      let lastExtractionError: string | undefined

      const sampledAbs = sampled.map((sampledRel) => path.resolve(workspaceAbs, sampledRel))
      const extractStartedAt = Date.now()
      const results = await extractRulesForWorkspaceSamples(workspaceAbs, sampledAbs)
      debugTiming(
        'phase=extract group=%s workspace=%s sampled=%d elapsedMs=%d',
        group.name,
        workspaceRel,
        sampledAbs.length,
        Date.now() - extractStartedAt
      )

      for (const result of results) {
        if (result.rules) {
          extractedForGroup.push(result.rules)
          extractedCount += 1
          continue
        }

        const message = result.error instanceof Error ? result.error.message : String(result.error)
        if (isRecoverableExtractionError(message) || allowWorkspaceExtractionFailure) {
          lastExtractionError = message
          continue
        }

        throw result.error ?? new Error(message)
      }

      if (extractedCount === 0) {
        const context = lastExtractionError ? ` Last error: ${lastExtractionError}` : ''
        if (allowWorkspaceExtractionFailure && isSkippableWorkspaceExtractionFailure(lastExtractionError)) {
          onWorkspaceSkipped?.({
            groupId: group.name,
            workspaceRel,
            reason: lastExtractionError ?? 'unknown extraction failure'
          })
          debugWorkspace(
            'group=%s workspace=%s skipped=true reason=%s',
            group.name,
            workspaceRel,
            lastExtractionError ?? 'unknown extraction failure'
          )
          continue
        }

        throw new Error(`Unable to extract ESLint config for workspace ${workspaceRel}.${context}`)
      }
      extractedWorkspaces.push(workspaceRel)

      debugWorkspace(
        'group=%s workspace=%s extracted=%d failed=%d',
        group.name,
        workspaceRel,
        extractedCount,
        results.length - extractedCount
      )
    }

    if (extractedForGroup.length === 0) {
      if (allowWorkspaceExtractionFailure) {
        debugWorkspace('group=%s skipped=true reason=no-extracted-workspaces', group.name)
        continue
      }
      throw new Error(`Unable to extract ESLint config for group ${group.name}: no workspace produced a valid config`)
    }

    const aggregated = aggregateRules(extractedForGroup)
    snapshots.set(group.name, buildSnapshot(group.name, extractedWorkspaces, aggregated))
    debugWorkspace(
      'group=%s aggregatedRules=%d groupElapsedMs=%d',
      group.name,
      aggregated.size,
      Date.now() - groupStartedAt
    )
  }

  debugTiming('phase=computeCurrentSnapshots elapsedMs=%d', Date.now() - computeStartedAt)
  if (snapshots.size === 0) {
    throw new Error('Unable to extract ESLint config from discovered workspaces in zero-config mode')
  }
  return snapshots
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
