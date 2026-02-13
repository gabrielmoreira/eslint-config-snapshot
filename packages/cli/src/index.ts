#!/usr/bin/env node
import {
  aggregateRules,
  assignGroupsByMatch,
  buildSnapshot,
  diffSnapshots,
  discoverWorkspaces,
  extractRulesForWorkspaceSamples,
  findConfigPath,
  getConfigScaffold,
  hasDiff,
  loadConfig,
  normalizePath,
  readSnapshotFile,
  resolveEslintVersionForWorkspace,
  sampleWorkspaceFiles,
  writeSnapshotFile
} from '@eslint-config-snapshot/api'
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import createDebug from 'debug'
import fg from 'fast-glob'
import { existsSync, readFileSync } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createInterface } from 'node:readline'


const SNAPSHOT_DIR = '.eslint-config-snapshot'
const UPDATE_HINT = 'Tip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'

type BuiltSnapshot = Awaited<ReturnType<typeof buildSnapshot>>
type StoredSnapshot = Awaited<ReturnType<typeof readSnapshotFile>>
type SnapshotDiff = ReturnType<typeof diffSnapshots>
type CheckFormat = 'summary' | 'status' | 'diff'
type PrintFormat = 'json' | 'short'
type InitTarget = 'file' | 'package-json'
type InitPreset = 'recommended' | 'minimal' | 'full'
type RuleEntry = [severity: 'off' | 'warn' | 'error'] | [severity: 'off' | 'warn' | 'error', options: unknown]
type RuleObject = Record<string, RuleEntry>
type GroupEslintVersions = Map<string, string[]>

type RootOptions = {
  update?: boolean
}

type RunTimer = {
  label: string
  startedAtMs: number
  pausedMs: number
  pauseStartedAtMs: number | undefined
}

let activeRunTimer: RunTimer | undefined
let cachedCliVersion: string | undefined
const debugRun = createDebug('eslint-config-snapshot:run')
const debugWorkspace = createDebug('eslint-config-snapshot:workspace')
const debugDiff = createDebug('eslint-config-snapshot:diff')
const debugTiming = createDebug('eslint-config-snapshot:timing')

export async function runCli(command: string | undefined, cwd: string, flags: string[] = []): Promise<number> {
  const argv = command ? [command, ...flags] : [...flags]
  return runArgv(argv, cwd)
}

async function runArgv(argv: string[], cwd: string): Promise<number> {
  const invocationLabel = resolveInvocationLabel(argv)
  beginRunTimer(invocationLabel)
  debugRun('start label=%s cwd=%s argv=%o', invocationLabel, cwd, argv)
  let exitCode = 1

  try {
    const hasCommandToken = argv.some((token) => !token.startsWith('-'))
    if (!hasCommandToken) {
      exitCode = await runDefaultInvocation(argv, cwd)
      return exitCode
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
          exitCode = 0
          return exitCode
        }
        exitCode = error.exitCode
        return exitCode
      }

      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`${message}\n`)
      return 1
    }

    exitCode = actionCode ?? 0
    debugRun('done label=%s exitCode=%d', invocationLabel, exitCode)
    return exitCode
  } finally {
    endRunTimer(exitCode)
  }
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

  return executeCheck(cwd, 'summary', true)
}

