#!/usr/bin/env node
import {
  findConfigPath,
  loadConfig
} from '@eslint-config-snapshot/api'
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import createDebug from 'debug'
import path from 'node:path'
import { createInterface } from 'node:readline'

import { runInit } from './init.js'
import {
  countUniqueWorkspaces,
  createColorizer,
  decorateDiffLine,
  formatDiff,
  formatShortConfig,
  formatShortPrint,
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
  type WorkspaceAssignments,
  writeSnapshots
} from './runtime.js'
import {
  beginRunTimer,
  endRunTimer,
  pauseRunTimer,
  resolveInvocationLabel,
  resumeRunTimer,
  runPromptWithPausedTimer,
  shouldShowRunLogs,
  writeEslintVersionSummary,
  writeRunContextHeader,
  writeSectionTitle,
  writeSubtleInfo
} from './ui.js'


const SNAPSHOT_DIR = '.eslint-config-snapshot'
const UPDATE_HINT = 'Tip: when you intentionally accept changes, run `eslint-config-snapshot --update` to refresh the baseline.\n'

type CheckFormat = 'summary' | 'status' | 'diff'
type PrintFormat = 'json' | 'short'
type InitTarget = 'file' | 'package-json'
type InitPreset = 'recommended' | 'minimal' | 'full'

type RootOptions = {
  update?: boolean
}
const debugRun = createDebug('eslint-config-snapshot:run')
const debugTiming = createDebug('eslint-config-snapshot:timing')

export async function runCli(command: string | undefined, cwd: string, flags: string[] = []): Promise<number> {
  const argv = command ? [command, ...flags] : [...flags]
  return runArgv(argv, cwd)
}

export { buildRecommendedConfigFromAssignments } from './init.js'

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
    endRunTimer(exitCode, (timer, elapsedMs) => {
      debugTiming(
        'command=%s exitCode=%d elapsedMs=%d pausedMs=%d',
        timer.label,
        exitCode,
        elapsedMs,
        timer.pausedMs
      )
    })
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
      onActionExit(
        await runInit(cwd, opts, {
          runPromptWithPausedTimer,
          writeStdout: (message) => {
            process.stdout.write(message)
          },
          writeStderr: (message) => {
            process.stderr.write(message)
          }
        })
      )
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
    const eslintVersionsByGroup = shouldShowRunLogs() ? await resolveGroupEslintVersions(cwd) : new Map<string, string[]>()
    writeSectionTitle('📊 Summary')
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
    writeSectionTitle('📊 Summary')
    process.stdout.write(
      `- 📦 baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- 🗂️ workspaces scanned: ${workspaceCount}\n- 🎚️ severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
    )
    writeEslintVersionSummary(eslintVersionsByGroup)
    return 0
  }

  process.stdout.write(color.red('⚠️ Heads up: snapshot drift detected.\n'))
  writeSectionTitle('📊 Summary')
  process.stdout.write(
    `- changed groups: ${changes.length}\n- introduced rules: ${changeSummary.introduced}\n- removed rules: ${changeSummary.removed}\n- severity changes: ${changeSummary.severity}\n- options changes: ${changeSummary.options}\n- workspace membership changes: ${changeSummary.workspace}\n- 🗂️ workspaces scanned: ${workspaceCount}\n- current baseline: ${currentSummary.groups} groups, ${currentSummary.rules} rules\n- current severity mix: ${currentSummary.error} errors, ${currentSummary.warn} warnings, ${currentSummary.off} off\n`
  )
  writeEslintVersionSummary(eslintVersionsByGroup)
  process.stdout.write('\n')

  writeSectionTitle('🧾 Changes')
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
