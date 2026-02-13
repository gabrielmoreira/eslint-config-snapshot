#!/usr/bin/env node
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import fg from 'fast-glob'

import {
  aggregateRules,
  assignGroupsByMatch,
  buildSnapshot,
  diffSnapshots,
  discoverWorkspaces,
  extractRulesFromPrintConfig,
  findConfigPath,
  getConfigScaffold,
  hasDiff,
  loadConfig,
  readSnapshotFile,
  sampleWorkspaceFiles,
  writeSnapshotFile
} from '@eslint-config-snapshotter/api'

const SNAPSHOT_DIR = '.eslint-config-snapshots'
const HELP_TEXT = `eslint-config-snapshotter

Usage:
  eslint-config-snapshotter [command] [options]

Commands:
  snapshot   Compute and write snapshots to .eslint-config-snapshots/
  compare    Compare current state against stored snapshots
  what-changed Compare current state against stored snapshots and print a human summary
  status     Print minimal status (clean/changes)
  print      Print aggregated rules (JSON by default)
  init       Create eslint-config-snapshotter.config.mjs
  help       Show this help

Options:
  -h, --help   Show this help
  --update     Update snapshots (usable without command)
  --short      Print compact human-readable output (print command only)
`

export async function runCli(command: string | undefined, cwd: string, flags: string[] = []): Promise<number> {
  if (command && ['help', '-h', '--help'].includes(command)) {
    process.stdout.write(HELP_TEXT)
    return 0
  }

  const options = parseFlags(flags)
  if (!command && options.help) {
    process.stdout.write(HELP_TEXT)
    return 0
  }

  if (!command) {
    return runDefaultMode(cwd, options)
  }

  if (command === 'init') {
    return runInit(cwd)
  }

  if (!['snapshot', 'compare', 'status', 'print', 'what-changed'].includes(command)) {
    console.error(`Unknown command: ${command}`)
    return 1
  }

  if (options.update && command !== 'snapshot') {
    throw new Error('--update can only be used without command or with snapshot')
  }

  const currentSnapshots = await computeCurrentSnapshots(cwd)

  if (command === 'snapshot') {
    await writeSnapshots(cwd, currentSnapshots)
    return 0
  }

  if (command === 'print') {
    if (options.short) {
      process.stdout.write(formatShortPrint([...currentSnapshots.values()]))
    } else {
      const output = [...currentSnapshots.values()].map((snapshot) => ({
        groupId: snapshot.groupId,
        rules: snapshot.rules
      }))
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    }
    return 0
  }

  const storedSnapshots = await loadStoredSnapshots(cwd)
  if (storedSnapshots.size === 0 && (command === 'compare' || command === 'what-changed')) {
    process.stdout.write('No local snapshots found to compare against.\nRun `eslint-config-snapshotter --update` first.\n')
    return 1
  }

  const changes = compareSnapshotMaps(storedSnapshots, currentSnapshots)

  if (command === 'what-changed') {
    return printWhatChanged(changes, currentSnapshots)
  }

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

async function runDefaultMode(cwd: string, options: CliFlags): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
  if (!foundConfig) {
    process.stdout.write(
      'No snapshotter config found.\nRun `eslint-config-snapshotter init` to create one, then run `eslint-config-snapshotter --update`.\n'
    )
    return 1
  }

  const currentSnapshots = await computeCurrentSnapshots(cwd)
  if (options.update) {
    await writeSnapshots(cwd, currentSnapshots)
    const summary = summarizeSnapshots(currentSnapshots)
    process.stdout.write(`Snapshots updated: ${summary.groups} groups, ${summary.rules} rules.\n`)
    return 0
  }

  const storedSnapshots = await loadStoredSnapshots(cwd)
  if (storedSnapshots.size === 0) {
    process.stdout.write('No local snapshots found to compare against.\nRun `eslint-config-snapshotter --update` first.\n')
    return 1
  }

  const changes = compareSnapshotMaps(storedSnapshots, currentSnapshots)
  return printWhatChanged(changes, currentSnapshots)
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
  const files = await fg('**/*.json', { cwd: dir, absolute: true, onlyFiles: true, dot: true, suppressErrors: true })
  const snapshots = new Map<string, Awaited<ReturnType<typeof readSnapshotFile>>>()

  for (const file of files.sort()) {
    const snapshot = await readSnapshotFile(file)
    snapshots.set(snapshot.groupId, snapshot)
  }

  return snapshots
}