function createProgram(cwd: string, onActionExit: (code: number) => void): Command {
  const program = new Command()

  program
    .name('eslint-config-snapshot')
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
    .description('Compute and write snapshots to .eslint-config-snapshot/')
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
    .command('config')
    .description('Print effective evaluated config')
    .option('--format <format>', 'Output format: json|short', parsePrintFormat, 'json')
    .option('--short', 'Alias for --format short')
    .action(async (opts: { format: PrintFormat; short?: boolean }) => {
      const format: PrintFormat = opts.short ? 'short' : opts.format
      await executeConfig(cwd, format)
      onActionExit(0)
    })

  program
    .command('init')
    .description('Initialize config (file or package.json)')
    .option('--target <target>', 'Config target: file|package-json', parseInitTarget)
    .option('--preset <preset>', 'Config preset: recommended|minimal|full', parseInitPreset)
    .option('--show-effective', 'Print the evaluated config that will be written')
    .option('-f, --force', 'Allow init even when an existing config is detected')
    .option('-y, --yes', 'Skip prompts and use defaults/options')
    .addHelpText(
      'after',
      `
Examples:
  $ eslint-config-snapshot init
    Runs interactive select prompts for target/preset.
    Recommended preset keeps a dynamic catch-all default group ("*") and asks only for static exception groups.

  $ eslint-config-snapshot init --yes --target package-json --preset recommended --show-effective
    Non-interactive recommended setup in package.json, with effective preview.

  $ eslint-config-snapshot init --yes --force --target file --preset full
    Overwrite-safe bypass when a config is already detected.
`
    )
    .action(async (opts: { target?: InitTarget; preset?: InitPreset; force?: boolean; yes?: boolean; showEffective?: boolean }) => {
      onActionExit(await runInit(cwd, opts))
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

function parseInitTarget(value: string): InitTarget {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'file' || normalized === 'package-json') {
    return normalized
  }

  throw new InvalidArgumentError('Expected one of: file, package-json')
}

function parseInitPreset(value: string): InitPreset {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'recommended' || normalized === 'minimal' || normalized === 'full') {
    return normalized
  }

  throw new InvalidArgumentError('Expected one of: recommended, minimal, full')
}

async function executeCheck(cwd: string, format: CheckFormat, defaultInvocation = false): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd)

  if (format !== 'status') {
    writeRunContextHeader(cwd, defaultInvocation ? 'check' : `check:${format}`, foundConfig?.path, storedSnapshots)
    if (shouldShowRunLogs()) {
      writeSubtleInfo('🔎 Checking current ESLint configuration...\n')
    }
  }

  if (!foundConfig) {
    writeSubtleInfo(
      'Tip: no explicit config found. Using safe built-in defaults. Run `eslint-config-snapshot init` to customize when needed.\n'
    )
  }

  let currentSnapshots: Map<string, BuiltSnapshot>
  try {
    currentSnapshots = await computeCurrentSnapshots(cwd)
  } catch (error: unknown) {
    if (!foundConfig) {
      process.stdout.write(
        'Automatic workspace discovery could not complete with defaults.\nRun `eslint-config-snapshot init` to configure workspaces, then run `eslint-config-snapshot --update`.\n'
      )
      return 1
    }

    throw error
  }
    if (storedSnapshots.size === 0) {
      const summary = summarizeSnapshots(currentSnapshots)
      process.stdout.write(
        `Rules found in this analysis: ${summary.groups} groups, ${summary.rules} rules (severity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off).\n`
      )

      const canPromptBaseline = defaultInvocation || format === 'summary'
      if (canPromptBaseline && process.stdin.isTTY && process.stdout.isTTY) {
        const shouldCreateBaseline = await askYesNo(
          'No baseline yet. Do you want to save this analyzed rule state as your baseline now? [Y/n] ',
          true
        )
      if (shouldCreateBaseline) {
        await writeSnapshots(cwd, currentSnapshots)
        const summary = summarizeSnapshots(currentSnapshots)
        process.stdout.write(`Great start: baseline created with ${summary.groups} groups and ${summary.rules} rules.\n`)
        writeSubtleInfo(UPDATE_HINT)
        return 0
      }
    }

    process.stdout.write('You are almost set: no baseline snapshot found yet.\n')
    process.stdout.write('Run `eslint-config-snapshot --update` to create your first baseline.\n')
    return 1
  }

  const changes = compareSnapshotMaps(storedSnapshots, currentSnapshots)
  const eslintVersionsByGroup = shouldShowRunLogs() ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()

  if (format === 'status') {
    if (changes.length === 0) {
      process.stdout.write('clean\n')
      return 0
    }

    process.stdout.write('changes\n')
    writeSubtleInfo(UPDATE_HINT)
    return 1
  }

  if (format === 'diff') {
    if (changes.length === 0) {
      process.stdout.write('Great news: no snapshot changes detected.\n')
      writeEslintVersionSummary(eslintVersionsByGroup)
      return 0
    }

    for (const change of changes) {
      process.stdout.write(`${formatDiff(change.groupId, change.diff)}\n`)
    }
    writeSubtleInfo(UPDATE_HINT)

    return 1
  }

  return printWhatChanged(changes, currentSnapshots, eslintVersionsByGroup)
}

