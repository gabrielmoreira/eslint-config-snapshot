#!/usr/bin/env node
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
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import fg from 'fast-glob'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'


const SNAPSHOT_DIR = '.eslint-config-snapshots'

type BuiltSnapshot = Awaited<ReturnType<typeof buildSnapshot>>
type StoredSnapshot = Awaited<ReturnType<typeof readSnapshotFile>>
type SnapshotDiff = ReturnType<typeof diffSnapshots>
type CheckFormat = 'summary' | 'status' | 'diff'
type PrintFormat = 'json' | 'short'

type RootOptions = {
  update?: boolean
}

export async function runCli(command: string | undefined, cwd: string, flags: string[] = []): Promise<number> {
  const argv = command ? [command, ...flags] : [...flags]
  return runArgv(argv, cwd)
}

async function runArgv(argv: string[], cwd: string): Promise<number> {
  const hasCommandToken = argv.some((token) => !token.startsWith('-'))
  if (!hasCommandToken) {
    return runDefaultInvocation(argv, cwd)
  }

  let actionCode: number | undefined

  const program = createProgram(cwd, (code) => {
    actionCode = code
  })

  try {
    await program.parseAsync(argv, { from: 'user' })
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed') {
        return 0
      }
      return error.exitCode
    }

    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    return 1
  }

  return actionCode ?? 0
}

async function runDefaultInvocation(argv: string[], cwd: string): Promise<number> {
  const known = new Set(['-u', '--update', '-h', '--help'])
  for (const token of argv) {
    if (!known.has(token)) {
      process.stderr.write(`error: unknown option '${token}'\n`)
      return 1
    }
  }

  if (argv.includes('-h') || argv.includes('--help')) {
    const program = createProgram(cwd, () => {
      // no-op
    })
    program.outputHelp()
    return 0
  }

  if (argv.includes('-u') || argv.includes('--update')) {
    return executeUpdate(cwd, true)
  }

  return executeCheck(cwd, 'summary')
}

function createProgram(cwd: string, onActionExit: (code: number) => void): Command {
  const program = new Command()

  program
    .name('eslint-config-snapshotter')
    .description('Deterministic ESLint config snapshot drift checker for workspaces')
    .showHelpAfterError('(add --help for usage)')
    .option('-u, --update', 'Update snapshots (default mode only)')

  program.hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<RootOptions>()
    if (opts.update) {
      throw new Error('--update can only be used without a command')
    }
  })

  program
    .command('check')
    .description('Compare current state against stored snapshots')
    .option('--format <format>', 'Output format: summary|status|diff', parseCheckFormat, 'summary')
    .action(async (opts: { format: CheckFormat }) => {
      onActionExit(await executeCheck(cwd, opts.format))
    })

  program
    .command('update')
    .alias('snapshot')
    .description('Compute and write snapshots to .eslint-config-snapshots/')
    .action(async () => {
      onActionExit(await executeUpdate(cwd, true))
    })

  program
    .command('print')
    .description('Print aggregated rules')
    .option('--format <format>', 'Output format: json|short', parsePrintFormat, 'json')
    .option('--short', 'Alias for --format short')
    .action(async (opts: { format: PrintFormat; short?: boolean }) => {
      const format: PrintFormat = opts.short ? 'short' : opts.format
      await executePrint(cwd, format)
      onActionExit(0)
    })

  program
    .command('init')
    .description('Create eslint-config-snapshotter.config.mjs')
    .action(async () => {
      onActionExit(await runInit(cwd))
    })

  // Backward-compatible aliases kept out of help.
  program
    .command('compare', { hidden: true })
    .action(async () => {
      onActionExit(await executeCheck(cwd, 'diff'))
    })

  program
    .command('status', { hidden: true })
    .action(async () => {
      onActionExit(await executeCheck(cwd, 'status'))
    })

  program
    .command('what-changed', { hidden: true })
    .action(async () => {
      onActionExit(await executeCheck(cwd, 'summary'))
    })

  program.exitOverride()
  return program
}

