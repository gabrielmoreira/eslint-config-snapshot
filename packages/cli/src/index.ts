#!/usr/bin/env node
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import fg from 'fast-glob'

import { getConfigScaffold, loadConfig } from '@eslint-config-snapshotter/config'
import { hasDiff, diffSnapshots } from '@eslint-config-snapshotter/diff'
import { extractRulesFromPrintConfig } from '@eslint-config-snapshotter/extract'
import { sampleWorkspaceFiles } from '@eslint-config-snapshotter/sampling'
import { aggregateRules, buildSnapshot, readSnapshotFile, writeSnapshotFile } from '@eslint-config-snapshotter/snapshot'
import { assignGroupsByMatch, discoverWorkspaces } from '@eslint-config-snapshotter/workspace'

const SNAPSHOT_DIR = '.eslint-config-snapshots'
const HELP_TEXT = `eslint-config-snapshotter

Usage:
  eslint-config-snapshotter <command>

Commands:
  snapshot   Compute and write snapshots to .eslint-config-snapshots/
  compare    Compare current state against stored snapshots
  status     Print minimal status (clean/changes)
  print      Print aggregated rules JSON to stdout
  init       Create eslint-config-snapshotter.config.mjs
  help       Show this help

Options:
  -h, --help Show this help
`

export async function runCli(command: string, cwd: string): Promise<number> {
  if (['help', '-h', '--help'].includes(command)) {
    process.stdout.write(HELP_TEXT)
    return 0
  }

  if (command === 'init') {
    return runInit(cwd)
  }

  if (!['snapshot', 'compare', 'status', 'print'].includes(command)) {
    console.error(`Unknown command: ${command}`)
    return 1
  }

  const currentSnapshots = await computeCurrentSnapshots(cwd)

  if (command === 'snapshot') {
    await mkdir(path.join(cwd, SNAPSHOT_DIR), { recursive: true })
    for (const snapshot of currentSnapshots.values()) {
      await writeSnapshotFile(path.join(cwd, SNAPSHOT_DIR), snapshot)
    }
    return 0
  }

  if (command === 'print') {
    const output = [...currentSnapshots.values()].map((snapshot) => ({
      groupId: snapshot.groupId,
      rules: snapshot.rules
    }))
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    return 0
  }

  const storedSnapshots = await loadStoredSnapshots(cwd)
  const changes = compareSnapshotMaps(storedSnapshots, currentSnapshots)

  if (command === 'compare') {
    if (changes.length === 0) {
      process.stdout.write('No snapshot changes detected.\n')
      return 0
    }
    for (const change of changes) {
      process.stdout.write(`${formatDiff(change.groupId, change.diff)}\n`)
    }
    return 1
  }

  if (changes.length === 0) {
    process.stdout.write('clean\n')
    return 0
  }

  process.stdout.write('changes\n')
  return 1
}

async function computeCurrentSnapshots(cwd: string) {
  const config = await loadConfig(cwd)
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

  const snapshots = new Map<string, Awaited<ReturnType<typeof buildSnapshot>>>()

  for (const group of assignments) {
    const extractedForGroup = []

    for (const workspaceRel of group.workspaces) {
      const workspaceAbs = path.resolve(discovery.rootAbs, workspaceRel)
      const sampled = await sampleWorkspaceFiles(workspaceAbs, config.sampling)

      for (const sampledRel of sampled) {
        const sampledAbs = path.resolve(workspaceAbs, sampledRel)
        extractedForGroup.push(extractRulesFromPrintConfig(workspaceAbs, sampledAbs))
      }
    }

    const aggregated = aggregateRules(extractedForGroup)
    snapshots.set(group.name, buildSnapshot(group.name, group.workspaces, aggregated))
  }

  return snapshots
}

async function loadStoredSnapshots(cwd: string) {
  const dir = path.join(cwd, SNAPSHOT_DIR)
  const files = await fg('*.json', { cwd: dir, absolute: true, onlyFiles: true, dot: true, suppressErrors: true })
  const snapshots = new Map<string, Awaited<ReturnType<typeof readSnapshotFile>>>()

  for (const file of files.sort()) {
    const snapshot = await readSnapshotFile(file)
    snapshots.set(snapshot.groupId, snapshot)
  }

  return snapshots
}

function compareSnapshotMaps(
  before: Map<string, Awaited<ReturnType<typeof readSnapshotFile>>>,
  after: Map<string, Awaited<ReturnType<typeof buildSnapshot>>>
) {
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort()
  const changes: Array<{ groupId: string; diff: ReturnType<typeof diffSnapshots> }> = []

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

  return changes
}

function formatDiff(groupId: string, diff: ReturnType<typeof diffSnapshots>): string {
  const lines = [`group: ${groupId}`]

  if (diff.introducedRules.length > 0) {
    lines.push(`introduced rules: ${diff.introducedRules.join(', ')}`)
  }
  if (diff.removedRules.length > 0) {
    lines.push(`removed rules: ${diff.removedRules.join(', ')}`)
  }
  if (diff.severityChanges.length > 0) {
    for (const change of diff.severityChanges) {
      lines.push(`severity changed: ${change.rule} ${change.before} -> ${change.after}`)
    }
  }
  if (diff.optionChanges.length > 0) {
    for (const change of diff.optionChanges) {
      lines.push(`options changed: ${change.rule} ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`)
    }
  }
  if (diff.workspaceMembershipChanges.added.length > 0) {
    lines.push(`workspaces added: ${diff.workspaceMembershipChanges.added.join(', ')}`)
  }
  if (diff.workspaceMembershipChanges.removed.length > 0) {
    lines.push(`workspaces removed: ${diff.workspaceMembershipChanges.removed.join(', ')}`)
  }

  return lines.join('\n')
}

async function runInit(cwd: string): Promise<number> {
  const candidates = [
    '.eslint-config-snapshotter.js',
    '.eslint-config-snapshotter.cjs',
    '.eslint-config-snapshotter.mjs',
    'eslint-config-snapshotter.config.js',
    'eslint-config-snapshotter.config.cjs',
    'eslint-config-snapshotter.config.mjs'
  ]

  for (const candidate of candidates) {
    try {
      await access(path.join(cwd, candidate))
      process.stderr.write(`Config already exists: ${candidate}\n`)
      return 1
    } catch {
      // continue
    }
  }

  const target = path.join(cwd, 'eslint-config-snapshotter.config.mjs')
  await writeFile(target, getConfigScaffold(), 'utf8')
  process.stdout.write(`Created ${path.basename(target)}\n`)
  return 0
}

export async function main(): Promise<void> {
  const command = process.argv[2] ?? 'status'
  try {
    const code = await runCli(command, process.cwd())
    process.exit(code)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