async function executeUpdate(cwd: string, printSummary: boolean): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd)
  writeRunContextHeader(cwd, 'update', foundConfig?.path, storedSnapshots)
  if (shouldShowRunLogs()) {
    writeSubtleInfo('🔎 Checking current ESLint configuration...\n')
  }

  if (!foundConfig) {
    writeSubtleInfo(
      'Tip: no explicit config found. Using safe built-in defaults. Run `eslint-config-snapshot init` to customize when needed.\n'
    )
  }

  let currentSnapshots: Map<string, BuiltSnapshot>
  try {
    currentSnapshots = await computeCurrentSnapshots(cwd)
  } catch (error: unknown) {
    if (!foundConfig) {
      process.stdout.write(
        'Automatic workspace discovery could not complete with defaults.\nRun `eslint-config-snapshot init` to configure workspaces, then run `eslint-config-snapshot --update`.\n'
      )
      return 1
    }

    throw error
  }
  await writeSnapshots(cwd, currentSnapshots)

  if (printSummary) {
    const summary = summarizeSnapshots(currentSnapshots)
    const color = createColorizer()
    const eslintVersionsByGroup = shouldShowRunLogs() ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()
    writeSectionTitle('📊 Summary', color)
    process.stdout.write(
      `Baseline updated: ${summary.groups} groups, ${summary.rules} rules.\nSeverity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off.\n`
    )
    writeEslintVersionSummary(eslintVersionsByGroup)
  }

  return 0
}

async function executePrint(cwd: string, format: PrintFormat): Promise<void> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd)
  writeRunContextHeader(cwd, `print:${format}`, foundConfig?.path, storedSnapshots)
  if (shouldShowRunLogs()) {
    writeSubtleInfo('🔎 Checking current ESLint configuration...\n')
  }
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

async function executeConfig(cwd: string, format: PrintFormat): Promise<void> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd)
  writeRunContextHeader(cwd, `config:${format}`, foundConfig?.path, storedSnapshots)
  if (shouldShowRunLogs()) {
    writeSubtleInfo('⚙️ Resolving effective runtime configuration...\n')
  }
  const config = await loadConfig(cwd)
  const resolved = await resolveWorkspaceAssignments(cwd, config)
  const payload = {
    source: foundConfig?.path ?? 'built-in-defaults',
    workspaceInput: config.workspaceInput,
    workspaces: resolved.discovery.workspacesRel,
    grouping: {
      mode: config.grouping.mode,
      allowEmptyGroups: config.grouping.allowEmptyGroups ?? false,
      groups: resolved.assignments.map((entry) => ({ name: entry.name, workspaces: entry.workspaces }))
    },
    sampling: config.sampling
  }

  if (format === 'short') {
    process.stdout.write(formatShortConfig(payload))
    return
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

async function computeCurrentSnapshots(cwd: string): Promise<Map<string, BuiltSnapshot>> {
  const computeStartedAt = Date.now()
  const configStartedAt = Date.now()
  const config = await loadConfig(cwd)
  debugTiming('phase=loadConfig elapsedMs=%d', Date.now() - configStartedAt)

  const assignmentStartedAt = Date.now()
  const { discovery, assignments } = await resolveWorkspaceAssignments(cwd, config)
  debugTiming('phase=resolveWorkspaceAssignments elapsedMs=%d', Date.now() - assignmentStartedAt)
  debugWorkspace('root=%s groups=%d workspaces=%d', discovery.rootAbs, assignments.length, discovery.workspacesRel.length)

  const snapshots = new Map<string, BuiltSnapshot>()

  for (const group of assignments) {
    const groupStartedAt = Date.now()
    const extractedForGroup = []
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
        if (isRecoverableExtractionError(message)) {
          lastExtractionError = message
          continue
        }

        throw result.error ?? new Error(message)
      }

      if (extractedCount === 0) {
        const context = lastExtractionError ? ` Last error: ${lastExtractionError}` : ''
        throw new Error(
          `Unable to extract ESLint config for workspace ${workspaceRel}. All sampled files were ignored or produced non-JSON output.${context}`
        )
      }

      debugWorkspace(
        'group=%s workspace=%s extracted=%d failed=%d',
        group.name,
        workspaceRel,
        extractedCount,
        results.length - extractedCount
      )
    }

    const aggregated = aggregateRules(extractedForGroup)
    snapshots.set(group.name, buildSnapshot(group.name, group.workspaces, aggregated))
    debugWorkspace(
      'group=%s aggregatedRules=%d groupElapsedMs=%d',
      group.name,
      aggregated.size,
      Date.now() - groupStartedAt
    )
  }

  debugTiming('phase=computeCurrentSnapshots elapsedMs=%d', Date.now() - computeStartedAt)
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