function parseCheckFormat(value: string): CheckFormat {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'summary' || normalized === 'status' || normalized === 'diff') {
    return normalized
  }

  throw new InvalidArgumentError('Expected one of: summary, status, diff')
}

function parsePrintFormat(value: string): PrintFormat {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'json' || normalized === 'short') {
    return normalized
  }

  throw new InvalidArgumentError('Expected one of: json, short')
}

async function executeCheck(cwd: string, format: CheckFormat): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
  if (!foundConfig) {
    process.stdout.write(
      'No snapshotter config found.\nRun `eslint-config-snapshotter init` to create one, then run `eslint-config-snapshotter --update`.\n'
    )
    return 1
  }

  const currentSnapshots = await computeCurrentSnapshots(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd)

  if (storedSnapshots.size === 0) {
    process.stdout.write('No local snapshots found to compare against.\nRun `eslint-config-snapshotter --update` first.\n')
    return 1
  }

  const changes = compareSnapshotMaps(storedSnapshots, currentSnapshots)

  if (format === 'status') {
    if (changes.length === 0) {
      process.stdout.write('clean\n')
      return 0
    }

    process.stdout.write('changes\n')
    return 1
  }

  if (format === 'diff') {
    if (changes.length === 0) {
      process.stdout.write('No snapshot changes detected.\n')
      return 0
    }

    for (const change of changes) {
      process.stdout.write(`${formatDiff(change.groupId, change.diff)}\n`)
    }

    return 1
  }

  return printWhatChanged(changes, currentSnapshots)
}

async function executeUpdate(cwd: string, printSummary: boolean): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
  if (!foundConfig) {
    process.stdout.write(
      'No snapshotter config found.\nRun `eslint-config-snapshotter init` to create one, then run `eslint-config-snapshotter --update`.\n'
    )
    return 1
  }

  const currentSnapshots = await computeCurrentSnapshots(cwd)
  await writeSnapshots(cwd, currentSnapshots)

  if (printSummary) {
    const summary = summarizeSnapshots(currentSnapshots)
    process.stdout.write(`Snapshots updated: ${summary.groups} groups, ${summary.rules} rules.\n`)
  }

  return 0
}

async function executePrint(cwd: string, format: PrintFormat): Promise<void> {
  const currentSnapshots = await computeCurrentSnapshots(cwd)

  if (format === 'short') {
    process.stdout.write(formatShortPrint([...currentSnapshots.values()]))
    return
  }

  const output = [...currentSnapshots.values()].map((snapshot) => ({
    groupId: snapshot.groupId,
    rules: snapshot.rules
  }))
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

async function computeCurrentSnapshots(cwd: string): Promise<Map<string, BuiltSnapshot>> {
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

  const snapshots = new Map<string, BuiltSnapshot>()

  for (const group of assignments) {
    const extractedForGroup = []

    for (const workspaceRel of group.workspaces) {
      const workspaceAbs = path.resolve(discovery.rootAbs, workspaceRel)
      const sampled = await sampleWorkspaceFiles(workspaceAbs, config.sampling)
      let extractedCount = 0
      let lastExtractionError: string | undefined

      for (const sampledRel of sampled) {
        const sampledAbs = path.resolve(workspaceAbs, sampledRel)
        try {
          extractedForGroup.push(extractRulesFromPrintConfig(workspaceAbs, sampledAbs))
          extractedCount += 1
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          if (
            message.startsWith('Invalid JSON from eslint --print-config') ||
            message.startsWith('Empty ESLint print-config output')
          ) {
            lastExtractionError = message
            continue
          }

          throw error
        }
      }

      if (extractedCount === 0) {
        const context = lastExtractionError ? ` Last error: ${lastExtractionError}` : ''
        throw new Error(
          `Unable to extract ESLint config for workspace ${workspaceRel}. All sampled files were ignored or produced non-JSON output.${context}`
        )
      }
    }

    const aggregated = aggregateRules(extractedForGroup)
    snapshots.set(group.name, buildSnapshot(group.name, group.workspaces, aggregated))
  }

  return snapshots
}

async function loadStoredSnapshots(cwd: string): Promise<Map<string, StoredSnapshot>> {
  const dir = path.join(cwd, SNAPSHOT_DIR)
  const files = await fg('**/*.json', { cwd: dir, absolute: true, onlyFiles: true, dot: true, suppressErrors: true })
  const snapshots = new Map<string, StoredSnapshot>()
  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b))

  for (const file of sortedFiles) {
    const snapshot = await readSnapshotFile(file)
    snapshots.set(snapshot.groupId, snapshot)
  }

  return snapshots
}

