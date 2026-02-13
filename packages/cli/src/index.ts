#!/usr/bin/env node
import {
  discoverWorkspaces,
  findConfigPath,
  getConfigScaffold,
  loadConfig,
  normalizePath
} from '@eslint-config-snapshot/api'
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import createDebug from 'debug'
import fg from 'fast-glob'
import { existsSync, readFileSync } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createInterface } from 'node:readline'

import {
  countUniqueWorkspaces,
  createColorizer,
  decorateDiffLine,
  formatCommandDisplayLabel,
  formatDiff,
  formatShortConfig,
  formatShortPrint,
  formatStoredSnapshotSummary,
  summarizeChanges,
  summarizeSnapshots
} from './output.js'
import {
  type BuiltSnapshot,
  compareSnapshotMaps,
  computeCurrentSnapshots,
  type GroupEslintVersions,
  loadStoredSnapshots,
  resolveGroupEslintVersions,
  resolveWorkspaceAssignments,
  type SnapshotDiff,
  type StoredSnapshot,
  type WorkspaceAssignments,
  writeSnapshots
} from './runtime.js'


const SNAPSHOT_DIR = '.eslint-config-snapshot'
const UPDATE_HINT = 'Tip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'

type CheckFormat = 'summary' | 'status' | 'diff'
type PrintFormat = 'json' | 'short'
type InitTarget = 'file' | 'package-json'
type InitPreset = 'recommended' | 'minimal' | 'full'

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
  const storedSnapshots = await loadStoredSnapshots(cwd, SNAPSHOT_DIR)

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
        await writeSnapshots(cwd, SNAPSHOT_DIR, currentSnapshots)
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
  const storedSnapshots = await loadStoredSnapshots(cwd, SNAPSHOT_DIR)
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
  await writeSnapshots(cwd, SNAPSHOT_DIR, currentSnapshots)

  if (printSummary) {
    const summary = summarizeSnapshots(currentSnapshots)
    const workspaceCount = countUniqueWorkspaces(currentSnapshots)
    const color = createColorizer()
    const eslintVersionsByGroup = shouldShowRunLogs() ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()
    writeSectionTitle('📊 Summary', color)
    process.stdout.write(
      `Baseline updated: ${summary.groups} groups, ${summary.rules} rules.\nWorkspaces scanned: ${workspaceCount}.\nSeverity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off.\n`
    )
    writeEslintVersionSummary(eslintVersionsByGroup)
  }

  return 0
}

async function executePrint(cwd: string, format: PrintFormat): Promise<void> {
  const foundConfig = await findConfigPath(cwd)
  const storedSnapshots = await loadStoredSnapshots(cwd, SNAPSHOT_DIR)
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
  const storedSnapshots = await loadStoredSnapshots(cwd, SNAPSHOT_DIR)
  writeRunContextHeader(cwd, `config:${format}`, foundConfig?.path, storedSnapshots)
  if (shouldShowRunLogs()) {
    writeSubtleInfo('⚙️ Resolving effective runtime configuration...\n')
  }
  const config = await loadConfig(cwd)
  const resolved: WorkspaceAssignments = await resolveWorkspaceAssignments(cwd, config)
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
      tokenHints: [
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
  const workspaceCount = countUniqueWorkspaces(currentSnapshots)
  const changeSummary = summarizeChanges(changes)

  if (changes.length === 0) {
    process.stdout.write(color.green('✅ Great news: no snapshot drift detected.\n'))
    writeSectionTitle('📊 Summary', color)
    process.stdout.write(
      `- 📦 baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- 🗂️ workspaces scanned: ${workspaceCount}\n- 🎚️ severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
    )
    writeEslintVersionSummary(eslintVersionsByGroup)
    return 0
  }

  process.stdout.write(color.red('⚠️ Heads up: snapshot drift detected.\n'))
  writeSectionTitle('📊 Summary', color)
  process.stdout.write(
    `- changed groups: ${changes.length}\n- introduced rules: ${changeSummary.introduced}\n- removed rules: ${changeSummary.removed}\n- severity changes: ${changeSummary.severity}\n- options changes: ${changeSummary.options}\n- workspace membership changes: ${changeSummary.workspace}\n- 🗂️ workspaces scanned: ${workspaceCount}\n- current baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- current severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
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