async function resolveWorkspaceAssignments(cwd: string, config: Awaited<ReturnType<typeof loadConfig>>) {
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

async function runInit(
  cwd: string,
  opts: { target?: InitTarget; preset?: InitPreset; force?: boolean; yes?: boolean; showEffective?: boolean } = {}
): Promise<number> {
  const force = opts.force ?? false
  const showEffective = opts.showEffective ?? false
  const existing = await findConfigPath(cwd)
  if (existing && !force) {
    process.stderr.write(
      `Existing config detected at ${existing.path}. Creating another config can cause conflicts. Remove the existing config or rerun with --force.\n`
    )
    return 1
  }

  let target = opts.target
  let preset = opts.preset
  if (!opts.yes && !target && !preset && process.stdin.isTTY && process.stdout.isTTY) {
    const interactive = await askInitPreferences()
    target = interactive.target
    preset = interactive.preset
  }

  const finalTarget = target ?? 'file'
  const finalPreset = preset ?? 'recommended'
  const configObject = await resolveInitConfigObject(cwd, finalPreset, Boolean(opts.yes))

  if (showEffective) {
    process.stdout.write(`Effective config preview:\n${JSON.stringify(configObject, null, 2)}\n`)
  }

  if (finalTarget === 'package-json') {
    return runInitInPackageJson(cwd, configObject, force)
  }

  return runInitInFile(cwd, configObject, force)
}

async function askInitPreferences(): Promise<{ target: InitTarget; preset: InitPreset }> {
  const { select } = await import('@inquirer/prompts')
  const target = await runPromptWithPausedTimer(() => askInitTarget(select))
  const preset = await runPromptWithPausedTimer(() => askInitPreset(select))
  return { target, preset }
}

async function askInitTarget(
  selectPrompt: (options: { message: string; choices: Array<{ name: string; value: InitTarget }> }) => Promise<InitTarget>
): Promise<InitTarget> {
  return selectPrompt({
    message: 'Select config target',
    choices: [
      { name: 'package-json (recommended)', value: 'package-json' },
      { name: 'file', value: 'file' }
    ]
  })
}

async function askInitPreset(
  selectPrompt: (options: { message: string; choices: Array<{ name: string; value: InitPreset }> }) => Promise<InitPreset>
): Promise<InitPreset> {
  return selectPrompt({
    message: 'Select preset',
    choices: [
      { name: 'recommended (dynamic catch-all "*" + optional static exceptions)', value: 'recommended' },
      { name: 'minimal', value: 'minimal' },
      { name: 'full', value: 'full' }
    ]
  })
}

function askQuestion(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  pauseRunTimer()
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resumeRunTimer()
      resolve(answer)
    })
  })
}

async function askYesNo(prompt: string, defaultYes: boolean): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answerRaw = await askQuestion(rl, prompt)
    const answer = answerRaw.trim().toLowerCase()
    if (answer.length === 0) {
      return defaultYes
    }

    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

async function runInitInFile(cwd: string, configObject: Record<string, unknown>, force: boolean): Promise<number> {
  const candidates = [
    '.eslint-config-snapshot.js',
    '.eslint-config-snapshot.cjs',
    '.eslint-config-snapshot.mjs',
    'eslint-config-snapshot.config.js',
    'eslint-config-snapshot.config.cjs',
    'eslint-config-snapshot.config.mjs'
  ]

  for (const candidate of candidates) {
    try {
      await access(path.join(cwd, candidate))
      if (!force) {
        process.stderr.write(`Config already exists: ${candidate}\n`)
        return 1
      }
    } catch {
      // continue
    }
  }

  const target = path.join(cwd, 'eslint-config-snapshot.config.mjs')
  await writeFile(target, toConfigScaffold(configObject), 'utf8')
  process.stdout.write(`Created ${path.basename(target)}\n`)
  return 0
}

async function runInitInPackageJson(cwd: string, configObject: Record<string, unknown>, force: boolean): Promise<number> {
  const packageJsonPath = path.join(cwd, 'package.json')

  let packageJsonRaw: string
  try {
    packageJsonRaw = await readFile(packageJsonPath, 'utf8')
  } catch {
    process.stderr.write('package.json not found in current directory.\n')
    return 1
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(packageJsonRaw) as Record<string, unknown>
  } catch {
    process.stderr.write('Invalid package.json (must be valid JSON).\n')
    return 1
  }

  if (parsed['eslint-config-snapshot'] !== undefined && !force) {
      process.stderr.write('Config already exists in package.json: eslint-config-snapshot\n')
      return 1
    }

  parsed['eslint-config-snapshot'] = configObject
  await writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  process.stdout.write('Created config in package.json under "eslint-config-snapshot"\n')
  return 0
}

