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
} from '@eslint-config-snapshot/api'
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import fg from 'fast-glob'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'


const SNAPSHOT_DIR = '.eslint-config-snapshot'
const UPDATE_HINT = 'Tip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'

type BuiltSnapshot = Awaited<ReturnType<typeof buildSnapshot>>
type StoredSnapshot = Awaited<ReturnType<typeof readSnapshotFile>>
type SnapshotDiff = ReturnType<typeof diffSnapshots>
type CheckFormat = 'summary' | 'status' | 'diff'
type PrintFormat = 'json' | 'short'
type InitTarget = 'file' | 'package-json'
type InitPreset = 'minimal' | 'full'

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
    .command('init')
    .description('Initialize config (file or package.json)')
    .option('--target <target>', 'Config target: file|package-json', parseInitTarget)
    .option('--preset <preset>', 'Config preset: minimal|full', parseInitPreset)
    .option('-f, --force', 'Allow init even when an existing config is detected')
    .option('-y, --yes', 'Skip prompts and use defaults/options')
    .addHelpText(
      'after',
      `
Examples:
  $ eslint-config-snapshot init
    Runs interactive numbered prompts:
      target: 1) package-json, 2) file
      preset: 1) minimal, 2) full

  $ eslint-config-snapshot init --yes --target package-json --preset minimal
    Non-interactive minimal setup in package.json.

  $ eslint-config-snapshot init --yes --force --target file --preset full
    Overwrite-safe bypass when a config is already detected.
`
    )
    .action(async (opts: { target?: InitTarget; preset?: InitPreset; force?: boolean; yes?: boolean }) => {
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
  if (normalized === 'minimal' || normalized === 'full') {
    return normalized
  }

  throw new InvalidArgumentError('Expected one of: minimal, full')
}

async function executeCheck(cwd: string, format: CheckFormat, defaultInvocation = false): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
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
  const storedSnapshots = await loadStoredSnapshots(cwd)

  if (storedSnapshots.size === 0) {
    const summary = summarizeSnapshots(currentSnapshots)
    process.stdout.write(
      `Current rule state: ${summary.groups} groups, ${summary.rules} rules (severity mix: ${summary.error} errors, ${summary.warn} warnings, ${summary.off} off).\n`
    )

    const canPromptBaseline = defaultInvocation || format === 'summary'
    if (canPromptBaseline && process.stdin.isTTY && process.stdout.isTTY) {
      const shouldCreateBaseline = await askYesNo(
        'No baseline yet. Use current rule state as your baseline now? [Y/n] ',
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
      return 0
    }

    for (const change of changes) {
      process.stdout.write(`${formatDiff(change.groupId, change.diff)}\n`)
    }
    writeSubtleInfo(UPDATE_HINT)

    return 1
  }

  return printWhatChanged(changes, currentSnapshots)
}

async function executeUpdate(cwd: string, printSummary: boolean): Promise<number> {
  const foundConfig = await findConfigPath(cwd)
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
    process.stdout.write(`Baseline updated: ${summary.groups} groups, ${summary.rules} rules.\n`)
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

async function runInit(
  cwd: string,
  opts: { target?: InitTarget; preset?: InitPreset; force?: boolean; yes?: boolean } = {}
): Promise<number> {
  const force = opts.force ?? false
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
  const finalPreset = preset ?? 'minimal'

  if (finalTarget === 'package-json') {
    return runInitInPackageJson(cwd, finalPreset, force)
  }

  return runInitInFile(cwd, finalPreset, force)
}

async function askInitPreferences(): Promise<{ target: InitTarget; preset: InitPreset }> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const target = await askInitTarget(rl)
    const preset = await askInitPreset(rl)
    return { target, preset }
  } finally {
    rl.close()
  }
}

async function askInitTarget(rl: ReturnType<typeof createInterface>): Promise<InitTarget> {
  while (true) {
    const answer = await askQuestion(
      rl,
      'Select config target:\n  1) package-json (recommended)\n  2) file\nChoose [1]: '
    )
    const parsed = parseInitTargetChoice(answer)
    if (parsed) {
      return parsed
    }
    process.stdout.write('Please choose 1 (package-json) or 2 (file).\n')
  }
}

async function askInitPreset(rl: ReturnType<typeof createInterface>): Promise<InitPreset> {
  while (true) {
    const answer = await askQuestion(rl, 'Select preset:\n  1) minimal (recommended)\n  2) full\nChoose [1]: ')
    const parsed = parseInitPresetChoice(answer)
    if (parsed) {
      return parsed
    }
    process.stdout.write('Please choose 1 (minimal) or 2 (full).\n')
  }
}

export function parseInitTargetChoice(value: string): InitTarget | undefined {
  const normalized = value.trim().toLowerCase()
  if (normalized === '') {
    return 'package-json'
  }
  if (normalized === '1' || normalized === 'package-json' || normalized === 'packagejson' || normalized === 'package' || normalized === 'pkg') {
    return 'package-json'
  }
  if (normalized === '2' || normalized === 'file') {
    return 'file'
  }
  return undefined
}

export function parseInitPresetChoice(value: string): InitPreset | undefined {
  const normalized = value.trim().toLowerCase()
  if (normalized === '') {
    return 'minimal'
  }
  if (normalized === '1' || normalized === 'minimal' || normalized === 'min') {
    return 'minimal'
  }
  if (normalized === '2' || normalized === 'full') {
    return 'full'
  }
  return undefined
}

function askQuestion(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
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

async function runInitInFile(cwd: string, preset: InitPreset, force: boolean): Promise<number> {
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
  await writeFile(target, getConfigScaffold(preset), 'utf8')
  process.stdout.write(`Created ${path.basename(target)}\n`)
  return 0
}

async function runInitInPackageJson(cwd: string, preset: InitPreset, force: boolean): Promise<number> {
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

  parsed['eslint-config-snapshot'] = preset === 'full' ? getFullPresetObject() : {}
  await writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  process.stdout.write('Created config in package.json under "eslint-config-snapshot"\n')
  return 0
}

function getFullPresetObject() {
  return {
    workspaceInput: { mode: 'discover' },
    grouping: {
      mode: 'match',
      groups: [{ name: 'default', match: ['**/*'] }]
    },
    sampling: {
      maxFilesPerWorkspace: 8,
      includeGlobs: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
      excludeGlobs: ['**/node_modules/**', '**/dist/**'],
      hintGlobs: []
    }
  }
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
    process.stdout.write(color.green('Great news: no snapshot drift detected.\n'))
    process.stdout.write(
      `Baseline status: ${currentSummary.groups} groups, ${currentSummary.rules} rules (severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off).\n`
    )
    return 0
  }

  process.stdout.write(color.red('Heads up: snapshot drift detected.\n'))
  process.stdout.write(
    `Changed groups: ${changes.length} | introduced: ${changeSummary.introduced} | removed: ${changeSummary.removed} | severity: ${changeSummary.severity} | options: ${changeSummary.options} | workspace membership: ${changeSummary.workspace}\n`
  )
  process.stdout.write(
    `Current rules: ${currentSummary.rules} (severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off)\n\n`
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
  writeSubtleInfo(UPDATE_HINT)

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
    bold: (text: string) => wrap('1', text),
    dim: (text: string) => wrap('2', text)
  }
}

function writeSubtleInfo(text: string): void {
  const color = createColorizer()
  process.stdout.write(color.dim(text))
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