async function writeSnapshots(cwd: string, snapshots: Map<string, BuiltSnapshot>): Promise<void> {
  await mkdir(path.join(cwd, SNAPSHOT_DIR), { recursive: true })
  for (const snapshot of snapshots.values()) {
    await writeSnapshotFile(path.join(cwd, SNAPSHOT_DIR), snapshot)
  }
}

function compareSnapshotMaps(before: Map<string, StoredSnapshot>, after: Map<string, BuiltSnapshot>) {
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

  return changes
}

function formatDiff(groupId: string, diff: SnapshotDiff): string {
  const lines = [`group: ${groupId}`]

  addListSection(lines, 'introduced rules', diff.introducedRules)
  addListSection(lines, 'removed rules', diff.removedRules)

  if (diff.severityChanges.length > 0) {
    lines.push('severity changed:')
    for (const change of diff.severityChanges) {
      lines.push(`  - ${change.rule}: ${change.before} -> ${change.after}`)
    }
  }

  const optionChanges = getDisplayOptionChanges(diff)
  if (optionChanges.length > 0) {
    lines.push('options changed:')
    for (const change of optionChanges) {
      lines.push(`  - ${change.rule}: ${formatValue(change.before)} -> ${formatValue(change.after)}`)
    }
  }

  addListSection(lines, 'workspaces added', diff.workspaceMembershipChanges.added)
  addListSection(lines, 'workspaces removed', diff.workspaceMembershipChanges.removed)

  return lines.join('\n')
}

function addListSection(lines: string[], title: string, values: string[]): void {
  if (values.length === 0) {
    return
  }

  lines.push(`${title}:`)
  for (const value of values) {
    lines.push(`  - ${value}`)
  }
}

function formatValue(value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? 'undefined' : serialized
}

function getDisplayOptionChanges(diff: SnapshotDiff): SnapshotDiff['optionChanges'] {
  const removedRules = new Set(diff.removedRules)
  const severityChangedRules = new Set(diff.severityChanges.map((change) => change.rule))
  return diff.optionChanges.filter((change) => !removedRules.has(change.rule) && !severityChangedRules.has(change.rule))
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
  const code = await runArgv(process.argv.slice(2), process.cwd())
  process.exit(code)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}

function printWhatChanged(changes: Array<{ groupId: string; diff: SnapshotDiff }>, currentSnapshots: Map<string, BuiltSnapshot>): number {
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

function summarizeChanges(changes: Array<{ groupId: string; diff: SnapshotDiff }>) {
  let introduced = 0
  let removed = 0
  let severity = 0
  let options = 0
  let workspace = 0
  for (const change of changes) {
    introduced += change.diff.introducedRules.length
    removed += change.diff.removedRules.length
    severity += change.diff.severityChanges.length
    options += getDisplayOptionChanges(change.diff).length
    workspace += change.diff.workspaceMembershipChanges.added.length + change.diff.workspaceMembershipChanges.removed.length
  }
  return { introduced, removed, severity, options, workspace }
}

function summarizeSnapshots(snapshots: Map<string, BuiltSnapshot>) {
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