async function resolveInitConfigObject(
  cwd: string,
  preset: InitPreset,
  nonInteractive: boolean
): Promise<Record<string, unknown>> {
  if (preset === 'minimal') {
    return {}
  }

  if (preset === 'full') {
    return getFullPresetObject()
  }

  return buildRecommendedPresetObject(cwd, nonInteractive)
}

async function buildRecommendedPresetObject(cwd: string, nonInteractive: boolean): Promise<Record<string, unknown>> {
  const workspaces = await discoverInitWorkspaces(cwd)
  const useInteractiveGrouping = !nonInteractive && process.stdin.isTTY && process.stdout.isTTY
  const assignments = useInteractiveGrouping ? await askRecommendedGroupAssignments(workspaces) : new Map<string, number>()
  return buildRecommendedConfigFromAssignments(workspaces, assignments)
}

export function buildRecommendedConfigFromAssignments(
  workspaces: string[],
  assignments: Map<string, number>
): Record<string, unknown> {
  const groupNumbers = [...new Set(assignments.values())].sort((a, b) => a - b)
  if (groupNumbers.length === 0) {
    return {}
  }

  const explicitGroups = groupNumbers.map((number) => ({
    name: `group-${number}`,
    match: workspaces.filter((workspace) => assignments.get(workspace) === number)
  }))

  return {
    grouping: {
      mode: 'match',
      groups: [...explicitGroups, { name: 'default', match: ['**/*'] }]
    }
  }
}

async function discoverInitWorkspaces(cwd: string): Promise<string[]> {
  const discovered = await discoverWorkspaces({ cwd, workspaceInput: { mode: 'discover' } })
  if (!(discovered.workspacesRel.length === 1 && discovered.workspacesRel[0] === '.')) {
    return discovered.workspacesRel
  }

  const packageJsonPath = path.join(cwd, 'package.json')
  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { workspaces?: string[] | { packages?: string[] } }
    let workspacePatterns: string[] = []
    if (Array.isArray(parsed.workspaces)) {
      workspacePatterns = parsed.workspaces
    } else if (parsed.workspaces && typeof parsed.workspaces === 'object' && Array.isArray(parsed.workspaces.packages)) {
      workspacePatterns = parsed.workspaces.packages
    }

    if (workspacePatterns.length === 0) {
      return discovered.workspacesRel
    }

    const workspacePackageFiles = await fg(
      workspacePatterns.map((pattern) => `${trimTrailingSlashes(pattern)}/package.json`),
      { cwd, onlyFiles: true, dot: true }
    )
    const workspaceDirs = [...new Set(workspacePackageFiles.map((entry) => normalizePath(path.dirname(entry))))].sort((a, b) =>
      a.localeCompare(b)
    )
    if (workspaceDirs.length > 0) {
      return workspaceDirs
    }
  } catch {
    // fallback to discovered output
  }

  return discovered.workspacesRel
}

function trimTrailingSlashes(value: string): string {
  let normalized = value
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

async function askRecommendedGroupAssignments(workspaces: string[]): Promise<Map<string, number>> {
  const { checkbox, select } = await import('@inquirer/prompts')
  process.stdout.write(
    'Recommended setup: default group "*" is a dynamic catch-all for every discovered workspace.\n'
  )
  process.stdout.write('Select only workspaces that should move to explicit static groups.\n')
  const overrides = await runPromptWithPausedTimer(() =>
    checkbox<string>({
      message: 'Choose exception workspaces (leave empty to keep all in default "*"):',
      choices: workspaces.map((workspace) => ({ name: workspace, value: workspace })),
      pageSize: Math.min(12, Math.max(4, workspaces.length))
    })
  )

  const assignments = new Map<string, number>()
  let nextGroup = 1
  for (const workspace of overrides) {
    const usedGroups = [...new Set(assignments.values())].sort((a, b) => a - b)
    while (usedGroups.includes(nextGroup)) {
      nextGroup += 1
    }

    const selected = await runPromptWithPausedTimer(() =>
      select<number | 'new'>({
        message: `Select group for ${workspace}`,
        choices: [
          ...usedGroups.map((group) => ({ name: `group-${group}`, value: group })),
          { name: `create new group (group-${nextGroup})`, value: 'new' }
        ]
      })
    )
    const groupNumber = selected === 'new' ? nextGroup : selected
    assignments.set(workspace, groupNumber)
  }

  return assignments
}

function toConfigScaffold(configObject: Record<string, unknown>): string {
  if (Object.keys(configObject).length === 0) {
    return getConfigScaffold('minimal')
  }

  return `export default ${JSON.stringify(configObject, null, 2)}\n`
}

function getFullPresetObject() {
  return {
    workspaceInput: { mode: 'discover' },
    grouping: {
      mode: 'match',
      groups: [{ name: 'default', match: ['**/*'] }]
    },
    sampling: {
      maxFilesPerWorkspace: 10,
      includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
      excludeGlobs: ['**/node_modules/**', '**/dist/**'],
      hintGlobs: [
        '**/{config,setup}.{js,jsx,ts,tsx,cjs,mjs}',
        '**/*.{config,setup}.{js,jsx,ts,tsx,cjs,mjs}',
        '**/*.{service,controller,route,routes,handler,model,schema,repository,view,views}.{js,jsx,ts,tsx}',
        '**/{service,controller,route,routes,handler,model,schema,repository,view,views}/**/*.{js,jsx,ts,tsx,cjs,mjs}'
      ]
    }
  }
}

export async function main(): Promise<void> {
  const code = await runArgv(process.argv.slice(2), process.cwd())
  process.exit(code)
}

function isDirectCliExecution(): boolean {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }

  const normalized = path.basename(entry).toLowerCase()
  return normalized === 'index.js' || normalized === 'index.cjs' || normalized === 'index.ts' || normalized === 'eslint-config-snapshot'
}