async function writeSnapshots(cwd: string, snapshots: Map<string, Awaited<ReturnType<typeof buildSnapshot>>>) {
  await mkdir(path.join(cwd, SNAPSHOT_DIR), { recursive: true })
  for (const snapshot of snapshots.values()) {
    await writeSnapshotFile(path.join(cwd, SNAPSHOT_DIR), snapshot)
  }
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
  const [arg1, ...rest] = process.argv.slice(2)
  const command = arg1 && !arg1.startsWith('-') ? arg1 : undefined
  const flags = command ? rest : process.argv.slice(2)
  try {
    const code = await runCli(command, process.cwd(), flags)
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

type CliFlags = {
  help: boolean
  update: boolean
  short: boolean
}

function parseFlags(flags: readonly string[]): CliFlags {
  const options: CliFlags = { help: false, update: false, short: false }
  for (const flag of flags) {
    if (flag === '-h' || flag === '--help') {
      options.help = true
      continue
    }
    if (flag === '--update') {
      options.update = true
      continue
    }
    if (flag === '--short') {
      options.short = true
      continue
    }
    throw new Error(`Unknown option: ${flag}`)
  }
  return options
}

function printWhatChanged(
  changes: Array<{ groupId: string; diff: ReturnType<typeof diffSnapshots> }>,
  currentSnapshots: Map<string, Awaited<ReturnType<typeof buildSnapshot>>>
): number {
  const color = createColorizer()
  const currentSummary = summarizeSnapshots(currentSnapshots)
  const changeSummary = summarizeChanges(changes)

  if (changes.length === 0) {
    process.stdout.write(color.green('No snapshot drift detected.\n'))
    process.stdout.write(
      `Current baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules (${currentSummary.error} error, ${currentSummary.warn} warn, ${currentSummary.off} off).\n`
    )
    return 0
  }

  process.stdout.write(color.red('Snapshot drift detected.\n'))
  process.stdout.write(
    `Changed groups: ${changes.length} | introduced: ${changeSummary.introduced} | removed: ${changeSummary.removed} | severity: ${changeSummary.severity} | options: ${changeSummary.options} | workspace membership: ${changeSummary.workspace}\n`
  )
  process.stdout.write(
    `Current rules: ${currentSummary.rules} (${currentSummary.error} error, ${currentSummary.warn} warn, ${currentSummary.off} off)\n\n`
  )

  for (const change of changes) {
    process.stdout.write(color.bold(`group ${change.groupId}\n`))
    const lines = formatDiff(change.groupId, change.diff).split('\n').slice(1)
    for (const line of lines) {
      const decorated = decorateDiffLine(line, color)
      process.stdout.write(`${decorated}\n`)
    }
    process.stdout.write('\n')
  }

  return 1
}

function summarizeChanges(changes: Array<{ groupId: string; diff: ReturnType<typeof diffSnapshots> }>) {
  let introduced = 0
  let removed = 0
  let severity = 0
  let options = 0
  let workspace = 0
  for (const change of changes) {
    introduced += change.diff.introducedRules.length
    removed += change.diff.removedRules.length
    severity += change.diff.severityChanges.length
    options += change.diff.optionChanges.length
    workspace += change.diff.workspaceMembershipChanges.added.length + change.diff.workspaceMembershipChanges.removed.length
  }
  return { introduced, removed, severity, options, workspace }
}

function summarizeSnapshots(snapshots: Map<string, Awaited<ReturnType<typeof buildSnapshot>>>) {
  let rules = 0
  let error = 0
  let warn = 0
  let off = 0
  for (const snapshot of snapshots.values()) {
    for (const entry of Object.values(snapshot.rules)) {
      rules += 1
      if (entry[0] === 'error') {
        error += 1
      } else if (entry[0] === 'warn') {
        warn += 1
      } else {
        off += 1
      }
    }
  }
  return { groups: snapshots.size, rules, error, warn, off }
}

function decorateDiffLine(line: string, color: ReturnType<typeof createColorizer>): string {
  if (line.startsWith('introduced rules:') || line.startsWith('workspaces added:')) {
    return color.green(`+ ${line}`)
  }
  if (line.startsWith('removed rules:') || line.startsWith('workspaces removed:')) {
    return color.red(`- ${line}`)
  }
  if (line.startsWith('severity changed:') || line.startsWith('options changed:')) {
    return color.yellow(`~ ${line}`)
  }
  return line
}

function createColorizer() {
  const enabled = process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
  const wrap = (code: string, text: string) => (enabled ? `\u001B[${code}m${text}\u001B[0m` : text)
  return {
    green: (text: string) => wrap('32', text),
    yellow: (text: string) => wrap('33', text),
    red: (text: string) => wrap('31', text),
    bold: (text: string) => wrap('1', text)
  }
}

function formatShortPrint(
  snapshots: Array<{
    groupId: string
    workspaces: string[]
    rules: Record<string, [severity: 'off' | 'warn' | 'error'] | [severity: 'off' | 'warn' | 'error', options: unknown]>
  }>
): string {
  const lines: string[] = []
  const sorted = [...snapshots].sort((a, b) => a.groupId.localeCompare(b.groupId))

  for (const snapshot of sorted) {
    const ruleNames = Object.keys(snapshot.rules).sort()
    const severityCounts = { error: 0, warn: 0, off: 0 }

    for (const name of ruleNames) {
      const severity = snapshot.rules[name][0]
      severityCounts[severity] += 1
    }

    lines.push(
      `group: ${snapshot.groupId}`,
      `workspaces (${snapshot.workspaces.length}): ${snapshot.workspaces.length > 0 ? snapshot.workspaces.join(', ') : '(none)'}`,
      `rules (${ruleNames.length}): error ${severityCounts.error}, warn ${severityCounts.warn}, off ${severityCounts.off}`
    )

    for (const ruleName of ruleNames) {
      const entry = snapshot.rules[ruleName]
      const suffix = entry.length > 1 ? ` ${JSON.stringify(entry[1])}` : ''
      lines.push(`${ruleName}: ${entry[0]}${suffix}`)
    }
  }

  return `${lines.join('\n')}\n`
}
