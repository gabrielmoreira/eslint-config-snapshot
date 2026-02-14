#!/usr/bin/env node
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import createDebug from 'debug'
import path from 'node:path'

import { type CheckFormat, executeCheck } from './commands/check.js'
import { executeConfig, executePrint, type PrintFormat } from './commands/print.js'
import { executeUpdate } from './commands/update.js'
import { runInit } from './init.js'
import { resolveInvocationLabel, TerminalIO } from './terminal.js'

const SNAPSHOT_DIR = '.eslint-config-snapshot'

type InitTarget = 'file' | 'package-json'
type InitPreset = 'recommended' | 'minimal' | 'full'
type RootOptions = { update?: boolean }

const debugRun = createDebug('eslint-config-snapshot:run')
const debugTiming = createDebug('eslint-config-snapshot:timing')

export async function runCli(command: string | undefined, cwd: string, flags: string[] = []): Promise<number> {
  const argv = command ? [command, ...flags] : [...flags]
  return runArgv(argv, cwd)
}

export { buildRecommendedConfigFromAssignments } from './init.js'

async function runArgv(argv: string[], cwd: string): Promise<number> {
  const terminal = new TerminalIO()
  const invocationLabel = resolveInvocationLabel(argv)
  terminal.beginRun(invocationLabel)
  debugRun('start label=%s cwd=%s argv=%o', invocationLabel, cwd, argv)
  let exitCode = 1

  try {
    const hasCommandToken = argv.some((token) => !token.startsWith('-'))
    if (!hasCommandToken) {
      exitCode = await runDefaultInvocation(argv, cwd, terminal)
      return exitCode
    }

    let actionCode: number | undefined

    const program = createProgram(cwd, terminal, (code) => {
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
      terminal.error(`${message}\n`)
      return 1
    }

    exitCode = actionCode ?? 0
    debugRun('done label=%s exitCode=%d', invocationLabel, exitCode)
    return exitCode
  } finally {
    terminal.endRun(exitCode, (timer, elapsedMs) => {
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

async function runDefaultInvocation(argv: string[], cwd: string, terminal: TerminalIO): Promise<number> {
  const known = new Set(['-u', '--update', '-h', '--help'])
  for (const token of argv) {
    if (!known.has(token)) {
      terminal.error(`error: unknown option '${token}'\n`)
      return 1
    }
  }

  if (argv.includes('-h') || argv.includes('--help')) {
    const program = createProgram(cwd, terminal, () => {
      // no-op
    })
    program.outputHelp()
    return 0
  }

  if (argv.includes('-u') || argv.includes('--update')) {
    return executeUpdate(cwd, terminal, SNAPSHOT_DIR, true)
  }

  return executeCheck(cwd, 'summary', terminal, SNAPSHOT_DIR, true)
}

function createProgram(cwd: string, terminal: TerminalIO, onActionExit: (code: number) => void): Command {
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
      onActionExit(await executeCheck(cwd, opts.format, terminal, SNAPSHOT_DIR))
    })

  program
    .command('update')
    .alias('snapshot')
    .description('Compute and write snapshots to .eslint-config-snapshot/')
    .action(async () => {
      onActionExit(await executeUpdate(cwd, terminal, SNAPSHOT_DIR, true))
    })

  program
    .command('print')
    .description('Print aggregated rules')
    .option('--format <format>', 'Output format: json|short', parsePrintFormat, 'json')
    .option('--short', 'Alias for --format short')
    .action(async (opts: { format: PrintFormat; short?: boolean }) => {
      const format: PrintFormat = opts.short ? 'short' : opts.format
      onActionExit(await executePrint(cwd, terminal, SNAPSHOT_DIR, format))
    })

  program
    .command('config')
    .description('Print effective evaluated config')
    .option('--format <format>', 'Output format: json|short', parsePrintFormat, 'json')
    .option('--short', 'Alias for --format short')
    .action(async (opts: { format: PrintFormat; short?: boolean }) => {
      const format: PrintFormat = opts.short ? 'short' : opts.format
      onActionExit(await executeConfig(cwd, terminal, SNAPSHOT_DIR, format))
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
          runPromptWithPausedTimer: terminal.withPausedRunTimer.bind(terminal),
          writeStdout: terminal.write.bind(terminal),
          writeStderr: terminal.error.bind(terminal)
        })
      )
    })

  program
    .command('compare', { hidden: true })
    .action(async () => {
      onActionExit(await executeCheck(cwd, 'diff', terminal, SNAPSHOT_DIR))
    })

  program
    .command('status', { hidden: true })
    .action(async () => {
      onActionExit(await executeCheck(cwd, 'status', terminal, SNAPSHOT_DIR))
    })

  program
    .command('what-changed', { hidden: true })
    .action(async () => {
      onActionExit(await executeCheck(cwd, 'summary', terminal, SNAPSHOT_DIR))
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

export async function main(): Promise<void> {
  const code = await runArgv(process.argv.slice(2), process.cwd())
  process.exitCode = code
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