if (isDirectCliExecution()) {
  void main()
}

function printWhatChanged(
  changes: Array<{ groupId: string; diff: SnapshotDiff }>,
  currentSnapshots: Map<string, BuiltSnapshot>,
  eslintVersionsByGroup: GroupEslintVersions
): number {
  const color = createColorizer()
  const currentSummary = summarizeSnapshots(currentSnapshots)
  const changeSummary = summarizeChanges(changes)

  if (changes.length === 0) {
    process.stdout.write(color.green('✅ Great news: no snapshot drift detected.\n'))
    writeSectionTitle('📊 Summary', color)
    process.stdout.write(
      `- 📦 baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- 🎚️ severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
    )
    writeEslintVersionSummary(eslintVersionsByGroup)
    return 0
  }

  process.stdout.write(color.red('⚠️ Heads up: snapshot drift detected.\n'))
  writeSectionTitle('📊 Summary', color)
  process.stdout.write(
    `- changed groups: ${changes.length}\n- introduced rules: ${changeSummary.introduced}\n- removed rules: ${changeSummary.removed}\n- severity changes: ${changeSummary.severity}\n- options changes: ${changeSummary.options}\n- workspace membership changes: ${changeSummary.workspace}\n- current baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- current severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
  )
  writeEslintVersionSummary(eslintVersionsByGroup)
  process.stdout.write('\n')

  writeSectionTitle('🧾 Changes', color)
  for (const change of changes) {
    process.stdout.write(color.bold(`group ${change.groupId}\n`))
    const lines = formatDiff(change.groupId, change.diff).split('\n').slice(1)
    for (const line of lines) {
      const decorated = decorateDiffLine(line, color)
      process.stdout.write(`${decorated}\n`)
    }
    process.stdout.write('\n')
  }
  writeSubtleInfo(UPDATE_HINT)

  return 1
}

function writeSectionTitle(title: string, color: ReturnType<typeof createColorizer>): void {
  process.stdout.write(`${color.bold(title)}\n`)
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
  const { rules, error, warn, off } = countRuleSeverities([...snapshots.values()].map((snapshot) => snapshot.rules))
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
    bold: (text: string) => wrap('1', text),
    dim: (text: string) => wrap('2', text)
  }
}

function writeSubtleInfo(text: string): void {
  const color = createColorizer()
  process.stdout.write(color.dim(text))
}

function resolveInvocationLabel(argv: string[]): string {
  const commandToken = argv.find((entry) => !entry.startsWith('-'))
  if (commandToken) {
    return commandToken
  }
  if (argv.includes('-u') || argv.includes('--update')) {
    return 'update'
  }
  if (argv.includes('-h') || argv.includes('--help')) {
    return 'help'
  }
  return 'check'
}

function shouldShowRunLogs(): boolean {
  if (process.env.ESLINT_CONFIG_SNAPSHOT_NO_PROGRESS === '1') {
    return false
  }
  return process.stdout.isTTY === true
}

function beginRunTimer(label: string): void {
  if (!shouldShowRunLogs()) {
    activeRunTimer = undefined
    return
  }

  activeRunTimer = {
    label,
    startedAtMs: Date.now(),
    pausedMs: 0,
    pauseStartedAtMs: undefined
  }
}

function endRunTimer(exitCode: number): void {
  if (!activeRunTimer || !shouldShowRunLogs()) {
    return
  }

  if (activeRunTimer.pauseStartedAtMs !== undefined) {
    activeRunTimer.pausedMs += Date.now() - activeRunTimer.pauseStartedAtMs
    activeRunTimer.pauseStartedAtMs = undefined
  }

  const elapsedMs = Math.max(0, Date.now() - activeRunTimer.startedAtMs - activeRunTimer.pausedMs)
  const seconds = (elapsedMs / 1000).toFixed(2)
  debugTiming(
    'command=%s exitCode=%d elapsedMs=%d pausedMs=%d',
    activeRunTimer.label,
    exitCode,
    elapsedMs,
    activeRunTimer.pausedMs
  )
  if (exitCode === 0) {
    writeSubtleInfo(`⏱️ Finished in ${seconds}s\n`)
  } else {
    writeSubtleInfo(`⏱️ Finished with errors in ${seconds}s\n`)
  }
  activeRunTimer = undefined
}

function pauseRunTimer(): void {
  if (!activeRunTimer || activeRunTimer.pauseStartedAtMs !== undefined) {
    return
  }
  activeRunTimer.pauseStartedAtMs = Date.now()
}

function resumeRunTimer(): void {
  if (!activeRunTimer || activeRunTimer.pauseStartedAtMs === undefined) {
    return
  }

  activeRunTimer.pausedMs += Date.now() - activeRunTimer.pauseStartedAtMs
  activeRunTimer.pauseStartedAtMs = undefined
}

async function runPromptWithPausedTimer<T>(prompt: () => Promise<T>): Promise<T> {
  pauseRunTimer()
  try {
    return await prompt()
  } finally {
    resumeRunTimer()
  }
}

function readCliVersion(): string {
  if (cachedCliVersion !== undefined) {
    return cachedCliVersion
  }

  const envPackageName = process.env.npm_package_name
  const envPackageVersion = process.env.npm_package_version
  if (isCliPackageName(envPackageName) && typeof envPackageVersion === 'string' && envPackageVersion.length > 0) {
    cachedCliVersion = envPackageVersion
    return cachedCliVersion
  }

  const scriptPath = process.argv[1]
  if (!scriptPath) {
    cachedCliVersion = 'unknown'
    return cachedCliVersion
  }

  try {
    const req = createRequire(path.resolve(scriptPath))
    const resolvedCliEntry = req.resolve('@eslint-config-snapshot/cli')
    const resolvedVersion = readVersionFromResolvedEntry(resolvedCliEntry)
    if (resolvedVersion !== undefined) {
      cachedCliVersion = resolvedVersion
      return cachedCliVersion
    }
  } catch {
    // continue to path-walk fallback
  }

  let current = path.resolve(path.dirname(scriptPath))
  let fallbackVersion: string | undefined
  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const raw = readFileSync(packageJsonPath, 'utf8')
        const parsed = JSON.parse(raw) as { name?: string; version?: string }
        if (typeof parsed.version === 'string' && parsed.version.length > 0) {
          if (isCliPackageName(parsed.name)) {
            cachedCliVersion = parsed.version
            return cachedCliVersion
          }

          if (fallbackVersion === undefined) {
            fallbackVersion = parsed.version
          }
        }
      } catch {
        // continue walking up
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  cachedCliVersion = fallbackVersion ?? 'unknown'
  return cachedCliVersion
}

function isCliPackageName(value: string | undefined): boolean {
  return value === '@eslint-config-snapshot/cli' || value === 'eslint-config-snapshot'
}

function readVersionFromResolvedEntry(entryAbs: string): string | undefined {
  let current = path.resolve(path.dirname(entryAbs))

  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const raw = readFileSync(packageJsonPath, 'utf8')
        const parsed = JSON.parse(raw) as { name?: string; version?: string }
        if (isCliPackageName(parsed.name) && typeof parsed.version === 'string' && parsed.version.length > 0) {
          return parsed.version
        }
      } catch {
        // continue walking up
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return undefined
}

function writeRunContextHeader(
  cwd: string,
  commandLabel: string,
  configPath: string | undefined,
  storedSnapshots: Map<string, StoredSnapshot>
): void {
  if (!shouldShowRunLogs()) {
    return
  }

  const color = createColorizer()
  process.stdout.write(color.bold(`eslint-config-snapshot v${readCliVersion()} • ${formatCommandDisplayLabel(commandLabel)}\n`))
  process.stdout.write(`📁 Repository: ${cwd}\n`)
  process.stdout.write(`📁 Baseline: ${formatStoredSnapshotSummary(storedSnapshots)}\n`)
  process.stdout.write(`⚙️ Config source: ${formatConfigSource(cwd, configPath)}\n`)
  process.stdout.write('\n')
}

function formatCommandDisplayLabel(commandLabel: string): string {
  switch (commandLabel) {
    case 'check':
    case 'check:summary': {
      return 'Check drift against baseline (summary)'
    }
    case 'check:diff': {
      return 'Check drift against baseline (detailed diff)'
    }
    case 'check:status': {
      return 'Check drift against baseline (status only)'
    }
    case 'update': {
      return 'Update baseline snapshot'
    }
    case 'print:json': {
      return 'Print aggregated rules (JSON)'
    }
    case 'print:short': {
      return 'Print aggregated rules (short view)'
    }
    case 'config:json': {
      return 'Show effective runtime config (JSON)'
    }
    case 'config:short': {
      return 'Show effective runtime config (short view)'
    }
    case 'init': {
      return 'Initialize local configuration'
    }
    case 'help': {
      return 'Show CLI help'
    }
    default: {
      return commandLabel
    }
  }
}

function formatConfigSource(cwd: string, configPath: string | undefined): string {
  if (!configPath) {
    return 'built-in defaults'
  }

  const rel = normalizePath(path.relative(cwd, configPath))
  if (path.basename(configPath) === 'package.json') {
    return `${rel} (eslint-config-snapshot field)`
  }

  return rel
}

function formatStoredSnapshotSummary(storedSnapshots: Map<string, StoredSnapshot>): string {
  if (storedSnapshots.size === 0) {
    return 'none'
  }

  const summary = summarizeStoredSnapshots(storedSnapshots)
  return `${summary.groups} groups, ${summary.rules} rules (severity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off)`
}

async function resolveGroupEslintVersions(cwd: string): Promise<GroupEslintVersions> {
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

function writeEslintVersionSummary(eslintVersionsByGroup: GroupEslintVersions): void {
  if (!shouldShowRunLogs() || eslintVersionsByGroup.size === 0) {
    return
  }

  const allVersions = new Set<string>()
  for (const versions of eslintVersionsByGroup.values()) {
    for (const version of versions) {
      allVersions.add(version)
    }
  }

  const sortedAllVersions = [...allVersions].sort((a, b) => a.localeCompare(b))
  if (sortedAllVersions.length === 1) {
    process.stdout.write(`- 🧩 eslint runtime: ${sortedAllVersions[0]} (all groups)\n`)
    return
  }

  process.stdout.write('- 🧩 eslint runtime by group:\n')
  const sortedEntries = [...eslintVersionsByGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [groupName, versions] of sortedEntries) {
    process.stdout.write(`  - ${groupName}: ${versions.join(', ')}\n`)
  }
}

function summarizeStoredSnapshots(snapshots: Map<string, StoredSnapshot>) {
  const { rules, error, warn, off } = countRuleSeverities([...snapshots.values()].map((snapshot) => snapshot.rules))
  return { groups: snapshots.size, rules, error, warn, off }
}

function countRuleSeverities(ruleObjects: RuleObject[]) {
  let rules = 0
  let error = 0
  let warn = 0
  let off = 0

  for (const rulesObject of ruleObjects) {
    for (const entry of Object.values(rulesObject)) {
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

  return { rules, error, warn, off }
}

function formatShortPrint(
  snapshots: Array<{
    groupId: string
    workspaces: string[]
    rules: RuleObject
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

function formatShortConfig(payload: {
  source: string
  workspaceInput: unknown
  workspaces: string[]
  grouping: { mode: string; allowEmptyGroups: boolean; groups: Array<{ name: string; workspaces: string[] }> }
  sampling: unknown
}): string {
  const lines: string[] = [
    `source: ${payload.source}`,
    `workspaces (${payload.workspaces.length}): ${payload.workspaces.join(', ') || '(none)'}`,
    `grouping mode: ${payload.grouping.mode} (allow empty: ${payload.grouping.allowEmptyGroups})`
  ]
  for (const group of payload.grouping.groups) {
    lines.push(`group ${group.name} (${group.workspaces.length}): ${group.workspaces.join(', ') || '(none)'}`)
  }
  lines.push(`workspaceInput: ${JSON.stringify(payload.workspaceInput)}`, `sampling: ${JSON.stringify(payload.sampling)}`)
  return `${lines.join('\n')}\n`
}
